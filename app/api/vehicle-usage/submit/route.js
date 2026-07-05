import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { findVehicleById, vehicleDisplayName } from "../../../../lib/vehicleMaster";

export const runtime = "nodejs";

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

async function findDriverUser(db, decoded, payload) {
  let snap = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
  let doc = snap.docs[0] || null;
  let user = doc?.data() || null;
  const phoneDigits = String(payload?.phoneDigits || payload?.driverPhone || "").replace(/\D/g, "");
  const driverId = String(payload?.driverId || "").trim();

  if ((!user || user.role !== "driver") && phoneDigits) {
    doc = await db.collection("users_by_phone").doc(phoneDigits).get();
    user = doc.exists ? doc.data() || null : null;
  }
  if ((!user || user.role !== "driver") && driverId) {
    snap = await db.collection("users_by_phone").where("driverId", "==", driverId).limit(1).get();
    doc = snap.docs[0] || null;
    user = doc?.data() || null;
  }
  return { doc, user };
}

async function syncUsageToGoogle(payload) {
  const webAppUrl = process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
  if (!webAppUrl) return { ok: true, skipped: true };
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "appendUsageSegment", ...payload })
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: text || `HTTP ${response.status}` };
    try {
      return JSON.parse(text);
    } catch {
      return { ok: true, raw: text };
    }
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findLatestPreviousVehicleEvent(db, { vehicleId, serviceDate }) {
  const snap = await db.collection("vehicle_usage_events").where("vehicleId", "==", vehicleId).get();
  return snap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => !data.autoClosed && String(data.serviceDate || "") < serviceDate)
    .sort((a, b) => {
      const dateCompare = String(b.data.serviceDate || "").localeCompare(String(a.data.serviceDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return timestampMillis(b.data.createdAt || b.data.updatedAt) - timestampMillis(a.data.createdAt || a.data.updatedAt);
    })[0] || null;
}

function autoCloseDocId({ sourceEventId, startServiceDate }) {
  return `auto_end_${String(sourceEventId || "").replace(/[^A-Za-z0-9_-]/g, "_")}_${String(startServiceDate || "").replace(/[^0-9-]/g, "_")}`;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const { doc, user } = await findDriverUser(db, decoded, payload);
    if (!user || user.role !== "driver") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const vehicle = findVehicleById(payload?.vehicle?.id || payload?.vehicle?.assetCode || payload?.vehicleId);
    if (!vehicle) return Response.json({ ok: false, error: "Vehicle required" }, { status: 400 });

    const eventType = String(payload?.eventType || "").trim();
    if (!["start", "segment", "end"].includes(eventType)) {
      return Response.json({ ok: false, error: "Invalid eventType" }, { status: 400 });
    }

    const odometer = Number(payload?.odometer || 0);
    if (!Number.isFinite(odometer) || odometer <= 0) {
      return Response.json({ ok: false, error: "Odometer required" }, { status: 400 });
    }

    const odometerStart = Number(payload?.odometerStart || (eventType === "start" ? odometer : 0));
    if (eventType === "end" && odometerStart > 0 && odometer < odometerStart) {
      return Response.json({ ok: false, error: "End odometer must not be less than start odometer" }, { status: 400 });
    }

    const serviceDate = toServiceDateKey(new Date());
    const driverId = String(user.driverId || `driver_${user.phoneDigits || doc?.id || ""}`).trim();
    const profile = user.driverProfile || {};
    const driverName = String(
      payload?.driverName || user.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || ""
    ).trim();
    const driverPhone = String(payload?.driverPhone || user.phone || user.phoneDigits || "").trim();

    let autoClosed = null;
    if (eventType === "start") {
      const latestPrevious = await findLatestPreviousVehicleEvent(db, { vehicleId: vehicle.id, serviceDate });
      const previous = latestPrevious?.data || null;
      if (previous && String(previous.eventType || "") !== "end") {
        const autoEndRef = db.collection("vehicle_usage_events").doc(autoCloseDocId({
          sourceEventId: latestPrevious.doc.id,
          startServiceDate: serviceDate
        }));
        const existingAutoClose = await autoEndRef.get();
        if (existingAutoClose.exists) {
          autoClosed = {
            id: existingAutoClose.id,
            serviceDate: previous.serviceDate,
            eventType: "end",
            skippedDuplicate: true
          };
        } else {
          const previousStart = Number(previous.odometerStart || previous.odometer || 0);
          const warning = previousStart > 0 && odometer < previousStart
            ? "เลขไมล์เริ่มต้นครั้งใหม่ต่ำกว่าเลขไมล์เดิม กรุณาตรวจสอบ"
            : "";
          const autoEnd = {
            id: autoEndRef.id,
            serviceDate: String(previous.serviceDate || ""),
            eventType: "end",
            driverId: String(previous.driverId || ""),
            driverName: String(previous.driverName || ""),
            driverPhone: String(previous.driverPhone || ""),
            vehicleId: vehicle.id,
            assetCode: vehicle.assetCode,
            plate: vehicle.plate,
            vehicleName: vehicleDisplayName(vehicle),
            brand: vehicle.brand,
            model: vehicle.model,
            responsiblePerson: vehicle.responsiblePerson,
            department: vehicle.department,
            odometer,
            odometerStart: previousStart,
            usageType: "จบงานอัตโนมัติ",
            detail: "ระบบจบงานอัตโนมัติจากเลขไมล์เริ่มต้นครั้งถัดไป",
            note: warning || "ระบบจบงานอัตโนมัติจากเลขไมล์เริ่มต้นครั้งถัดไป",
            autoClosed: true,
            autoClosedFromEventId: latestPrevious.doc.id,
            autoClosedByStartServiceDate: serviceDate,
            autoClosedByDriverId: driverId,
            googleSyncStatus: "pending",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          };
          await autoEndRef.set(autoEnd, { merge: true });
          const autoGoogleSync = await syncUsageToGoogle({
            ...autoEnd,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          const autoGoogleSyncStatus = autoGoogleSync?.ok === false ? "failed" : (autoGoogleSync?.skipped ? "skipped" : "synced");
          await autoEndRef.set({
            googleSyncStatus: autoGoogleSyncStatus,
            googleSyncError: autoGoogleSync?.ok === false ? String(autoGoogleSync.error || "sync failed").slice(0, 500) : "",
            googleSyncedAt: autoGoogleSync?.skipped ? null : FieldValue.serverTimestamp()
          }, { merge: true });
          autoClosed = {
            id: autoEndRef.id,
            serviceDate: autoEnd.serviceDate,
            eventType: "end",
            googleSyncStatus: autoGoogleSyncStatus,
            warning
          };
        }
      }
    }

    const eventRef = db.collection("vehicle_usage_events").doc();
    const event = {
      id: eventRef.id,
      serviceDate,
      eventType,
      driverId,
      driverName,
      driverPhone,
      vehicleId: vehicle.id,
      assetCode: vehicle.assetCode,
      plate: vehicle.plate,
      vehicleName: vehicleDisplayName(vehicle),
      brand: vehicle.brand,
      model: vehicle.model,
      responsiblePerson: vehicle.responsiblePerson,
      department: vehicle.department,
      odometer,
      odometerStart,
      usageType: String(payload?.usageType || "").trim(),
      detail: String(payload?.detail || "").trim(),
      note: String(payload?.note || "").trim(),
      googleSyncStatus: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await eventRef.set(event, { merge: true });
    const googleSync = await syncUsageToGoogle({
      ...event,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const googleSyncStatus = googleSync?.ok === false ? "failed" : (googleSync?.skipped ? "skipped" : "synced");
    await eventRef.set({
      googleSyncStatus,
      googleSyncError: googleSync?.ok === false ? String(googleSync.error || "sync failed").slice(0, 500) : "",
      googleSyncedAt: googleSync?.skipped ? null : FieldValue.serverTimestamp()
    }, { merge: true });

    return Response.json({
      ok: true,
      data: {
        id: eventRef.id,
        serviceDate,
        eventType,
        googleSyncStatus,
        autoClosed
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 401 });
  }
}

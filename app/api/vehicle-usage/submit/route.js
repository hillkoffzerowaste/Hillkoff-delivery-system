import { FieldValue } from "firebase-admin/firestore";
import { after } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { findVehicleById, vehicleDisplayName } from "../../../../lib/vehicleMaster";
import { resolveVerifiedDriver } from "../../../../lib/driverIdentity";

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

async function syncUsageToGoogle(payload) {
  const webAppUrl = process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
  if (!webAppUrl) return { ok: true, skipped: true };
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "appendUsageSegment", ...payload }),
      signal: AbortSignal.timeout(6000)
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
  const snap = await db.collection("vehicle_usage_events").where("vehicleId", "==", vehicleId).limit(100).get();
  return snap.docs
    .map((doc) => ({ doc, data: doc.data() || {} }))
    .filter(({ data }) => !data.autoClosed && String(data.serviceDate || "") < serviceDate)
    .sort((a, b) => {
      const dateCompare = String(b.data.serviceDate || "").localeCompare(String(a.data.serviceDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return timestampMillis(b.data.createdAt || b.data.updatedAt) - timestampMillis(a.data.createdAt || a.data.updatedAt);
    })[0] || null;
}

function scheduleGoogleSync(ref, payload) {
  after(async () => {
    try {
      const result = await syncUsageToGoogle(payload);
      await ref.set({
        googleSyncStatus: result?.ok === false ? "failed" : (result?.skipped ? "skipped" : "synced"),
        googleSyncError: result?.ok === false ? String(result.error || "sync failed").slice(0, 500) : "",
        googleSyncedAt: result?.ok === false || result?.skipped ? null : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      await ref.set({ googleSyncStatus: "failed", googleSyncError: String(error?.message || error).slice(0, 500), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
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
    const identity = await resolveVerifiedDriver(db, decoded);
    const { doc, user } = identity || {};
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
          scheduleGoogleSync(autoEndRef, {
            ...autoEnd,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          autoClosed = {
            id: autoEndRef.id,
            serviceDate: autoEnd.serviceDate,
            eventType: "end",
            googleSyncStatus: "pending",
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
    scheduleGoogleSync(eventRef, {
      ...event,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      data: {
        id: eventRef.id,
        serviceDate,
        eventType,
        googleSyncStatus: "pending",
        autoClosed
      }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 401 });
  }
}

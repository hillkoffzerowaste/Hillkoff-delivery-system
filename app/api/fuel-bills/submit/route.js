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

async function syncFuelBillToGoogle(payload) {
  const webAppUrl = process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
  if (!webAppUrl) return { ok: true, skipped: true };
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "appendFuelBill", ...payload })
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

async function findDriverUser(db, decoded, payload) {
  let snap = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
  let doc = snap.docs[0] || null;
  let user = doc?.data() || null;
  const phoneDigits = String(payload?.phoneDigits || "").replace(/\D/g, "");
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

    const vehicle = findVehicleById(payload?.vehicle?.id || payload?.vehicle?.assetCode);
    if (!vehicle) return Response.json({ ok: false, error: "Vehicle required" }, { status: 400 });

    const odometer = Number(payload?.odometer || 0);
    const liters = Number(payload?.liters || 0);
    const amount = Number(payload?.amount || 0);
    const pricePerLiter = Number(payload?.pricePerLiter || 0);
    if (!Number.isFinite(odometer) || odometer <= 0) {
      return Response.json({ ok: false, error: "Odometer required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ ok: false, error: "Amount required" }, { status: 400 });
    }
    if (liters < 0 || pricePerLiter < 0) {
      return Response.json({ ok: false, error: "Invalid fuel values" }, { status: 400 });
    }

    const serviceDate = toServiceDateKey(new Date());
    const driverId = String(user.driverId || `driver_${user.phoneDigits || doc?.id || ""}`).trim();
    const profile = user.driverProfile || {};
    const driverName = String(user.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "").trim();
    const billRef = db.collection("fuel_bills").doc();
    const bill = {
      id: billRef.id,
      serviceDate,
      driverId,
      driverName,
      driverPhone: user.phone || user.phoneDigits || "",
      vehicleId: vehicle.id,
      assetCode: vehicle.assetCode,
      plate: vehicle.plate,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.brand,
      model: vehicle.model,
      vehicleName: vehicleDisplayName(vehicle),
      responsiblePerson: vehicle.responsiblePerson,
      department: vehicle.department,
      odometer,
      fuelType: String(payload?.fuelType || "").trim() || "ไม่ระบุ",
      liters,
      amount,
      pricePerLiter: pricePerLiter || (liters > 0 ? Number((amount / liters).toFixed(2)) : 0),
      station: String(payload?.station || "").trim(),
      receiptNo: String(payload?.receiptNo || "").trim(),
      note: String(payload?.note || "").trim(),
      googleSyncStatus: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    await billRef.set(bill, { merge: true });
    const googleSync = await syncFuelBillToGoogle({ ...bill, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await billRef.set({
      googleSyncStatus: googleSync?.ok === false ? "failed" : (googleSync?.skipped ? "skipped" : "synced"),
      googleSyncError: googleSync?.ok === false ? String(googleSync.error || "sync failed").slice(0, 500) : "",
      googleSyncedAt: googleSync?.skipped ? null : FieldValue.serverTimestamp()
    }, { merge: true });

    return Response.json({ ok: true, data: { id: billRef.id, serviceDate, googleSync } });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || String(error) }, { status: 401 });
  }
}

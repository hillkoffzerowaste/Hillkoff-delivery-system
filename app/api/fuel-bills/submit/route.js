import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { findVehicleById, vehicleDisplayName } from "../../../../lib/vehicleMaster";
import { resolveVerifiedDriver } from "../../../../lib/driverIdentity";
import { getMileageSheetUrl, postToGoogleAppsScript } from "../../../../lib/googleAppsScript";
import { errorResponse } from "../../../../lib/workflowAuth";

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
  return postToGoogleAppsScript(getMileageSheetUrl(), { action: "appendFuelBill", ...payload });
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

    const vehicle = findVehicleById(payload?.vehicle?.id || payload?.vehicle?.assetCode);
    if (!vehicle) return Response.json({ ok: false, error: "Vehicle required" }, { status: 400 });

    const odometer = Number(payload?.odometer || 0);
    const liters = Number(payload?.liters || 0);
    const amount = Number(payload?.amount || 0);
    const pricePerLiter = Number(payload?.pricePerLiter || 0);
    if (!Number.isFinite(odometer) || odometer <= 0 || odometer > 10_000_000) {
      return Response.json({ ok: false, error: "Odometer required" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      return Response.json({ ok: false, error: "Amount required" }, { status: 400 });
    }
    if (!Number.isFinite(liters) || liters <= 0 || liters > 10_000) {
      return Response.json({ ok: false, error: "Liters required" }, { status: 400 });
    }
    if (!Number.isFinite(pricePerLiter) || pricePerLiter < 0 || pricePerLiter > 100_000) {
      return Response.json({ ok: false, error: "Invalid fuel values" }, { status: 400 });
    }
    const effectivePricePerLiter = pricePerLiter || Number((amount / liters).toFixed(2));
    if (!Number.isFinite(effectivePricePerLiter) || effectivePricePerLiter > 100_000) {
      return Response.json({ ok: false, error: "Invalid fuel price" }, { status: 400 });
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
      fuelType: String(payload?.fuelType || "").trim().slice(0, 100) || "ไม่ระบุ",
      liters,
      amount,
      pricePerLiter: effectivePricePerLiter,
      station: String(payload?.station || "").trim().slice(0, 200),
      receiptNo: String(payload?.receiptNo || "").trim().slice(0, 100),
      note: String(payload?.note || "").trim().slice(0, 2000),
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

    return Response.json({
      ok: true,
      data: {
        id: billRef.id,
        serviceDate,
        googleSyncStatus: googleSync?.ok === false ? "failed" : (googleSync?.skipped ? "skipped" : "synced")
      }
    });
  } catch (error) {
    if (String(error?.code || "").startsWith("auth/")) {
      return Response.json({ ok: false, error: "Invalid or expired authentication token" }, { status: 401 });
    }
    return errorResponse(error);
  }
}

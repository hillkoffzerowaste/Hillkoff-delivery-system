import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { findVehicleById, vehicleDisplayName } from "../../../../lib/vehicleMaster";
import { resolveVerifiedDriver } from "../../../../lib/driverIdentity";

export const runtime = "nodejs";

const DAILY_CHECK_IDS = new Set(["coolant", "engineOil", "leakage", "warningLights"]);
const WEEKLY_CHECK_IDS = new Set(["0", "1", "2", "3", "4", "5", "6"]);

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

function toWeekKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const bangkokDate = new Date(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date));
  const day = bangkokDate.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  bangkokDate.setUTCDate(bangkokDate.getUTCDate() + diffToMonday);
  return toServiceDateKey(bangkokDate);
}

async function syncMileageToGoogle(payload) {
  const webAppUrl = process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
  if (!webAppUrl) return { ok: true, skipped: true };
  try {
    const response = await fetch(webAppUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "upsertDailyMileage", ...payload })
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
    const driverDoc = identity?.doc || null;
    const driverUser = identity?.user || null;
    const payloadDriverId = String(payload?.driverId || "").trim();

    if (!driverUser || driverUser.role !== "driver") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const assessmentType = String(payload?.assessmentType || "daily");
    if (!["daily", "weekly"].includes(assessmentType)) {
      return Response.json({ ok: false, error: "Invalid assessment type" }, { status: 400 });
    }

    const dailyChecks = payload?.dailyChecks && typeof payload.dailyChecks === "object" ? payload.dailyChecks : {};
    const weeklyChecks = payload?.weeklyChecks && typeof payload.weeklyChecks === "object" ? payload.weeklyChecks : {};
    const rawVehicle = payload?.vehicle && typeof payload.vehicle === "object" ? payload.vehicle : {};
    const vehicle = findVehicleById(rawVehicle.id || rawVehicle.assetCode) || null;
    const odometerStart = Number(payload?.odometerStart || 0);

    if (assessmentType === "daily") {
      const missing = [...DAILY_CHECK_IDS].filter((id) => !dailyChecks[id]);
      if (missing.length) {
        return Response.json({ ok: false, error: "Daily checks incomplete" }, { status: 400 });
      }
      if (!vehicle) {
        return Response.json({ ok: false, error: "Vehicle required" }, { status: 400 });
      }
      if (!Number.isFinite(odometerStart) || odometerStart <= 0) {
        return Response.json({ ok: false, error: "Odometer start required" }, { status: 400 });
      }
    }

    if (assessmentType === "weekly") {
      const missing = [...WEEKLY_CHECK_IDS].filter((id) => !weeklyChecks[id]);
      if (missing.length) {
        return Response.json({ ok: false, error: "Weekly checks incomplete" }, { status: 400 });
      }
    }

    const serviceDate = toServiceDateKey(new Date());
    const driverId = String(driverUser.driverId || `driver_${driverUser.phoneDigits || driverDoc?.id || ""}`).trim();
    if (payloadDriverId && payloadDriverId !== driverId) {
      return Response.json({ ok: false, error: "Driver mismatch" }, { status: 403 });
    }
    const docId = `${driverId}_${serviceDate}`;
    const profile = driverUser.driverProfile || {};
    const driverName = String(
      driverUser.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || ""
    ).trim();

    const commonAssessment = {
      driverId,
      driverName,
      driverPhone: driverUser.phone || driverUser.phoneDigits || "",
      notes: String(payload?.notes || "").trim(),
      readiness: "ready",
      updatedAt: FieldValue.serverTimestamp()
    };
    const vehiclePayload = vehicle ? {
      vehicleId: vehicle.id,
      assetCode: vehicle.assetCode,
      plate: vehicle.plate,
      vehicleType: vehicle.vehicleType,
      brand: vehicle.brand,
      model: vehicle.model,
      vehicleName: vehicleDisplayName(vehicle),
      responsiblePerson: vehicle.responsiblePerson,
      department: vehicle.department,
      vehicleChangedToday: Boolean(payload?.vehicleChangedToday),
      odometerStart
    } : {};

    if (assessmentType === "weekly") {
      const weekKey = toWeekKey(new Date());
      const weeklyDocId = `${driverId}_${weekKey}`;
      await db.collection("driver_weekly_assessments").doc(weeklyDocId).set({
        ...commonAssessment,
        weekKey,
        serviceDate,
        weeklyChecks,
        assessmentType: "weekly"
      }, { merge: true });
      await db.collection("driver_daily_assessments").doc(docId).set({
        ...commonAssessment,
        serviceDate,
        weeklyChecks,
        lastWeeklyAssessmentAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return Response.json({ ok: true, data: { id: weeklyDocId, serviceDate, weekKey, driverId, assessmentType } });
    }

    await db.collection("driver_daily_assessments").doc(docId).set({
      ...commonAssessment,
      ...vehiclePayload,
      serviceDate,
      dailyChecks,
      weeklyChecks,
      assessmentType: "daily",
      googleSyncStatus: "pending"
    }, { merge: true });

    const googleSync = await syncMileageToGoogle({
      serviceDate,
      driverId,
      driverName,
      driverPhone: commonAssessment.driverPhone,
      notes: commonAssessment.notes,
      ...vehiclePayload
    });
    await db.collection("driver_daily_assessments").doc(docId).set({
      googleSyncStatus: googleSync?.ok === false ? "failed" : (googleSync?.skipped ? "skipped" : "synced"),
      googleSyncError: googleSync?.ok === false ? String(googleSync.error || "sync failed").slice(0, 500) : "",
      googleSyncedAt: googleSync?.skipped ? null : FieldValue.serverTimestamp()
    }, { merge: true });

    return Response.json({
      ok: true,
      data: {
        id: docId,
        serviceDate,
        driverId,
        assessmentType,
        googleSyncStatus: googleSync?.ok === false ? "failed" : (googleSync?.skipped ? "skipped" : "synced")
      }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

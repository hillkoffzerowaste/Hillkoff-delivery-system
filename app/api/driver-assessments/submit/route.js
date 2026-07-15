import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { findVehicleById, vehicleDisplayName } from "../../../../lib/vehicleMaster";
import { resolveVerifiedDriver } from "../../../../lib/driverIdentity";
import { getMileageSheetUrl, postToGoogleAppsScript } from "../../../../lib/googleAppsScript";
import { errorResponse } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const DAILY_CHECK_IDS = new Set(["coolant", "engineOil", "leakage", "warningLights"]);
const WEEKLY_CHECK_IDS = new Set(["0", "1", "2", "3", "4", "5", "6"]);

function cleanChecks(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries([...allowed].map((id) => [id, value[id] === true]));
}

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
  return postToGoogleAppsScript(getMileageSheetUrl(), { action: "upsertDailyMileage", ...payload });
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

    const dailyChecks = cleanChecks(payload?.dailyChecks, DAILY_CHECK_IDS);
    const weeklyChecks = cleanChecks(payload?.weeklyChecks, WEEKLY_CHECK_IDS);
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
      if (!Number.isFinite(odometerStart) || odometerStart <= 0 || odometerStart > 10_000_000) {
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
      notes: String(payload?.notes || "").trim().slice(0, 2000),
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
    if (String(e?.code || "").startsWith("auth/")) {
      return Response.json({ ok: false, error: "Invalid or expired authentication token" }, { status: 401 });
    }
    return errorResponse(e);
  }
}

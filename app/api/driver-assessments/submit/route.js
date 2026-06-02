import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

const DAILY_CHECK_IDS = new Set(["coolant", "engineOil", "leakage", "warningLights"]);

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
    const driverSnap = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
    const driverUser = driverSnap.docs[0]?.data() || null;
    if (!driverUser || driverUser.role !== "driver") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const dailyChecks = payload?.dailyChecks && typeof payload.dailyChecks === "object" ? payload.dailyChecks : {};
    const missing = [...DAILY_CHECK_IDS].filter((id) => !dailyChecks[id]);
    if (missing.length) {
      return Response.json({ ok: false, error: "Daily checks incomplete" }, { status: 400 });
    }

    const serviceDate = toServiceDateKey(new Date());
    const driverId = String(driverUser.driverId || `driver_${driverUser.phoneDigits || driverSnap.docs[0].id}`).trim();
    const docId = `${driverId}_${serviceDate}`;
    const profile = driverUser.driverProfile || {};
    const driverName = String(
      driverUser.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || ""
    ).trim();

    const assessment = {
      driverId,
      driverName,
      driverPhone: driverUser.phone || driverUser.phoneDigits || "",
      serviceDate,
      dailyChecks,
      weeklyChecks: payload?.weeklyChecks && typeof payload.weeklyChecks === "object" ? payload.weeklyChecks : {},
      notes: String(payload?.notes || "").trim(),
      readiness: "ready",
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection("driver_daily_assessments").doc(docId).set(assessment, { merge: true });

    return Response.json({ ok: true, data: { id: docId, serviceDate, driverId } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

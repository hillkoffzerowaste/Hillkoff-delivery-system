import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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
  const serviceDate = String(payload?.serviceDate || toServiceDateKey(new Date()));
  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const salesSnap = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
    const salesUser = salesSnap.docs[0]?.data() || null;
    if (!salesUser || salesUser.role !== "sales") {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [driversSnap, assessmentsSnap] = await Promise.all([
      db.collection("users_by_phone").where("role", "==", "driver").get(),
      db.collection("driver_daily_assessments").where("serviceDate", "==", serviceDate).get()
    ]);

    const drivers = driversSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const profile = data.driverProfile || {};
      const name = data.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || data.phone || doc.id;
      return {
        id: data.driverId || `driver_${data.phoneDigits || doc.id}`,
        name,
        phone: data.phone || data.phoneDigits || "",
        plate: profile.plate || "",
        zone: profile.zone || "",
        vehicle: profile.vehicle || ""
      };
    });

    const assessments = assessmentsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    return Response.json({ ok: true, data: { serviceDate, drivers, assessments } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

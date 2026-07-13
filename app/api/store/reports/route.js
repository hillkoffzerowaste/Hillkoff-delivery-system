import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const REPORT_TYPES = ["outstation", "online"];
const REPORT_STATUSES = ["draft", "saved", "waiting", "partial"];

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

export async function GET(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "admin"]);
    const type = new URL(request.url).searchParams.get("type");
    if (type && !REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    const snap = await db.collection("store_reports").orderBy("createdAt", "desc").limit(500).get();
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => !type || item.type === type);
    return Response.json({ ok: true, data, requestedBy: profile.name || profile.email });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const type = clean(body?.type, 30);
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    if (!rows.length || rows.length > 50) return Response.json({ ok: false, error: "Add 1 to 50 report rows" }, { status: 400 });

    const now = new Date().toISOString();
    const draft = Boolean(body?.draft);
    const batch = db.batch();
    const saved = [];
    for (const row of rows) {
      const bookingNumber = clean(row?.bookingNumber, 100);
      const detail = clean(row?.detail, 1000);
      const note = clean(row?.note, 1000);
      const status = REPORT_STATUSES.includes(row?.status) ? row.status : (draft ? "draft" : "saved");
      if (!bookingNumber && !detail && !note) continue;
      const ref = db.collection("store_reports").doc();
      const item = { type, bookingNumber, detail, note, status, confirmedAt: draft ? "" : now, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email, createdByUid: profile.uid };
      batch.set(ref, item);
      saved.push({ id: ref.id, ...item });
    }
    if (!saved.length) return Response.json({ ok: false, error: "Enter at least one report row" }, { status: 400 });
    await batch.commit();
    return Response.json({ ok: true, data: saved });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.slice(0, 50).map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!ids.length) return Response.json({ ok: false, error: "No report rows selected" }, { status: 400 });
    const refs = ids.map((id) => db.collection("store_reports").doc(id));
    const snapshots = await db.getAll(...refs);
    const now = new Date().toISOString();
    const batch = db.batch();
    let updated = 0;
    snapshots.forEach((snap) => {
      const item = snap.data();
      if (!snap.exists || item?.createdByUid !== profile.uid) return;
      batch.update(snap.ref, { status: item.status === "draft" ? "saved" : item.status, confirmedAt: now, updatedAt: now, confirmedBy: profile.name || profile.email });
      updated += 1;
    });
    if (!updated) return Response.json({ ok: false, error: "No permitted report rows found" }, { status: 403 });
    await batch.commit();
    return Response.json({ ok: true, data: { ids: ids.slice(0, updated), confirmedAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

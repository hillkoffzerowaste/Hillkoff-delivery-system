import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const REPORT_TYPES = ["outstation", "online"];
const REPORT_STATUSES = ["draft", "saved", "waiting", "partial"];

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDocId(value) {
  return Boolean(value) && value.length <= 200 && !value.includes("/");
}

function bangkokDateKey(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function utcRangeForBangkokDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const startMs = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(startMs) || bangkokDateKey(startMs) !== date) return null;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000 - 1).toISOString()
  };
}

function reportLog(ref, event, profile, now, before = null, after = null, reason = "") {
  return {
    event, at: now, by: profile.name || profile.email, byUid: profile.uid,
    reason: clean(reason, 1000), before, after
  };
}

export async function GET(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "pack", "admin"]);
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    if (profile.role === "pack" && type !== "online") return Response.json({ ok: false, error: "Pack can view online reports only" }, { status: 403 });
    const date = params.get("date");
    const id = clean(params.get("id"), 200);
    const queryText = clean(params.get("q"), 200).toLowerCase();
    const includeDeleted = params.get("includeDeleted") === "true";
    if (id) {
      if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
      const ref = db.collection("store_reports").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
      if (profile.role === "pack" && snap.data()?.type !== "online") return Response.json({ ok: false, error: "Pack can view online reports only" }, { status: 403 });
      const history = await ref.collection("history").orderBy("at", "desc").limit(100).get();
      return Response.json({ ok: true, data: { id: snap.id, ...snap.data(), history: history.docs.map((doc) => ({ id: doc.id, ...doc.data() })) } });
    }
    if (type && !REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    const dateRange = date ? utcRangeForBangkokDate(date) : null;
    if (date && !dateRange) return Response.json({ ok: false, error: "Invalid report date" }, { status: 400 });
    let query = db.collection("store_reports").orderBy("createdAt", "desc");
    if (dateRange) query = query.startAt(dateRange.end).endAt(dateRange.start);
    const snap = await query.limit(500).get();
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => {
      if (type && item.type !== type) return false;
      if (!includeDeleted && item.deletedAt) return false;
      if (!queryText) return true;
      return [item.bookingNumber, item.detail, item.note, item.status, item.createdBy].join(" ").toLowerCase().includes(queryText);
    });
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
      const item = { type, serviceDate: bangkokDateKey(now), bookingNumber, detail, note, status, packStatus: type === "online" ? "pending" : "", confirmedAt: draft ? "" : now, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email, createdByUid: profile.uid };
      batch.set(ref, item);
      batch.set(ref.collection("history").doc(), reportLog(ref, draft ? "created_draft" : "created", profile, now, null, item));
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
    const { profile, db } = await requireProfile(request, ["store", "pack"]);
    const body = await request.json();
    if (profile.role === "pack") {
      const id = clean(body?.id, 200);
      const packStatus = ["checked", "partial", "returned"].includes(body?.packStatus) ? body.packStatus : "";
      if (!validDocId(id) || !packStatus) return Response.json({ ok: false, error: "Invalid online pack update" }, { status: 400 });
      const ref = db.collection("store_reports").doc(id); const snap = await ref.get();
      if (!snap.exists || snap.data().type !== "online") return Response.json({ ok: false, error: "Online report not found" }, { status: 404 });
      const item = snap.data(); const now = new Date().toISOString(); const reason = clean(body?.reason, 1000);
      if (packStatus === "returned" && !reason) return Response.json({ ok: false, error: "Provide return reason" }, { status: 400 });
      const patch = { packStatus, packUpdatedAt: now, packUpdatedBy: profile.name || profile.email, returnReason: packStatus === "returned" ? reason : "", status: packStatus === "returned" ? "waiting" : packStatus === "partial" ? "partial" : "saved", updatedAt: now };
      const batch = db.batch();
      batch.set(ref, patch, { merge: true });
      batch.set(ref.collection("history").doc(), reportLog(ref, `pack_${packStatus}`, profile, now, item, { ...item, ...patch }, reason));
      await batch.commit();
      return Response.json({ ok: true, data: { id, ...item, ...patch } });
    }
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.slice(0, 50).map((id) => String(id || "").trim()).filter(validDocId))] : [];
    const type = clean(body?.type, 30);
    const date = clean(body?.date, 10);
    if (!ids.length) return Response.json({ ok: false, error: "No report rows selected" }, { status: 400 });
    if (!REPORT_TYPES.includes(type)) return Response.json({ ok: false, error: "Invalid report type" }, { status: 400 });
    if (!utcRangeForBangkokDate(date)) return Response.json({ ok: false, error: "Invalid report date" }, { status: 400 });
    const refs = ids.map((id) => db.collection("store_reports").doc(id));
    const snapshots = await db.getAll(...refs);
    const now = new Date().toISOString();
    const batch = db.batch();
    let updated = 0;
    const updatedIds = [];
    snapshots.forEach((snap) => {
      if (!snap.exists) return;
      const item = snap.data();
      if (item.type !== type || String(item.serviceDate || bangkokDateKey(item.createdAt)) !== date) return;
      const after = { ...item, status: item.status === "draft" ? "saved" : item.status, confirmedAt: now, updatedAt: now, confirmedBy: profile.name || profile.email };
      batch.update(snap.ref, after);
      batch.set(snap.ref.collection("history").doc(), reportLog(snap.ref, "confirmed", profile, now, item, after));
      updated += 1;
      updatedIds.push(snap.id);
    });
    if (!updated) return Response.json({ ok: false, error: "No permitted report rows found" }, { status: 403 });
    await batch.commit();
    return Response.json({ ok: true, data: { ids: updatedIds, confirmedAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
    const ref = db.collection("store_reports").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    const item = snap.data();
    if (!REPORT_TYPES.includes(item.type) || item.deletedAt || (item.createdByUid && item.createdByUid !== profile.uid)) return Response.json({ ok: false, error: "This report cannot be edited" }, { status: 403 });
    const status = REPORT_STATUSES.includes(body?.status) ? body.status : item.status;
    const updatedAt = new Date().toISOString();
    const reason = clean(body?.reason, 1000);
    if (item.confirmedAt && !reason) return Response.json({ ok: false, error: "Provide an edit reason for a confirmed report" }, { status: 400 });
    const patch = { bookingNumber: clean(body?.bookingNumber, 100), detail: clean(body?.detail, 1000), note: clean(body?.note, 1000), status, updatedAt, updatedBy: profile.name || profile.email };
    const batch = db.batch();
    batch.set(ref, patch, { merge: true });
    batch.set(ref.collection("history").doc(), reportLog(ref, "updated", profile, updatedAt, item, { ...item, ...patch }, reason));
    await batch.commit();
    return Response.json({ ok: true, data: { id, ...item, ...patch } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await request.json();
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return Response.json({ ok: false, error: "Invalid report id" }, { status: 400 });
    const ref = db.collection("store_reports").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Report not found" }, { status: 404 });
    const item = snap.data();
    if (!REPORT_TYPES.includes(item.type) || item.deletedAt || (item.createdByUid && item.createdByUid !== profile.uid)) return Response.json({ ok: false, error: "This report cannot be deleted" }, { status: 403 });
    const now = new Date().toISOString();
    const reason = clean(body?.reason, 1000);
    if (item.confirmedAt && !reason) return Response.json({ ok: false, error: "Provide a delete reason for a confirmed report" }, { status: 400 });
    const patch = { deletedAt: now, deletedBy: profile.name || profile.email, deleteReason: reason, updatedAt: now };
    const batch = db.batch();
    batch.set(ref, patch, { merge: true });
    batch.set(ref.collection("history").doc(), reportLog(ref, "deleted", profile, now, item, { ...item, ...patch }, reason));
    await batch.commit();
    return Response.json({ ok: true, data: { id, ...item, ...patch } });
  } catch (error) { return errorResponse(error); }
}

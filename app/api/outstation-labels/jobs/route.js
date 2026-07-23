import { sanitizePrintJob, sanitizePrintStatusPatch } from "../../../../lib/outstationLabelStorage";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const JOBS = "outstation_label_jobs";
const WRITE_CHUNK_SIZE = 400;

function cleanJobId(value) {
  const id = String(value || "").trim().toLowerCase().slice(0, 160);
  if (!/^[a-z0-9._-]{8,160}$/.test(id)) throw Object.assign(new Error("Invalid print job id"), { status: 400 });
  return id;
}

async function parseJson(request) {
  try { return await request.json(); }
  catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

function actorFields(profile) {
  return {
    uid: profile.uid,
    name: String(profile.name || profile.email || "").slice(0, 200),
    role: profile.role
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const params = new URL(request.url).searchParams;
    const rawJobId = params.get("jobId");
    if (!rawJobId) {
      const snap = await db.collection(JOBS).orderBy("createdAt", "desc").limit(50).get();
      return Response.json({ ok: true, data: snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) })) });
    }
    const jobId = cleanJobId(rawJobId);
    const ref = db.collection(JOBS).doc(jobId);
    const [jobSnap, itemSnap] = await Promise.all([
      ref.get(),
      ref.collection("items").orderBy("ordinal", "asc").limit(10_000).get()
    ]);
    if (!jobSnap.exists) return Response.json({ ok: false, error: "Print job not found" }, { status: 404 });
    return Response.json({
      ok: true,
      data: {
        id: jobSnap.id,
        ...(jobSnap.data() || {}),
        items: itemSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const payload = await parseJson(request);
    let job;
    try { job = sanitizePrintJob(payload); }
    catch (error) { throw Object.assign(error, { status: 400 }); }
    const jobRef = db.collection(JOBS).doc(job.idempotencyKey);
    const now = new Date().toISOString();
    const actor = actorFields(profile);
    const orderIds = [...new Set(job.items.map(item => item.orderId))];
    const transactionResult = await db.runTransaction(async transaction => {
      const current = await transaction.get(jobRef);
      if (current.exists) return { created: false, data: current.data() || {} };
      const summary = {
        status: "creating",
        itemCount: job.items.length,
        pageCount: Math.ceil(job.items.length / 5),
        orderCount: orderIds.length,
        orderIds,
        createdAt: now,
        createdByUid: actor.uid,
        createdByName: actor.name
      };
      transaction.create(jobRef, summary);
      return { created: true, data: summary };
    });
    if (!transactionResult.created) {
      return Response.json({ ok: true, data: { id: jobRef.id, ...transactionResult.data, alreadyExists: true } });
    }

    for (let start = 0; start < job.items.length; start += WRITE_CHUNK_SIZE) {
      const batch = db.batch();
      job.items.slice(start, start + WRITE_CHUNK_SIZE).forEach((item, offset) => {
        const ordinal = start + offset;
        batch.set(jobRef.collection("items").doc(String(ordinal + 1).padStart(6, "0")), { ...item, ordinal });
      });
      await batch.commit();
    }
    const readyAt = new Date().toISOString();
    await jobRef.update({ status: "ready", readyAt });
    await jobRef.collection("events").add({ action: "created", at: readyAt, ...actor });
    return Response.json({ ok: true, data: { id: jobRef.id, ...transactionResult.data, status: "ready", readyAt } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const payload = await parseJson(request);
    const jobId = cleanJobId(payload?.jobId);
    let patch;
    try { patch = sanitizePrintStatusPatch(payload); }
    catch (error) { throw Object.assign(error, { status: 400 }); }
    const ref = db.collection(JOBS).doc(jobId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Print job not found" }, { status: 404 });
    const now = new Date().toISOString();
    const actor = actorFields(profile);
    const batch = db.batch();
    batch.update(ref, {
      status: patch.status,
      updatedAt: now,
      [`${patch.status}At`]: now,
      [`${patch.status}ByUid`]: actor.uid,
      [`${patch.status}ByName`]: actor.name,
      ...(patch.reason ? { statusReason: patch.reason } : {})
    });
    batch.set(ref.collection("events").doc(), { action: patch.status, reason: patch.reason, at: now, ...actor });
    await batch.commit();
    return Response.json({ ok: true, data: { id: jobId, ...patch, updatedAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

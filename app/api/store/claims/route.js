import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { CLAIM_KINDS, IMPORT_DOCUMENT_MAX, STORE_CLAIMS_COLLECTION, claimDocId, recordHistory, validateClaimDocument } from "../../../../lib/storeClaimsProduction.js";
import { fail, publicRecord, readBody, readRange, readSettings, requestRange, validDocId } from "../../../../lib/storeRecordRoute.js";

export const runtime = "nodejs";

// GET ?from&to[&kind] — store/admin read the live claim documents of a date range.
export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const range = requestRange(params);
    const kind = params.get("kind") || "";
    if (kind && !CLAIM_KINDS[kind]) throw fail("ประเภทเคลมไม่ถูกต้อง");
    const rows = (await readRange(db, STORE_CLAIMS_COLLECTION, range)).filter((row) => !kind || row.kind === kind);
    rows.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.documentNumber.localeCompare(b.documentNumber));
    return Response.json({ ok: true, data: { from: range.from, to: range.to, items: rows.map(publicRecord) } });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST { documents: [...] } — 1 to 50 documents (one form, or rows pasted from the ERP export).
// Each kind + document number is stored once; numbers already saved are skipped and reported back.
export async function POST(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const input = Array.isArray(body.documents) ? body.documents : [];
    if (!input.length || input.length > IMPORT_DOCUMENT_MAX) throw fail(`ส่งได้ครั้งละ 1–${IMPORT_DOCUMENT_MAX} เอกสาร`);
    const settings = await readSettings(db);
    const values = [];
    const seen = new Set();
    for (const [index, raw] of input.entries()) {
      const checked = validateClaimDocument(raw, { settings });
      if (!checked.ok) throw fail(input.length > 1 ? `เอกสารที่ ${index + 1}${raw?.documentNumber ? ` (${raw.documentNumber})` : ""}: ${checked.error}` : checked.error);
      const id = claimDocId(checked.value.kind, checked.value.documentNumber);
      if (seen.has(id)) throw fail(`เลขที่เอกสาร ${checked.value.documentNumber} ซ้ำกันในรายการที่ส่ง`);
      seen.add(id);
      values.push({ id, value: checked.value });
    }
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (tx) => {
      const refs = values.map(({ id }) => db.collection(STORE_CLAIMS_COLLECTION).doc(id));
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      const created = [];
      const skipped = [];
      values.forEach(({ id, value }, i) => {
        const old = snaps[i].exists ? snaps[i].data() : null;
        if (old && !old.deletedAt) { skipped.push(value.documentNumber); return; }
        const doc = { ...value, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email || "", createdByUid: profile.uid, deletedAt: "", history: [...(old?.history || []), recordHistory(old ? "recreated" : "created", profile, now)] };
        tx.set(refs[i], doc);
        created.push(publicRecord({ ...doc, id }));
      });
      return { created, skipped };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH { id, baseUpdatedAt, document } — replace the content; kind and number stay.
export async function PATCH(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    if (!validDocId(body.id)) throw fail("ไม่พบเอกสาร", 404);
    const settings = await readSettings(db);
    const ref = db.collection(STORE_CLAIMS_COLLECTION).doc(body.id);
    const now = new Date().toISOString();
    const saved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists ? snap.data() : null;
      if (!old || old.deletedAt) throw fail("ไม่พบเอกสาร", 404);
      if (old.updatedAt !== body.baseUpdatedAt) throw fail("เอกสารถูกแก้ไขไปแล้ว กรุณาโหลดใหม่", 409);
      const checked = validateClaimDocument(body.document, { settings, keep: old });
      if (!checked.ok) throw fail(checked.error);
      const patch = { ...checked.value, updatedAt: now, updatedBy: profile.name || profile.email || "", updatedByUid: profile.uid, history: [...(old.history || []), recordHistory("updated", profile, now)] };
      tx.update(ref, patch);
      return publicRecord({ ...old, ...patch, id: body.id });
    });
    return Response.json({ ok: true, data: saved });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE { id, reason } — soft delete; the number can then be saved again.
export async function DELETE(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    if (!validDocId(body.id)) throw fail("ไม่พบเอกสาร", 404);
    const reason = String(body.reason || "").trim();
    if (!reason) throw fail("กรุณาระบุเหตุผลที่ลบ");
    const ref = db.collection(STORE_CLAIMS_COLLECTION).doc(body.id);
    const now = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists ? snap.data() : null;
      if (!old || old.deletedAt) throw fail("ไม่พบเอกสาร", 404);
      tx.update(ref, { deletedAt: now, deletedBy: profile.name || profile.email || "", updatedAt: now, history: [...(old.history || []), recordHistory("deleted", profile, now, reason)] });
    });
    return Response.json({ ok: true, data: { id: body.id } });
  } catch (error) {
    return errorResponse(error);
  }
}

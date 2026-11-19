import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { STORE_PRODUCTION_COLLECTION, recordHistory, sameProductionRecord, validateProductionRecord } from "../../../../lib/storeClaimsProduction.js";
import { fail, publicRecord, readBody, readRange, readSettings, requestRange, validDocId } from "../../../../lib/storeRecordRoute.js";

export const runtime = "nodejs";
const RECORDS_PER_SAVE = 20;

// GET ?from&to[&branchCode] — store/admin read live production records of a date range.
export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const range = requestRange(params);
    const branchCode = String(params.get("branchCode") || "").toUpperCase();
    const rows = (await readRange(db, STORE_PRODUCTION_COLLECTION, range)).filter((row) => !branchCode || row.branchCode === branchCode);
    rows.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json({ ok: true, data: { from: range.from, to: range.to, items: rows.map(publicRecord) } });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST { records: [...] } — 1 to 20 production records (branch + date + product lines).
// `requestId` makes a retried save return the stored record instead of a duplicate.
export async function POST(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const input = Array.isArray(body.records) ? body.records : [];
    if (!input.length || input.length > RECORDS_PER_SAVE) throw fail(`ส่งได้ครั้งละ 1–${RECORDS_PER_SAVE} รายการผลิต`);
    const requestId = String(body.requestId || "");
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw fail("คำขอไม่ถูกต้อง กรุณาลองใหม่");
    const settings = await readSettings(db);
    const values = input.map((raw, index) => {
      const checked = validateProductionRecord(raw, { settings });
      if (!checked.ok) throw fail(input.length > 1 ? `รายการผลิตที่ ${index + 1}: ${checked.error}` : checked.error);
      return checked.value;
    });
    const now = new Date().toISOString();
    const created = await db.runTransaction(async (tx) => {
      const refs = values.map((_, index) => db.collection(STORE_PRODUCTION_COLLECTION).doc(`${requestId}_${index}`));
      const first = await tx.get(refs[0]);
      const conflict = () => fail("คำขอนี้ถูกใช้บันทึกข้อมูลอื่นไปแล้ว กรุณาโหลดหน้าใหม่แล้วบันทึกอีกครั้ง", 409);
      if (first.exists) {
        const storedCount = first.data().requestRecordCount;
        if (storedCount !== undefined && storedCount !== values.length) throw conflict();
        if (storedCount === undefined) {
          // Older saves predate batch metadata; inspect their bounded ID range before accepting a retry.
          const remaining = await Promise.all(Array.from({ length: RECORDS_PER_SAVE - 1 }, (_, i) => tx.get(db.collection(STORE_PRODUCTION_COLLECTION).doc(`${requestId}_${i + 1}`))));
          if (remaining.some((snap, i) => snap.exists !== (i + 1 < values.length))) throw conflict();
        }
      }
      const snaps = [first, ...await Promise.all(refs.slice(1).map((ref) => tx.get(ref)))];
      return values.map((value, index) => {
        if (snaps[index].exists) {
          const stored = snaps[index].data();
          if (stored.deletedAt || !sameProductionRecord(stored, value)) throw conflict();
          return publicRecord({ ...stored, id: refs[index].id });
        }
        if (first.exists) throw conflict();
        const doc = { ...value, requestRecordCount: values.length, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email || "", createdByUid: profile.uid, deletedAt: "", history: [recordHistory("created", profile, now)] };
        tx.set(refs[index], doc);
        return publicRecord({ ...doc, id: refs[index].id });
      });
    });
    return Response.json({ ok: true, data: { created } });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH { id, baseUpdatedAt, record }
export async function PATCH(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    if (!validDocId(body.id)) throw fail("ไม่พบรายการผลิต", 404);
    const settings = await readSettings(db);
    const ref = db.collection(STORE_PRODUCTION_COLLECTION).doc(body.id);
    const now = new Date().toISOString();
    const saved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists ? snap.data() : null;
      if (!old || old.deletedAt) throw fail("ไม่พบรายการผลิต", 404);
      if (old.updatedAt !== body.baseUpdatedAt) throw fail("รายการนี้ถูกแก้ไขไปแล้ว กรุณาโหลดใหม่", 409);
      const checked = validateProductionRecord(body.record, { settings, keep: old });
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

// DELETE { id, reason } — soft delete.
export async function DELETE(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    if (!validDocId(body.id)) throw fail("ไม่พบรายการผลิต", 404);
    const reason = String(body.reason || "").trim();
    if (!reason) throw fail("กรุณาระบุเหตุผลที่ลบ");
    const ref = db.collection(STORE_PRODUCTION_COLLECTION).doc(body.id);
    const now = new Date().toISOString();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const old = snap.exists ? snap.data() : null;
      if (!old || old.deletedAt) throw fail("ไม่พบรายการผลิต", 404);
      tx.update(ref, { deletedAt: now, deletedBy: profile.name || profile.email || "", updatedAt: now, history: [...(old.history || []), recordHistory("deleted", profile, now, reason)] });
    });
    return Response.json({ ok: true, data: { id: body.id } });
  } catch (error) {
    return errorResponse(error);
  }
}

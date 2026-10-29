import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokDateKey } from "../../../../lib/operationsReporting";
import { STORE_AUDITS_COLLECTION, nextAuditSequence, validateAuditInput } from "../../../../lib/storeAudit";
import { addDaysToDateKey, bangkokDayRange } from "../../../../lib/storeFormat";
import {
  STORE_DOCUMENT_COUNTERS_COLLECTION,
  STORE_DOCUMENT_REGISTRY_COLLECTION,
  STORE_SETTINGS_COLLECTION,
  STORE_SETTINGS_DOC_ID,
  documentBranchCode,
  documentCounterId,
  documentPeriodKey,
  documentRegistryId,
  findBranch,
  formatDocumentNumber,
  getActiveBranches,
  normalizeStoreSettings,
  parseDocumentSequence
} from "../../../../lib/storeSettings";

export const runtime = "nodejs";

const AUDIT_RANGE_MAX_DAYS = 62;
const AUDIT_READ_LIMIT = 2000;
const KIND = "audit";

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDocId(value) {
  return Boolean(value) && value.length <= 200 && !value.includes("/");
}

function fail(message, status) {
  return Object.assign(new Error(message), { status });
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw fail("ข้อมูลที่ส่งมาไม่ถูกต้อง", 400);
  }
}

function auditHistory(event, profile, now, { before = null, after = null, reason = "" } = {}) {
  return { event, at: now, by: profile.name || profile.email, byUid: profile.uid, reason: clean(reason, 1000), before, after };
}

function numberFor(cfg, sequence, branchCode, serviceDate) {
  return formatDocumentNumber({ prefix: cfg.prefix, pattern: cfg.pattern, digits: cfg.digits, sequence, branchCode, serviceDate });
}

// Finds the first free number after the counter. `read` is db.get or transaction.get so the same
// search serves the read-only preview and the transactional save.
async function findFreeNumber({ read, db, cfg, branchCode, serviceDate, counterLast }) {
  const taken = new Set();
  for (;;) {
    const sequence = nextAuditSequence(counterLast, taken);
    if (sequence === null) return null;
    const number = numberFor(cfg, sequence, branchCode, serviceDate);
    const registryRef = db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(documentRegistryId(KIND, number, { reset: cfg.reset, serviceDate, pattern: cfg.pattern }));
    const snap = await read(registryRef);
    if (!snap.exists) return { number, sequence };
    taken.add(sequence);
  }
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;

    if (params.get("next") === "true") {
      const serviceDate = bangkokDateKey(new Date());
      const settings = normalizeStoreSettings((await db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID).get()).data());
      const cfg = settings.documents.audit;
      const requested = clean(params.get("branchCode"), 20).toUpperCase();
      const branch = requested ? findBranch(settings, requested) : getActiveBranches(settings)[0];
      if (requested && (!branch || branch.active === false)) return Response.json({ ok: false, error: "สาขาไม่ถูกต้องหรือถูกปิดใช้งาน" }, { status: 400 });
      if (cfg.pattern === "branch" && !branch) return Response.json({ ok: true, data: { documentNumber: "" } });
      const counterSnap = await db.collection(STORE_DOCUMENT_COUNTERS_COLLECTION).doc(documentCounterId(KIND, { reset: cfg.reset, serviceDate })).get();
      const free = await findFreeNumber({
        read: (ref) => ref.get(), db, cfg, branchCode: branch?.code || "", serviceDate, counterLast: counterSnap.exists ? counterSnap.data()?.last : 0
      });
      return Response.json({ ok: true, data: { documentNumber: free?.number || "" } });
    }

    const from = clean(params.get("from"), 10);
    const to = clean(params.get("to"), 10);
    if (!bangkokDayRange(from) || !bangkokDayRange(to) || from > to || addDaysToDateKey(from, AUDIT_RANGE_MAX_DAYS - 1) < to) {
      return Response.json({ ok: false, error: "ช่วงวันที่ไม่ถูกต้อง" }, { status: 400 });
    }
    const includeDeleted = params.get("includeDeleted") === "true";
    const snap = await db.collection(STORE_AUDITS_COLLECTION)
      .where("serviceDate", ">=", from).where("serviceDate", "<=", to).orderBy("serviceDate").limit(AUDIT_READ_LIMIT + 1).get();
    if (snap.docs.length > AUDIT_READ_LIMIT) return Response.json({ ok: false, error: "ข้อมูลตรวจนับในช่วงนี้มากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง" }, { status: 422 });
    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((item) => includeDeleted || !item.deletedAt)
      .sort((a, b) => String(a.serviceDate).localeCompare(String(b.serviceDate)) || String(a.createdAt).localeCompare(String(b.createdAt)));
    return Response.json({ ok: true, data: { from, to, items } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const now = new Date().toISOString();
    const serviceDate = bangkokDateKey(now);
    const auditRef = db.collection(STORE_AUDITS_COLLECTION).doc();
    let saved = null;

    await db.runTransaction(async (transaction) => {
      // Settings are read inside the transaction so deleting a branch cannot race with a save.
      const settingsSnap = await transaction.get(db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID));
      const settings = normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() : undefined);
      const checked = validateAuditInput(body, { settings, profile });
      if (!checked.ok) throw fail(checked.error, checked.status);
      const cfg = settings.documents.audit;
      const { value } = checked;
      const periodKey = documentPeriodKey(cfg.reset, serviceDate);
      const counterRef = db.collection(STORE_DOCUMENT_COUNTERS_COLLECTION).doc(documentCounterId(KIND, { reset: cfg.reset, serviceDate }));
      const counterSnap = await transaction.get(counterRef);
      const counterLast = counterSnap.exists ? Number(counterSnap.data()?.last) || 0 : 0;

      let number = value.documentNumber;
      let sequence = null;
      if (number) {
        const registrySnap = await transaction.get(db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(documentRegistryId(KIND, number, { reset: cfg.reset, serviceDate, pattern: cfg.pattern })));
        if (registrySnap.exists) {
          // A number the form pre-filled may have been taken by someone else meanwhile: issue the next one instead.
          if (body.numberAuto !== true) throw fail(`เลขที่เอกสาร ${number} ถูกบันทึกแล้ว`, 409);
          number = "";
        } else {
          // Only a number that belongs to this period moves the counter (e.g. yymm digits must match today).
          const parsed = parseDocumentSequence(number, cfg);
          const branchPart = documentBranchCode(number, cfg);
          if (parsed !== null && numberFor(cfg, parsed, branchPart, serviceDate) === number) sequence = parsed;
        }
      }
      if (!number) {
        const free = await findFreeNumber({
          read: (ref) => transaction.get(ref), db, cfg, branchCode: value.branchCode, serviceDate, counterLast
        });
        if (!free) throw fail("ไม่สามารถสร้างเลขที่เอกสารได้ กรุณาลองใหม่อีกครั้ง", 409);
        number = free.number;
        sequence = free.sequence;
      }

      const registryId = documentRegistryId(KIND, number, { reset: cfg.reset, serviceDate, pattern: cfg.pattern });
      const doc = {
        ...value,
        documentNumber: number,
        serviceDate,
        registryId,
        createdAt: now,
        createdBy: profile.name || profile.email,
        createdByUid: profile.uid
      };
      transaction.set(auditRef, doc);
      transaction.set(auditRef.collection("history").doc(), auditHistory("created", profile, now, { after: doc }));
      transaction.create(db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(registryId), {
        kind: KIND, number, periodKey, sourceId: auditRef.id, createdAt: now, createdBy: doc.createdBy
      });
      if (sequence !== null && sequence > counterLast) {
        transaction.set(counterRef, { kind: KIND, periodKey, last: sequence, updatedAt: now });
      }
      saved = { id: auditRef.id, ...doc };
    });
    return Response.json({ ok: true, data: saved });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const id = clean(body.id, 200);
    if (!validDocId(id)) return Response.json({ ok: false, error: "ไม่พบเอกสารตรวจนับ" }, { status: 400 });
    const reason = clean(body.reason, 1000);
    if (!reason) return Response.json({ ok: false, error: "กรุณาระบุเหตุผลในการลบ" }, { status: 400 });
    const ref = db.collection(STORE_AUDITS_COLLECTION).doc(id);
    const now = new Date().toISOString();
    let result = null;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw fail("ไม่พบเอกสารตรวจนับ", 404);
      const item = snap.data();
      if (item.deletedAt) throw fail("เอกสารตรวจนับนี้ถูกลบไปแล้ว", 409);
      if (!item.createdByUid || item.createdByUid !== profile.uid) throw fail("ลบเอกสารตรวจนับนี้ไม่ได้", 403);
      const registryRef = item.registryId ? db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(item.registryId) : null;
      const registrySnap = registryRef ? await transaction.get(registryRef) : null;
      const patch = { deletedAt: now, deletedBy: profile.name || profile.email, deleteReason: reason };
      transaction.set(ref, patch, { merge: true });
      transaction.set(ref.collection("history").doc(), auditHistory("deleted", profile, now, { before: item, after: { ...item, ...patch }, reason }));
      // Release the number only if this audit still owns it, so it can be typed again.
      if (registrySnap?.exists && registrySnap.data()?.sourceId === id) transaction.delete(registryRef);
      result = { id, ...item, ...patch };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

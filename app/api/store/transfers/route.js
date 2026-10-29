import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokDateKey } from "../../../../lib/operationsReporting";
import { bangkokDayRange } from "../../../../lib/storeFormat";
import {
  STORE_DOCUMENT_REGISTRY_COLLECTION,
  STORE_SETTINGS_COLLECTION,
  STORE_SETTINGS_DOC_ID,
  documentPeriodKey,
  documentRegistryId,
  normalizeStoreSettings
} from "../../../../lib/storeSettings";
import {
  STORE_TRANSFERS_COLLECTION,
  applyTransferReopen,
  applyTransferResolve,
  buildTransferDoc,
  buildTransferHistoryEvent,
  filterTransfers,
  isBlankTransferRow,
  sortTransfersForDisplay,
  summarizeTransfers,
  validateTransferRow
} from "../../../../lib/storeTransfers";

export const runtime = "nodejs";

// Every read is a single-field query (no composite index); filtering and sorting happen in memory.
// A result that hits the cap answers 422 instead of silently dropping rows.
const MAX_ROWS = 50;
const DAY_LIMIT = 250;
const SEARCH_LIMIT = 100;
const ALERT_LIMIT = 200;
const ALERT_RETURN_LIMIT = 100;
const HISTORY_LIMIT = 200;
// Fields recorded in history "before/after" when a document is edited.
const EDIT_FIELDS = ["transferNumber", "requestRef", "fromBranchCode", "toBranchCode", "preparerUid", "preparerName", "receipt", "note", "issueState", "resolution", "resolvedServiceDate"];

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDocId(value) {
  return Boolean(value) && value.length <= 200 && !value.includes("/");
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function fail(error, status) {
  return Response.json({ ok: false, error }, { status });
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function pick(doc, fields) {
  return Object.fromEntries(fields.map((key) => [key, doc?.[key] ?? ""]));
}

function toItem(snap) {
  return { id: snap.id, ...snap.data() };
}

function registryRecord({ cfg, serviceDate, number, sourceId, now, createdBy }) {
  return { kind: "transfer", number, periodKey: documentPeriodKey(cfg.reset, serviceDate), sourceId, createdAt: now, createdBy: String(createdBy || "").slice(0, 200) };
}

async function readSettings(db, transaction) {
  const snap = await transaction.get(db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID));
  return normalizeStoreSettings(snap.exists ? snap.data() : undefined);
}

async function verifyPreparer(transaction, db, value, profile, settings) {
  if (value.preparerUid === profile.uid) {
    value.preparerName = profile.name || profile.email || profile.uid;
    return;
  }
  const person = settings.staff.find((entry) => entry.id === value.preparerUid);
  if (person) {
    if (!person.active) throw httpError("ผู้จัดใบโอนไม่ใช่พนักงานสโตร์ที่ใช้งานอยู่", 400);
    value.preparerName = person.name;
    return;
  }
  if (!validDocId(value.preparerUid)) throw httpError("ผู้จัดใบโอนไม่ถูกต้อง", 400);
  const snap = await transaction.get(db.collection("users").doc(value.preparerUid));
  const user = snap.exists ? snap.data() : null;
  if (!user || user.role !== "store" || user.active === false || ["disabled", "rejected"].includes(user.status)) {
    throw httpError("ผู้จัดใบโอนไม่ใช่พนักงานสโตร์ที่ใช้งานอยู่", 400);
  }
  value.preparerName = clean(user.name || user.username || String(user.email || "").split("@")[0] || value.preparerUid, 160);
}

function rowInput(row) {
  return {
    transferNumber: row?.transferNumber,
    requestRef: row?.requestRef,
    fromBranchCode: row?.fromBranchCode,
    toBranchCode: row?.toBranchCode,
    preparerUid: row?.preparerUid,
    preparerName: row?.preparerName,
    receipt: row?.receipt,
    note: row?.note
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const collection = db.collection(STORE_TRANSFERS_COLLECTION);

    if (params.get("alerts") === "true") {
      const snap = await collection.where("issueState", "==", "open").limit(ALERT_LIMIT + 1).get();
      const open = snap.docs.map(toItem).filter((item) => !item.deletedAt)
        .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
      const capped = snap.docs.length > ALERT_LIMIT;
      const items = open.slice(0, ALERT_LIMIT);
      return Response.json({ ok: true, data: { count: items.length, items: items.slice(0, ALERT_RETURN_LIMIT), capped, updatedAt: new Date().toISOString() } });
    }

    const id = clean(params.get("id"), 200);
    if (id) {
      if (!validDocId(id)) return fail("รหัสใบโอนไม่ถูกต้อง", 400);
      const ref = collection.doc(id);
      const snap = await ref.get();
      if (!snap.exists) return fail("ไม่พบใบโอน", 404);
      const history = await ref.collection("history").orderBy("at", "desc").limit(HISTORY_LIMIT).get();
      return Response.json({ ok: true, data: { ...toItem(snap), history: history.docs.map(toItem) } });
    }

    const includeDeleted = params.get("includeDeleted") === "true";
    const queryText = clean(params.get("q"), 200);
    if (queryText) {
      const snap = await collection.orderBy("createdAt", "desc").limit(SEARCH_LIMIT).get();
      const items = filterTransfers(snap.docs.map(toItem).filter((item) => includeDeleted || !item.deletedAt), { query: queryText });
      return Response.json({ ok: true, data: { items } });
    }

    const date = params.get("date") || bangkokDateKey();
    if (!bangkokDayRange(date)) return fail("วันที่ไม่ถูกต้อง", 400);
    const snap = await collection.where("serviceDate", "==", date).limit(DAY_LIMIT + 1).get();
    if (snap.docs.length > DAY_LIMIT) return fail("ข้อมูลใบโอนในวันนี้มากเกินขีดจำกัด", 422);
    const rows = snap.docs.map(toItem);
    const items = sortTransfersForDisplay(rows.filter((item) => includeDeleted || !item.deletedAt));
    return Response.json({ ok: true, data: { date, items, summary: summarizeTransfers(rows) } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    if (!body) return fail("ข้อมูลไม่ถูกต้อง", 400);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length > MAX_ROWS) return fail(`บันทึกได้ไม่เกิน ${MAX_ROWS} รายการต่อครั้ง`, 400);
    const filled = rows.filter((row) => !isBlankTransferRow(row));
    if (!filled.length) return fail("ยังไม่มีรายการให้ยืนยัน", 400);

    const now = new Date().toISOString();
    const serviceDate = bangkokDateKey(now);
    let saved = [];
    // Everything is validated and reserved inside one transaction so a bad or duplicate row writes nothing.
    await db.runTransaction(async (transaction) => {
      saved = [];
      const settings = await readSettings(db, transaction);
      const cfg = settings.documents.transfer;
      const seen = new Set();
      for (const row of filled) {
        const checked = validateTransferRow(row, { settings, profile });
        if (!checked.ok) throw httpError(checked.error, checked.status);
        await verifyPreparer(transaction, db, checked.value, profile, settings);
        const number = checked.value.transferNumber;
        const registryId = documentRegistryId("transfer", number, { reset: cfg.reset, serviceDate, pattern: cfg.pattern });
        if (seen.has(registryId)) throw httpError(`เลขที่ใบโอน ${number} ซ้ำกันในรายการที่กำลังบันทึก`, 409);
        seen.add(registryId);
        const ref = db.collection(STORE_TRANSFERS_COLLECTION).doc();
        saved.push({ id: ref.id, ref, registryId, ...buildTransferDoc(checked.value, { profile, now, serviceDate, registryId }) });
      }
      const registryRefs = saved.map((item) => db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(item.registryId));
      for (let index = 0; index < saved.length; index += 1) {
        const registrySnap = await transaction.get(registryRefs[index]);
        if (registrySnap.exists) throw httpError(`เลขที่ใบโอน ${saved[index].transferNumber} ถูกบันทึกแล้ว`, 409);
      }
      saved.forEach((item, index) => {
        const { id, ref, ...data } = item;
        transaction.set(ref, data);
        transaction.set(ref.collection("history").doc(), buildTransferHistoryEvent("created", profile, now, { after: pick(data, EDIT_FIELDS) }));
        transaction.create(registryRefs[index], registryRecord({ cfg, serviceDate, number: data.transferNumber, sourceId: id, now, createdBy: data.createdBy }));
      });
    });
    return Response.json({ ok: true, data: saved.map(({ ref, ...item }) => item) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const id = clean(body?.id, 200);
    const action = clean(body?.action, 20);
    if (!validDocId(id)) return fail("รหัสใบโอนไม่ถูกต้อง", 400);
    if (!["resolve", "reopen"].includes(action)) return fail("การดำเนินการไม่ถูกต้อง", 400);

    const ref = db.collection(STORE_TRANSFERS_COLLECTION).doc(id);
    const now = new Date().toISOString();
    let result = null;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw httpError("ไม่พบใบโอน", 404);
      const doc = snap.data();
      const patch = action === "resolve"
        ? applyTransferResolve(doc, { text: body?.text, profile, now })
        : applyTransferReopen(doc, { profile, now });
      const before = pick(doc, ["issueState", "resolution", "resolvedServiceDate"]);
      const after = pick(patch, ["issueState", "resolution", "resolvedServiceDate"]);
      transaction.update(ref, patch);
      transaction.set(ref.collection("history").doc(), buildTransferHistoryEvent(action === "resolve" ? "resolved" : "reopened", profile, now, { before, after, reason: body?.reason }));
      result = { id, ...doc, ...patch };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return fail("รหัสใบโอนไม่ถูกต้อง", 400);

    const ref = db.collection(STORE_TRANSFERS_COLLECTION).doc(id);
    const now = new Date().toISOString();
    let result = null;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw httpError("ไม่พบใบโอน", 404);
      const doc = snap.data();
      if (doc.deletedAt || doc.createdByUid !== profile.uid) throw httpError("แก้ไขใบโอนนี้ไม่ได้", 403);
      const reason = clean(body?.reason, 1000);
      if (!reason) throw httpError("กรุณาระบุเหตุผลในการแก้ไข", 400);

      const settings = await readSettings(db, transaction);
      const cfg = settings.documents.transfer;
      const checked = validateTransferRow(rowInput(body), { settings, profile, keepBranchCodes: [doc.fromBranchCode, doc.toBranchCode], keepNumber: doc.transferNumber });
      if (!checked.ok) throw httpError(checked.error, checked.status);
      const value = checked.value;
      await verifyPreparer(transaction, db, value, profile, settings);

      const patch = { ...value, updatedAt: now, updatedBy: profile.name || profile.email || "" };
      if (value.receipt === "complete") Object.assign(patch, { issueState: "", resolution: null, resolvedServiceDate: "" });
      else if (doc.receipt !== "incomplete") Object.assign(patch, { issueState: "open", resolution: null, resolvedServiceDate: "" });

      let reserve = null;
      let release = null;
      if (value.transferNumber !== doc.transferNumber) {
        const serviceDate = doc.serviceDate || bangkokDateKey(doc.createdAt);
        const registryId = documentRegistryId("transfer", value.transferNumber, { reset: cfg.reset, serviceDate, pattern: cfg.pattern });
        const newRef = db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(registryId);
        const oldRef = doc.registryId && doc.registryId !== registryId ? db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(doc.registryId) : null;
        const newSnap = await transaction.get(newRef);
        const oldSnap = oldRef ? await transaction.get(oldRef) : null;
        if (newSnap.exists) throw httpError(`เลขที่ใบโอน ${value.transferNumber} ถูกบันทึกแล้ว`, 409);
        patch.registryId = registryId;
        reserve = { ref: newRef, record: registryRecord({ cfg, serviceDate, number: value.transferNumber, sourceId: id, now, createdBy: profile.name || profile.email }) };
        if (oldSnap?.exists && oldSnap.data()?.sourceId === id) release = oldRef;
      }

      transaction.update(ref, patch);
      transaction.set(ref.collection("history").doc(), buildTransferHistoryEvent("updated", profile, now, { before: pick(doc, EDIT_FIELDS), after: pick({ ...doc, ...patch }, EDIT_FIELDS), reason }));
      if (reserve) transaction.create(reserve.ref, reserve.record);
      if (release) transaction.delete(release);
      result = { id, ...doc, ...patch };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store"]);
    const body = await readBody(request);
    const id = clean(body?.id, 200);
    if (!validDocId(id)) return fail("รหัสใบโอนไม่ถูกต้อง", 400);

    const ref = db.collection(STORE_TRANSFERS_COLLECTION).doc(id);
    const now = new Date().toISOString();
    let result = null;
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw httpError("ไม่พบใบโอน", 404);
      const doc = snap.data();
      if (doc.deletedAt || doc.createdByUid !== profile.uid) throw httpError("ลบใบโอนนี้ไม่ได้", 403);
      const reason = clean(body?.reason, 1000);
      if (!reason) throw httpError("กรุณาระบุเหตุผลในการลบ", 400);

      // Free the number so it can be keyed again; only the registry row this document owns is released.
      const registryRef = doc.registryId ? db.collection(STORE_DOCUMENT_REGISTRY_COLLECTION).doc(doc.registryId) : null;
      const registrySnap = registryRef ? await transaction.get(registryRef) : null;
      const patch = { deletedAt: now, deletedBy: profile.name || profile.email || "", deleteReason: reason, updatedAt: now };
      transaction.update(ref, patch);
      transaction.set(ref.collection("history").doc(), buildTransferHistoryEvent("deleted", profile, now, { before: pick(doc, EDIT_FIELDS), reason }));
      if (registrySnap?.exists && registrySnap.data()?.sourceId === id) transaction.delete(registryRef);
      result = { id, ...doc, ...patch };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

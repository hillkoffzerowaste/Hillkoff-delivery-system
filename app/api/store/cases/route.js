import { readStoreCases } from "../../../../lib/storeCasesStore.js";
import { readStoreRoster } from "../../../../lib/storeRoster.js";
import { sourceMutationVersion } from "../../../../lib/storeCaseTransactions.js";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { CASE_COLLECTION, caseId, mergeStoreCases, summarizeCases, validateCase } from "../../../../lib/storeCases.js";
import { bangkokDateOf } from "../../../../lib/storeDailyReport.js";
import { customRange } from "../../../../lib/storeOverview.js";

export const runtime = "nodejs";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const collections = { transfer: "store_transfers", booking: "store_reports", online: "store_reports", audit: "store_audits" };

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const today = bangkokDateOf(new Date().toISOString());
    const range = customRange(params.get("from") || today, params.get("to") || today);
    if (!range) throw fail("ช่วงวันที่ไม่ถูกต้อง หรือเกิน 366 วัน");
    const [items, roster] = await Promise.all([readStoreCases(db), readStoreRoster(db)]);
    const summary = summarizeCases(items, { ...range, staffId: params.get("staffId") || "", activityActorId: params.get("staffId") || "", branchCode: params.get("branchCode") || "" });
    return Response.json({ ok: true, data: { items, summary, roster, generatedAt: new Date().toISOString(), historicalSnapshot: false } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    let body;
    try { body = await request.json(); } catch { throw fail("ข้อมูลไม่ถูกต้อง"); }
    if (!body || typeof body !== "object" || Array.isArray(body) || ["createdAt", "updatedAt", "resolvedAt", "recordedAt", "effectiveAt", "history"].some((key) => key in body)) throw fail("เวลาเหตุการณ์กำหนดโดย server เท่านั้น");
    const checked = validateCase(body);
    if (!checked.ok) throw fail(checked.error);
    const value = checked.value;
    const roster = await readStoreRoster(db);
    const responsible = roster.find((person) => person.uid === value.responsibleId);
    const ref = db.collection(CASE_COLLECTION).doc(caseId(value.sourceType, value.sourceId));
    const sourceRef = db.collection(collections[value.sourceType]).doc(value.sourceId);
    const result = await db.runTransaction(async (tx) => {
      const [snap, sourceSnap] = await Promise.all([tx.get(ref), tx.get(sourceRef)]);
      if (!sourceSnap.exists || sourceSnap.data().deletedAt) throw fail("ไม่พบเอกสารต้นทาง", 404);
      const source = sourceSnap.data();
      if (["booking", "online"].includes(value.sourceType) && source.type !== value.sourceType) throw fail("ประเภทเอกสารต้นทางไม่ตรงกัน");
      const old = snap.exists ? snap.data() : null;
      const legacy = mergeStoreCases({ transfers: value.sourceType === "transfer" ? [{ ...source, id: value.sourceId }] : [], reports: ["booking", "online"].includes(value.sourceType) ? [{ ...source, id: value.sourceId }] : [], audits: value.sourceType === "audit" ? [{ ...source, id: value.sourceId }] : [] })[0];
      const prior = old || legacy;
      if (!prior && (!value.cause || !value.note || value.category === "unknown")) throw fail("เอกสารไม่มีปัญหาเดิม กรุณาระบุประเภท สาเหตุ และหมายเหตุของปัญหาใหม่");
      if (value.responsibleId && !responsible && value.responsibleId !== prior?.responsibleId) throw fail("ไม่พบผู้รับผิดชอบในรายชื่อสโตร์");
      value.responsibleName = responsible?.name || (value.responsibleId === prior?.responsibleId ? prior.responsibleName : "") || "";
      if ((old?.updatedAt || "") !== body.baseUpdatedAt) throw fail("เคสเปลี่ยนแล้ว กรุณาโหลดใหม่", 409);
      const actualNow = new Date().toISOString();
      const importedClose = !old && prior?.status === "closed" && prior.resolvedAt ? [{ action: "closed", closure: prior.closure, effectiveAt: prior.resolvedAt, recordedAt: actualNow, actorUid: source.resolution?.byUid || "", actorName: source.resolution?.byName || "", note: source.resolution?.text || prior.closureReason || "", legacyImported: true }] : [];
      const history = old?.history || importedClose;
      if (history.length >= 500) throw fail("ประวัติเคสเต็ม กรุณาติดต่อผู้ดูแล", 422);
      const now = new Date(Math.max(Date.now(), (Date.parse(old?.updatedAt) || 0) + 1)).toISOString();
      const status = prior?.status === "closed" && value.status !== "closed" ? "reopened" : value.status;
      const closed = status === "closed";
      const closureEvent = closed && prior?.status !== "closed";
      const event = { action: closureEvent ? "closed" : status === "reopened" ? "reopened" : "updated", status, closure: value.closure, effectiveAt: actualNow, recordedAt: actualNow, actorUid: profile.uid, actorName: profile.name || "", note: value.closureReason || value.note };
      const item = { ...value, status, sourceNumber: source.transferNumber || source.bookingNumber || source.documentNumber || value.sourceId, branchCode: source.toBranchCode || source.branchCode || "", createdAt: prior?.createdAt || (legacy ? "" : now), originDateEstimated: old?.originDateEstimated ?? true, discoveredAt: old?.discoveredAt || "", sourceCreatedAt: source.createdAt || "", updatedAt: now, recordedAt: actualNow, effectiveAt: actualNow, resolvedAt: closed ? (closureEvent ? actualNow : prior?.resolvedAt || "") : "", createdByUid: old?.createdByUid || profile.uid, updatedByUid: profile.uid, history: [...history, event] };
      tx.set(ref, item);
      if (value.sourceType === "transfer") tx.update(sourceRef, { issueState: closed ? "resolved" : "open", receipt: "incomplete", resolution: closed && !closureEvent && source.resolution ? source.resolution : closed ? { at: item.resolvedAt, text: value.closureReason || "รับสินค้าครบจากทะเบียนเคส", byUid: profile.uid, byName: profile.name || "" } : null, resolvedServiceDate: closed ? bangkokDateOf(item.resolvedAt) : "", updatedAt: sourceMutationVersion(source, actualNow), updatedByUid: profile.uid });
      // Source facts (counts, receipt workflows) remain intact; compatibility readers use this status projection.
      else tx.update(sourceRef, { caseStatus: status, caseClosure: value.closure, caseId: ref.id, caseUpdatedAt: now });
      return { id: ref.id, ...item };
    });
    return Response.json({ ok: true, data: result });
  } catch (error) { return errorResponse(error); }
}

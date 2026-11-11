import { CASE_COLLECTION, caseId, remainingOf } from "./storeCases.js";

export async function readSourceCase(tx, db, sourceType, sourceId) {
  const ref = db.collection(CASE_COLLECTION).doc(caseId(sourceType, sourceId));
  const snapshot = await tx.get(ref);
  return { ref, snapshot, value: snapshot.exists ? snapshot.data() : null };
}

export function prepareTransferCasePatch(existing, transferPatch, now, actor) {
  if (!existing) return null;
  const updatedAt = sourceMutationVersion(existing, now);
  const history = Array.isArray(existing.history) ? existing.history : [];
  if (history.length >= 500) throw Object.assign(new Error("ประวัติเคสเต็ม กรุณาติดต่อผู้ดูแล"), { status: 422 });
  const patch = { updatedAt, updatedByUid: actor.uid, note: transferPatch.note ?? existing.note ?? "" };
  if (transferPatch.deletedAt) {
    Object.assign(patch, { status: "closed", closure: "exception", closureReason: "เอกสารต้นทางถูกยกเลิก", resolvedAt: now });
  } else if ((transferPatch.issueState === "resolved" || transferPatch.receipt === "complete") && existing.status !== "closed") {
    if ((existing.lines || []).some((line) => remainingOf(line) > 0)) throw Object.assign(new Error("ยังมีสินค้าค้าง กรุณาบันทึกการรับหรือยกเลิกในทะเบียนเคสก่อน"), { status: 400 });
    const unknown = !existing.lines?.length || existing.lines.some((line) => !Number.isFinite(line.required) || line.required <= 0);
    const reason = transferPatch.resolution?.text || transferPatch.resolution?.note || transferPatch.resolution?.reason || transferPatch.reason || transferPatch.note || "";
    if ((unknown || existing.lines.some((line) => line.cancelled > 0)) && !reason) throw Object.assign(new Error("ระบุเหตุผลปิดเคสที่ยังไม่ระบุรายการสินค้า"), { status: 400 });
    Object.assign(patch, { status: "closed", closure: unknown || existing.lines.some((line) => line.cancelled > 0) ? "exception" : "fulfilled", closureReason: reason, resolvedAt: now });
  } else if (transferPatch.issueState === "open") {
    Object.assign(patch, { status: existing.status === "closed" ? "reopened" : existing.status, closure: "", closureReason: "", resolvedAt: "" });
  }
  if (transferPatch.toBranchCode) patch.branchCode = transferPatch.toBranchCode;
  if (transferPatch.transferNumber) patch.sourceNumber = transferPatch.transferNumber;
  if (Object.hasOwn(transferPatch, "bookingNumber")) patch.sourceNumber = transferPatch.bookingNumber || existing.sourceId || "";
  if (transferPatch.documentNumber) patch.sourceNumber = transferPatch.documentNumber;
  patch.history = [...history, { action: patch.status === "closed" && existing.status !== "closed" ? "closed" : transferPatch.deletedAt ? "source_cancelled" : "source_updated", closure: patch.closure || "", status: patch.status || existing.status, effectiveAt: now, recordedAt: now, actorUid: actor.uid, actorName: actor.name || "", note: patch.closureReason || patch.note }];
  return patch;
}


export const readTransferCase = (tx, db, transferId) => readSourceCase(tx, db, "transfer", transferId);

export function prepareSourceCasePatch(existing, sourcePatch, now, actor) {
  if (!existing) return null;
  const patch = { ...sourcePatch };
  if (patch.packStatus === "checked") {
    patch.issueState = "resolved";
    patch.resolution = { text: patch.note || patch.returnReason || "ห้องแพ็คยืนยันตรวจเอกสารแล้ว" };
  } else if (["partial", "returned"].includes(patch.packStatus) || ["partial", "waiting"].includes(patch.status)) patch.issueState = "open";
  const value = prepareTransferCasePatch(existing, patch, now, actor);
  if (!value.status) value.status = existing.status;
  return value;
}


export function sourceMutationVersion(source, now) {
  return new Date(Math.max(Date.now(), Date.parse(now) || 0, (Date.parse(source?.updatedAt) || Date.parse(source?.createdAt) || 0) + 1)).toISOString();
}

function sourceHasProblem(sourceType, source) {
  if (!source || source.deletedAt) return false;
  if (sourceType === "transfer") return source.receipt === "incomplete";
  if (sourceType === "audit") return Number(source.mismatch) > 0;
  return ["partial", "waiting"].includes(source.status) || ["partial", "returned"].includes(source.packStatus);
}

function firstProblemAt(source) {
  return (Array.isArray(source.workflowHistory) ? source.workflowHistory : [])
    .filter((event) => ["pack_partial", "pack_returned"].includes(event.action) || ["partial", "waiting"].includes(event.status) || ["partial", "returned"].includes(event.packStatus))
    .map((event) => event.at)
    .filter((at) => Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || "";
}

export function prepareSourceCaseUpsert(existing, sourceType, sourceId, before, sourcePatch, now, actor) {
  if (existing) return prepareSourceCasePatch(existing, sourcePatch, now, actor);
  const after = { ...before, ...sourcePatch };
  const legacy = sourceHasProblem(sourceType, before);
  if (!legacy && !sourceHasProblem(sourceType, after)) return null;
  const source = legacy ? before : after;
  const discoveredAt = legacy ? firstProblemAt(source) : now;
  const createdAt = discoveredAt || source.createdAt || now;
  const initial = {
    sourceType, sourceId,
    sourceNumber: source.transferNumber || source.bookingNumber || source.documentNumber || sourceId,
    branchCode: source.toBranchCode || source.branchCode || "",
    responsibleId: source.preparerUid || source.createdByUid || "",
    responsibleName: source.preparerName || source.createdBy || "",
    category: "unknown", cause: "", note: source.returnReason || source.note || source.detail || "",
    lines: [], status: "open", closure: "", closureReason: "", resolvedAt: "",
    sourceCreatedAt: source.createdAt || "", sourceServiceDate: source.serviceDate || "",
    createdAt, discoveredAt, originDateEstimated: !discoveredAt,
    updatedAt: now, updatedByUid: actor.uid, createdByUid: actor.uid, recordedAt: now, effectiveAt: now,
    history: [{ action: "created", status: "open", closure: "", effectiveAt: now, recordedAt: now, actorUid: actor.uid, actorName: actor.name || "", note: source.returnReason || source.note || source.detail || "" }]
  };
  if (legacy && sourceType === "transfer" && source.issueState === "resolved") {
    Object.assign(initial, { status: "closed", closure: "exception", closureReason: source.resolution?.text || "ข้อมูลเดิม ไม่ระบุรูปแบบการปิด", resolvedAt: source.resolution?.at || "" });
    if (Number.isFinite(Date.parse(initial.resolvedAt))) {
      initial.history.push({ action: "closed", status: "closed", closure: "exception", effectiveAt: initial.resolvedAt, recordedAt: now, actorUid: source.resolution?.byUid || "", actorName: source.resolution?.byName || "", note: initial.closureReason, legacyImported: true });
    }
  }
  return legacy ? { ...initial, ...prepareSourceCasePatch(initial, sourcePatch, now, actor) } : initial;
}

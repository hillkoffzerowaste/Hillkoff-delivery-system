// Store transfer documents (ใบโอนสินค้า): validation, state transitions and list helpers.
// Pure (no firebase) so the route, the panel and reports can share the same rules.
import { bangkokDateKey } from "./operationsReporting.js";
import { findBranch, getActiveBranches, normalizeDocumentNumber, sampleDocumentNumber, validateDocumentNumber } from "./storeSettings.js";

export const STORE_TRANSFERS_COLLECTION = "store_transfers";
// Request-transfer numbers look like RQ-0395 in the approved preview. Change only here if the real format differs.
// Company format STK-TRF + Buddhist YY + MM + running number (STK-TRF6910-0001); the older RQ-0000 still passes.
// Any document head allowed in settings (letters, digits, hyphens) may precede the year-month.
export const REQUEST_REF_PATTERN = /^(?:[A-Z]{1,6}-\d{4}|[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\d{2}(?:0[1-9]|1[0-2])-\d{3,6})$/;
export const REQUEST_REF_SAMPLE = "STK-TRF6910-0001";
export const TRANSFER_RECEIPTS = ["complete", "incomplete"];

const NOTE_MAX = 1000;
export const ITEM_COUNT_MAX = 9999;
const RESOLUTION_MAX = 1000;
const NAME_MAX = 160;

const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

function failure(error, status = 400) {
  return { ok: false, error, status };
}

function fieldConfig(settings, id) {
  const fields = settings?.documents?.transfer?.fields || [];
  return fields.find((item) => item.id === id) || { id, label: "", show: true, required: false };
}

// A row counts as filled in when the user typed something (mirrors the preview's `confirmDrafts`).
export function isBlankTransferRow(row) {
  return !clean(row?.transferNumber) && !clean(row?.requestRef) && !clean(row?.itemCount) && !clean(row?.preparerName) && !clean(row?.preparerUid) && !clean(row?.note);
}

// `profile` (the recorder) is the fallback preparer when the preparer field is hidden or optional.
// `keepBranchCodes` lets an edit keep a branch that was deactivated after the document was created.
export function validateTransferRow(row, { settings, profile = null, keepBranchCodes = [], keepNumber = "" } = {}) {
  const cfg = settings?.documents?.transfer;
  if (!cfg) return failure("ไม่พบการตั้งค่าใบโอน");
  const branches = settings.branches || [];

  const number = normalizeDocumentNumber(row?.transferNumber);
  const numberCheck = keepNumber && number === normalizeDocumentNumber(keepNumber)
    ? { ok: true, number }
    : validateDocumentNumber(number, cfg, { branchCodes: branches.map((branch) => branch.code) });
  if (!numberCheck.ok) return failure(`เลขที่ใบโอนต้องอยู่ในรูปแบบ ${sampleDocumentNumber(cfg)}`);

  const refField = fieldConfig(settings, "ref");
  const requestRef = refField.show === false ? "" : normalizeDocumentNumber(row?.requestRef);
  if (requestRef && !REQUEST_REF_PATTERN.test(requestRef)) return failure(`เลขที่ใบขอโอนต้องอยู่ในรูปแบบ ${REQUEST_REF_SAMPLE}`);
  if (!requestRef && refField.show !== false && refField.required) return failure(`กรุณาระบุ${refField.label || "อ้างอิงใบขอโอน"}`);

  const active = new Set([...getActiveBranches(settings).map((branch) => branch.code), ...keepBranchCodes.map((code) => String(code || "").toUpperCase())]);
  const from = findBranch(settings, row?.fromBranchCode);
  const to = findBranch(settings, row?.toBranchCode);
  if (!from || !to || !active.has(from.code) || !active.has(to.code)) return failure("สาขาต้นทาง/ปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน");
  if (from.code === to.code) return failure("ต้นทางและปลายทางต้องเป็นคนละสาขา");

  const itemsField = fieldConfig(settings, "items");
  const itemsLabel = itemsField.label || "จำนวนรายการที่โอน";
  const itemText = itemsField.show === false ? "" : clean(row?.itemCount, 20);
  let itemCount = null;
  if (itemText) {
    if (!/^\d+$/.test(itemText) || Number(itemText) < 1 || Number(itemText) > ITEM_COUNT_MAX) return failure(`${itemsLabel}ต้องเป็นตัวเลข 1–${ITEM_COUNT_MAX}`);
    itemCount = Number(itemText);
  } else if (itemsField.show !== false && itemsField.required) return failure(`กรุณาระบุ${itemsLabel}`);

  const preparerField = fieldConfig(settings, "preparer");
  let preparerUid = clean(row?.preparerUid, 200);
  let preparerName = clean(row?.preparerName, NAME_MAX);
  if (preparerField.show === false) {
    preparerUid = "";
    preparerName = "";
  }
  if (preparerName && !preparerUid) return failure("กรุณาเลือกผู้จัดใบโอนจากรายชื่อ");
  if (!preparerName) {
    if (preparerField.show !== false && preparerField.required) return failure("กรุณาเลือกผู้จัดใบโอน");
    preparerUid = clean(profile?.uid, 200);
    preparerName = clean(profile?.name || profile?.email, NAME_MAX);
  }

  const receipt = clean(row?.receipt, 20);
  if (!TRANSFER_RECEIPTS.includes(receipt)) return failure("กรุณาเลือกผลรับสินค้า");
  const note = clean(row?.note, NOTE_MAX);
  // The incomplete-goods note is mandatory whatever the settings say: it is the thing that gets followed up.
  if (receipt === "incomplete" && !note) return failure("กรณีสินค้าไม่ครบ ต้องระบุหมายเหตุว่าขาดอะไร");

  return {
    ok: true,
    value: {
      transferNumber: numberCheck.number,
      requestRef,
      fromBranchCode: from.code,
      fromBranchName: from.name,
      toBranchCode: to.code,
      toBranchName: to.name,
      itemCount,
      preparerUid,
      preparerName,
      receipt,
      note: receipt === "incomplete" ? note : ""
    }
  };
}

export function buildTransferDoc(value, { profile, now, serviceDate, registryId }) {
  const incomplete = value.receipt === "incomplete";
  return {
    ...value,
    issueState: incomplete ? "open" : "",
    resolution: null,
    resolvedServiceDate: "",
    serviceDate,
    registryId: registryId || "",
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    createdBy: profile.name || profile.email || "",
    createdByUid: profile.uid
  };
}

export function transferStatus(doc) {
  if (doc?.receipt !== "incomplete") return "complete";
  return doc.issueState === "resolved" ? "resolved" : "open";
}

export function applyTransferResolve(doc, { text, profile, now }) {
  const resolved = clean(text, RESOLUTION_MAX);
  if (!resolved) throw Object.assign(new Error("กรุณาระบุวิธีแก้ไข / ผลการดำเนินการ"), { status: 400 });
  if (doc?.deletedAt || transferStatus(doc) !== "open") throw Object.assign(new Error("ใบโอนนี้ไม่มีรายการค้างแก้ไข"), { status: 409 });
  const byName = profile.name || profile.email || "";
  return {
    issueState: "resolved",
    resolution: { text: resolved, byUid: profile.uid, byName, at: now },
    resolvedServiceDate: bangkokDateKey(now),
    updatedAt: now,
    updatedBy: byName
  };
}

export function applyTransferReopen(doc, { profile, now }) {
  if (doc?.deletedAt || transferStatus(doc) !== "resolved") throw Object.assign(new Error("ใบโอนนี้ยังไม่ได้บันทึกการแก้ไข"), { status: 409 });
  return {
    issueState: "open",
    resolution: null,
    resolvedServiceDate: "",
    updatedAt: now,
    updatedBy: profile.name || profile.email || ""
  };
}

export function summarizeTransfers(rows) {
  const summary = { total: 0, complete: 0, open: 0, resolved: 0, incomplete: 0 };
  for (const row of rows || []) {
    if (row?.deletedAt) continue;
    summary.total += 1;
    summary[transferStatus(row)] += 1;
  }
  summary.incomplete = summary.open + summary.resolved;
  return summary;
}

const STATUS_RANK = { open: 0, resolved: 1, complete: 2 };
const timeOf = (value) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
};

export function sortTransfersForDisplay(rows) {
  return [...(rows || [])].sort((a, b) => STATUS_RANK[transferStatus(a)] - STATUS_RANK[transferStatus(b)] || timeOf(a.createdAt) - timeOf(b.createdAt));
}

export function filterTransfers(rows, { status = "all", branchCode = "all", query = "" } = {}) {
  const text = String(query || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status !== "all" && transferStatus(row) !== status) return false;
    if (branchCode !== "all" && row.fromBranchCode !== branchCode && row.toBranchCode !== branchCode) return false;
    if (!text) return true;
    return [row.transferNumber, row.requestRef, row.note, row.preparerName, row.resolution?.text, row.fromBranchName, row.toBranchName, row.createdBy]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

export function transferResolveHours(doc) {
  if (!doc?.resolution?.at || !doc.createdAt) return null;
  const hours = (Date.parse(doc.resolution.at) - Date.parse(doc.createdAt)) / 3_600_000;
  return Number.isFinite(hours) ? Math.max(0, hours) : null;
}

export function buildTransferHistoryEvent(event, profile, now, { before = null, after = null, reason = "" } = {}) {
  return {
    event,
    at: now,
    by: profile.name || profile.email || "",
    byUid: profile.uid,
    reason: clean(reason, NOTE_MAX),
    before,
    after
  };
}

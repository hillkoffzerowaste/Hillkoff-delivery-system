import { bangkokDateOf } from "./storeDailyReport.js";
import { isReportProblem } from "./storeReportStats.js";

export const CASE_COLLECTION = "store_cases";
export const CASE_READ_LIMIT = 6000;
export const CASE_STATUSES = ["open", "working", "closed", "reopened"];
export const SHORTAGE_STATUSES = ["waiting_purchase", "ordered", "waiting_transfer", "partial", "complete", "cancelled"];
const text = (value) => String(value ?? "").trim();
const validSource = (type, id) => ["transfer", "booking", "online", "audit"].includes(type) && id && id.length <= 200 && !id.includes("/");
export const caseId = (type, id) => `${type}_${encodeURIComponent(id)}`;
export const remainingOf = (line) => Math.max(0, line.required - line.received - line.cancelled);
export const isOpenCase = (item) => item.status !== "closed";

export function validateCase(input) {
  const bad = (error) => ({ ok: false, error });
  if (!input || typeof input !== "object" || Array.isArray(input)) return bad("ข้อมูลเคสไม่ถูกต้อง");
  if (!validSource(input.sourceType, text(input.sourceId)) || !CASE_STATUSES.includes(input.status)) return bad("เอกสารต้นทางหรือสถานะไม่ถูกต้อง");
  if (!Array.isArray(input.lines) || input.lines.length > 100) return bad("ระบุรายการสินค้าไม่เกิน 100 รายการ");
  const lines = [];
  const ids = new Set();
  for (const item of input.lines) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return bad("ข้อมูลรายการสินค้าไม่ถูกต้อง");
    const id = text(item.id);
    if (!id || id.length > 100 || ids.has(id) || !text(item.name) || !text(item.unit)) return bad("ระบุรหัสรายการ ชื่อสินค้า และหน่วยให้ครบ โดยรหัสรายการต้องไม่ซ้ำ");
    ids.add(id);
    if (!(item.required > 0)) return bad("จำนวนต้องรับต้องมากกว่าศูนย์");
    if ([item.required, item.received, item.cancelled].some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e9)) return bad("จำนวนสินค้าต้องเป็นตัวเลขตั้งแต่ศูนย์");
    if (item.received + item.cancelled > item.required) return bad("รับหรือยกเลิกเกินจำนวนต้องรับ กรุณาตรวจสอบ");
    if (item.cancelled && !text(item.cancellationReason)) return bad("ระบุเหตุผลยกเลิกจำนวนสินค้า");
    if (item.trackingStatus === "complete" && remainingOf(item) > 0) return bad("ยังมีสินค้าค้าง ไม่สามารถระบุว่าครบ");
    if (item.trackingStatus === "cancelled" && (item.cancelled !== item.required || !text(item.cancellationReason))) return bad("สถานะยกเลิกต้องระบุจำนวนและเหตุผลยกเลิกครบ");
    const allocations = Array.isArray(item.allocations) ? item.allocations : [];
    if (allocations.some((a) => !a || typeof a !== "object" || Array.isArray(a))) return bad("ข้อมูลแหล่งรอรับไม่ถูกต้อง");
    if (allocations.length > 30 || allocations.some((a) => typeof a.quantity !== "number" || !Number.isFinite(a.quantity) || a.quantity <= 0) || allocations.reduce((sum, a) => sum + a.quantity, 0) > remainingOf(item)) return bad("จำนวนจัดสรรจากทุกแหล่งต้องไม่เกินยอดค้าง");
    lines.push({ id, category: ["shortage", "wrong", "damaged", "document"].includes(item.category) ? item.category : "unknown", sku: text(item.sku).slice(0, 100), name: text(item.name).slice(0, 200), unit: text(item.unit).slice(0, 50), required: item.required, received: item.received, cancelled: item.cancelled, cancellationReason: text(item.cancellationReason).slice(0, 1000), trackingStatus: SHORTAGE_STATUSES.includes(item.trackingStatus) ? item.trackingStatus : "waiting_purchase", allocations: allocations.map((a) => ({ quantity: a.quantity, kind: a.kind === "transfer" ? "transfer" : "supplier", supplier: text(a.supplier).slice(0, 200), branch: text(a.branch).slice(0, 100), warehouse: text(a.warehouse).slice(0, 100), owner: text(a.owner).slice(0, 100), po: text(a.po).slice(0, 100), eta: text(a.eta).slice(0, 10), followUp: text(a.followUp).slice(0, 10) })) });
  }
  const closure = input.status === "closed" ? text(input.closure) : "";
  if (input.status === "closed") {
    if (!["fulfilled", "cancelled", "exception"].includes(closure)) return bad("ระบุประเภทการปิดเคส");
    if (closure === "fulfilled" && (!lines.length || lines.some((line) => remainingOf(line) > 0 || line.cancelled > 0))) return bad("ปิดแบบรับครบไม่ได้ หากยังมีสินค้าค้าง ยกเลิก หรือยังไม่ระบุรายการสินค้า");
    if (closure === "cancelled" && lines.some((line) => remainingOf(line) > 0)) return bad("ปิดยกเลิกไม่ได้หากยังมียอดค้าง กรุณาระบุจำนวนยกเลิกและเหตุผล");
    if (closure !== "fulfilled" && !text(input.closureReason)) return bad("ระบุเหตุผลปิดแบบยกเลิกหรือข้อยกเว้น");
  }
  return { ok: true, value: { sourceType: input.sourceType, sourceId: text(input.sourceId), status: input.status, category: text(input.category).slice(0, 100) || "unknown", cause: text(input.cause).slice(0, 1000), responsibleId: text(input.responsibleId).slice(0, 200), responsibleName: text(input.responsibleName).slice(0, 100), closure, closureReason: text(input.closureReason).slice(0, 1000), note: text(input.note).slice(0, 2000), lines } };
}

export function mergeStoreCases({ cases = [], transfers = [], reports = [], audits = [] }) {
  const projected = new Map();
  const add = (type, row, open, note, no, branch) => {
    if (!row.id || row.deletedAt) return;
    const id = caseId(type, row.id);
    projected.set(id, { id, sourceType: type, sourceId: row.id, sourceNumber: no || row.id, branchCode: branch || "", responsibleId: row.preparerUid || row.createdByUid || "", responsibleName: row.preparerName || row.createdBy || "", category: "unknown", cause: "", note: note || "", status: open ? "open" : "closed", closure: open ? "" : "exception", closureReason: open ? "" : "ข้อมูลเดิม ไม่ระบุรูปแบบการปิด", lines: [], legacy: true, createdAt: row.createdAt || "", updatedAt: row.updatedAt || row.createdAt || "", resolvedAt: row.resolution?.at || "" });
  };
  transfers.filter((row) => row.receipt === "incomplete").forEach((row) => add("transfer", row, row.issueState !== "resolved", row.note, row.transferNumber, row.toBranchCode));
  reports.filter((row) => isReportProblem(row)).forEach((row) => add(row.type, row, true, row.returnReason || row.note || row.detail, row.bookingNumber, row.branchCode));
  audits.filter((row) => Number(row.mismatch) > 0).forEach((row) => add("audit", row, true, row.note, row.documentNumber, row.branchCode));
  cases.forEach((row) => {
    const id = caseId(row.sourceType, row.sourceId);
    const source = projected.get(id);
    projected.set(id, { ...source, ...row, id, legacy: false, sourceStatusMismatch: Boolean(source && isOpenCase(source) !== isOpenCase(row)) });
  });
  return [...projected.values()];
}

export function summarizeCases(rows, { from, to, staffId = "", branchCode = "", activityActorId = "", today = bangkokDateOf(new Date().toISOString()) }) {
  const selected = rows.filter((row) => (!staffId || (staffId === "unknown" ? !row.responsibleId : row.responsibleId === staffId)) && (!branchCode || row.branchCode === branchCode));
  const inRange = (at) => { const day = bangkokDateOf(at); return day && day >= from && day <= to; };
  const cohort = selected.filter((row) => inRange(row.createdAt));
  const matchesActor = (actorUid) => !activityActorId || (activityActorId === "unknown" ? !actorUid : actorUid === activityActorId);
  const activity = rows.filter((row) => !branchCode || row.branchCode === branchCode).flatMap((row) => {
    const closedEvents = (Array.isArray(row.history) ? row.history : []).filter((event) => event.action === "closed");
    if (closedEvents.length) return closedEvents.filter((event) => inRange(event.effectiveAt) && matchesActor(event.actorUid));
    return !isOpenCase(row) && inRange(row.resolvedAt) && matchesActor("") ? [row] : [];
  });
  const overdue = (row) => (row.lines || []).some((line) => remainingOf(line) > 0 && (line.allocations || []).some((a) => a.eta && a.eta < today));
  const urgent = selected.filter(isOpenCase).sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  return { created: cohort.length, cohortOpen: cohort.filter(isOpenCase).length, cohortClosed: cohort.filter((row) => !isOpenCase(row)).length, resolvedActivities: activity.filter((row) => row.closure === "fulfilled").length, cancelledActivities: activity.filter((row) => row.closure === "cancelled").length, exceptionActivities: activity.filter((row) => row.closure === "exception").length, backlog: urgent.length, urgent, historicalSnapshot: false };
}


export function analyzeCases(rows, today) {
  const groups = { byCategory: new Map(), byCause: new Map(), byProduct: new Map(), byBranch: new Map(), bySource: new Map(), byAge: new Map() };
  const add = (map, keys) => [...new Set(keys)].forEach((key) => map.set(key || "ไม่ทราบ", (map.get(key || "ไม่ทราบ") || 0) + 1));
  const open = rows.filter(isOpenCase);
  let overdue = 0;
  open.forEach((row) => {
    add(groups.byCategory, [row.category || "ไม่ทราบ"]);
    add(groups.byCause, [row.cause]); add(groups.byBranch, [row.branchCode]);
    add(groups.byProduct, row.lines?.length ? row.lines.map((line) => [line.sku, line.name].filter(Boolean).join(" · ")) : [""]);
    const allocations = (row.lines || []).flatMap((line) => line.allocations || []);
    add(groups.bySource, allocations.length ? allocations.map((a) => [a.supplier, a.branch, a.warehouse].filter(Boolean).join(" / ")) : [""]);
    const start = bangkokDateOf(row.createdAt);
    const age = start ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(start)) / 86400000)) : null;
    add(groups.byAge, [age === null ? "ไม่ทราบ" : age <= 3 ? "0–3 วัน" : age <= 7 ? "4–7 วัน" : age <= 30 ? "8–30 วัน" : "มากกว่า 30 วัน"]);
    if (allocations.some((a) => a.eta && a.eta < today)) overdue++;
  });
  return { overdue, ...Object.fromEntries(Object.entries(groups).map(([key, map]) => [key, [...map].map(([name, count]) => ({ key: name, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))])) };
}

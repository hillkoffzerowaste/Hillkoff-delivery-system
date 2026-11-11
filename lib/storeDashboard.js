import { bangkokDateOf, buildRangeReport, jobsOf } from "./storeDailyReport.js";
import { isOpenCase, remainingOf } from "./storeCases.js";

export function buildDocumentDashboard({ from, to, roster = [], reports = [], transfers = [], audits = [], staffId = "", branchCode = "" }) {
  const range = { from, to, roster };
  const atBranch = (row, type) => !branchCode || (type === "transfer" ? row.toBranchCode : row.branchCode) === branchCode;
  const selected = { reports: reports.filter((row) => atBranch(row, row.type)), transfers: transfers.filter((row) => atBranch(row, "transfer")), audits: audits.filter((row) => atBranch(row, "audit")) };
  const report = buildRangeReport({ ...range, ...selected });
  const people = [...report.people, { ...report.unattributed, name: "ไม่ทราบผู้ทำ", uid: "unknown" }].filter((row) => !staffId || row.uid === staffId);
  const documents = [];
  const add = (row, type, collection) => {
    const date = row.serviceDate || bangkokDateOf(row.createdAt);
    if (!date || date < from || date > to) return;
    const one = buildRangeReport({ from: date, to: date, roster, [collection]: [row] });
    const owner = one.people.find((person) => jobsOf(person) > 0) || (jobsOf(one.unattributed) ? { uid: "unknown", name: "ไม่ทราบผู้ทำ" } : null);
    if (owner && (!staffId || owner.uid === staffId)) documents.push({ id: row.id, type, staffId: owner.uid, staffName: owner.name, number: row.transferNumber || row.bookingNumber || row.documentNumber || row.id, date: row.serviceDate || bangkokDateOf(row.createdAt), branchCode: type === "transfer" ? row.toBranchCode || "" : row.branchCode || "" });
  };
  selected.reports.forEach((row) => add(row, row.type, "reports"));
  selected.transfers.forEach((row) => add(row, "transfer", "transfers"));
  selected.audits.forEach((row) => add(row, "auditDocs", "audits"));
  return { people, documents, total: people.reduce((sum, row) => sum + jobsOf(row), 0), activePeople: people.filter((row) => row.uid !== "unknown" && jobsOf(row) > 0).length, historicalSnapshot: false };
}

export const DOCUMENT_TYPES = [["booking", "ใบสั่งจอง"], ["online", "ใบขายออนไลน์"], ["transfer", "ใบโอน"], ["auditDocs", "ตรวจนับ"]];

export function buildOperationalDashboard(input) {
  const documents = buildDocumentDashboard(input).documents.map((row) => ({ ...row, key: `${row.type}:${row.id}`, sourceType: row.type === "auditDocs" ? "audit" : row.type, sourceId: row.id }));
  const cases = (input.cases || []).filter((row) => !row.deletedAt).map((row) => ({ ...row, key: `case:${row.id}`, staffId: row.responsibleId || "unknown", staffName: row.responsibleName || "ไม่ทราบผู้รับผิดชอบ" }));
  const inRange = (at) => { const day = bangkokDateOf(at); return Boolean(day && day >= input.from && day <= input.to); };
  const activities = cases.flatMap((row) => {
    const history = (row.history || []).map((event, index) => ({ ...event, index })).filter((event) => event.action === "closed");
    const events = history.length ? history : !isOpenCase(row) && row.resolvedAt ? [{ effectiveAt: row.resolvedAt, closure: row.closure, index: "legacy" }] : [];
    return events.filter((event) => inRange(event.effectiveAt)).map((event) => ({ ...row, ...event, key: `${row.key}:closure:${event.index}`, staffId: event.actorUid || "unknown", staffName: event.actorName || "ไม่ทราบผู้ปิด", ownerName: row.staffName }));
  });
  const names = new Map((input.roster || []).map((person) => [person.uid, { uid: person.uid, name: person.name }]));
  [...documents, ...cases, ...activities].forEach((row) => { if (!names.has(row.staffId)) names.set(row.staffId, { uid: row.staffId, name: row.staffName }); });
  return { from: input.from, to: input.to, today: input.today || bangkokDateOf(new Date().toISOString()), documents, cases, activities, people: [...names.values()], historicalSnapshot: false, legacyCoverageLimited: true };
}

// All chart segments and record lists share this scope; activity belongs to its actor, not the case owner.
export function selectOperationalScope(data, { staffId = "", branchCode = "", type = "" } = {}) {
  const matches = (row) => (!staffId || row.staffId === staffId) && (!branchCode || row.branchCode === branchCode) && (!type || (row.sourceType === "audit" ? "auditDocs" : row.sourceType || row.type) === type);
  const documents = data.documents.filter(matches);
  const cases = data.cases.filter(matches);
  const cohort = cases.filter((row) => { const day = bangkokDateOf(row.createdAt); return day && day >= data.from && day <= data.to; });
  const backlog = cases.filter(isOpenCase);
  const activities = data.activities.filter(matches);
  const lineRows = cohort.flatMap((row) => (row.lines || []).map((line) => ({ ...row, line, key: `${row.key}:line:${line.id}`, remaining: remainingOf(line) })));
  const knownLines = lineRows.filter(({ line }) => line.required > 0 && [line.required, line.received, line.cancelled].every((n) => Number.isFinite(n) && n >= 0) && line.received + line.cancelled <= line.required);
  const knownLineKeys = new Set(knownLines.map((row) => row.key));
  const receiving = [
    { id: "complete", label: "รับครบ", rows: knownLines.filter(({ line, remaining }) => remaining === 0 && line.cancelled === 0) },
    { id: "partial", label: "รับบางส่วน", rows: knownLines.filter(({ line, remaining }) => remaining > 0 && line.received > 0) },
    { id: "not_received", label: "ยังไม่ได้รับ", rows: knownLines.filter(({ line, remaining }) => remaining > 0 && line.received === 0) },
    { id: "cancelled", label: "ยุติด้วยการยกเลิก", rows: knownLines.filter(({ line, remaining }) => remaining === 0 && line.cancelled > 0) }
  ];
  const shortages = backlog.flatMap((row) => (row.lines || []).filter((line) => remainingOf(line) > 0).map((line) => ({ ...row, line, key: `${row.key}:line:${line.id}`, remaining: remainingOf(line), overdue: (line.allocations || []).some((a) => a.eta && a.eta < data.today) }))).sort((a, b) => Number(b.overdue) - Number(a.overdue) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const groupedParts = (field, unknown, labels = {}) => [...new Set(cohort.map((row) => row[field] || "unknown"))].map((id) => ({ id, label: labels[id] || (id === "unknown" ? unknown : id), rows: cohort.filter((row) => (row[field] || "unknown") === id) }));
  return { documents, cohort, backlog, activities, shortages, receiving, categoryParts: groupedParts("category", "ไม่ระบุประเภท", { shortage: "สินค้าขาด", wrong: "สินค้าผิด", damaged: "เสียหาย", document: "เอกสาร" }), causeParts: groupedParts("cause", "ไม่ระบุสาเหตุ"), unknownReceiving: cohort.filter((row) => !row.lines?.length || row.lines.some((line) => !knownLineKeys.has(`${row.key}:line:${line.id}`))), documentParts: DOCUMENT_TYPES.map(([id, label]) => ({ id, label, rows: documents.filter((row) => row.type === id) })), caseParts: [{ id: "open", label: "ยังไม่แก้เสร็จ", rows: cohort.filter(isOpenCase) }, { id: "fulfilled", label: "แก้เสร็จ · รับครบ", rows: cohort.filter((row) => !isOpenCase(row) && row.closure === "fulfilled") }, { id: "cancelled", label: "ปิดยกเลิก", rows: cohort.filter((row) => !isOpenCase(row) && row.closure === "cancelled") }, { id: "exception", label: "ปิดข้อยกเว้น", rows: cohort.filter((row) => !isOpenCase(row) && row.closure === "exception") }, { id: "unknown", label: "ปิดแบบไม่ระบุ", rows: cohort.filter((row) => !isOpenCase(row) && !["fulfilled", "cancelled", "exception"].includes(row.closure)) }], activityParts: [["fulfilled", "รับครบ"], ["cancelled", "ยกเลิก"], ["exception", "ข้อยกเว้น / ไม่ระบุ"]].map(([id, label]) => ({ id, label, rows: activities.filter((row) => id === "exception" ? !["fulfilled", "cancelled"].includes(row.closure) : row.closure === id) })) };
}

import { bangkokDateOf, buildRangeReport, jobsOf } from "./storeDailyReport.js";

export function buildDocumentDashboard({ from, to, roster = [], reports = [], transfers = [], audits = [], staffId = "", branchCode = "" }) {
  const range = { from, to, roster };
  const atBranch = (row, type) => !branchCode || (type === "transfer" ? row.toBranchCode : row.branchCode) === branchCode;
  const selected = { reports: reports.filter((row) => atBranch(row, row.type)), transfers: transfers.filter((row) => atBranch(row, "transfer")), audits: audits.filter((row) => atBranch(row, "audit")) };
  const report = buildRangeReport({ ...range, ...selected });
  const people = [...report.people, { ...report.unattributed, name: "ไม่ทราบผู้ทำ", uid: "unknown" }].filter((row) => !staffId || row.uid === staffId);
  const documents = [];
  const add = (row, type, collection) => {
    const one = buildRangeReport({ ...range, [collection]: [row] });
    const owner = one.people.find((person) => jobsOf(person) > 0) || (jobsOf(one.unattributed) ? { uid: "unknown", name: "ไม่ทราบผู้ทำ" } : null);
    if (owner && (!staffId || owner.uid === staffId)) documents.push({ id: row.id, type, staffId: owner.uid, staffName: owner.name, number: row.transferNumber || row.bookingNumber || row.documentNumber || row.id, date: row.serviceDate || bangkokDateOf(row.createdAt), branchCode: type === "transfer" ? row.toBranchCode || "" : row.branchCode || "" });
  };
  selected.reports.forEach((row) => add(row, row.type, "reports"));
  selected.transfers.forEach((row) => add(row, "transfer", "transfers"));
  selected.audits.forEach((row) => add(row, "auditDocs", "audits"));
  return { people, documents, total: people.reduce((sum, row) => sum + jobsOf(row), 0), activePeople: people.filter((row) => row.uid !== "unknown" && jobsOf(row) > 0).length, historicalSnapshot: false };
}

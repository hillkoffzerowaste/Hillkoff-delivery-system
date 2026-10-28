// Pure aggregation for the store dashboard (รายงานแดชบอร์ดสโตร์): transfers, internal audits and booking/online report counts.
import { lastNDates, thaiDateLabel } from "./storeFormat.js";

export const OVERVIEW_PERIODS = ["today", "7d", "month"];
export const OPEN_LIST_LIMIT = 20;
export const LATEST_MISMATCH_LIMIT = 10;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const PROBLEM_PACK_EVENTS = ["pack_partial", "pack_returned"];

export function bangkokDateOf(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !value) return "";
  return new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function labelParts(dateKey) {
  const [, day, month, year] = thaiDateLabel(dateKey).split(" ");
  return { day, month, year };
}

function rangeLabel(from, to) {
  const start = labelParts(from);
  const end = labelParts(to);
  if (from === to) return `${end.day} ${end.month} ${end.year}`;
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
  if (start.month !== end.month) return `${start.day} ${start.month} – ${end.day} ${end.month} ${end.year}`;
  return `${start.day}–${end.day} ${end.month} ${end.year}`;
}

export function periodRange(period, anchorDate) {
  if (!OVERVIEW_PERIODS.includes(period) || !thaiDateLabel(anchorDate)) return null;
  let dates;
  if (period === "today") dates = [anchorDate];
  else if (period === "7d") dates = lastNDates(anchorDate, 7);
  else dates = lastNDates(anchorDate, Number(anchorDate.slice(8, 10)));
  const from = dates[0];
  const to = dates[dates.length - 1];
  return { from, to, dates, label: rangeLabel(from, to) };
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const live = (item) => Boolean(item) && !item.deletedAt;

export function isReportProblem(report) {
  if (["waiting", "partial"].includes(report.status)) return true;
  return report.type === "online" && ["partial", "returned"].includes(report.packStatus);
}

function hadPackProblem(report) {
  const history = Array.isArray(report.workflowHistory) ? report.workflowHistory : [];
  return history.some((event) => PROBLEM_PACK_EVENTS.includes(event?.action));
}

function summarizeReports(reports, type, dateSet) {
  const rows = reports.filter((report) => live(report) && report.type === type && report.status !== "draft" && dateSet.has(bangkokDateOf(report.createdAt)));
  const open = rows.filter(isReportProblem).length;
  const problems = rows.filter((report) => isReportProblem(report) || hadPackProblem(report)).length;
  return { docs: rows.length, problems, open };
}

function resolveHours(transfer) {
  const resolvedAt = Date.parse(transfer.resolution?.at || "");
  const createdAt = Date.parse(transfer.createdAt || "");
  if (!Number.isFinite(resolvedAt) || !Number.isFinite(createdAt)) return null;
  return Math.max(0, (resolvedAt - createdAt) / 3_600_000);
}

function summarizeTransfers(transfers, openTransfers) {
  const rows = transfers.filter(live);
  const incompleteRows = rows.filter((row) => row.receipt === "incomplete");
  const resolvedRows = incompleteRows.filter((row) => row.issueState === "resolved");
  const openRows = incompleteRows.filter((row) => row.issueState === "open");
  const hours = resolvedRows.map(resolveHours).filter((value) => value !== null);

  const byCode = new Map();
  incompleteRows.forEach((row) => {
    const code = String(row.toBranchCode || "");
    const entry = byCode.get(code) || { code, name: row.toBranchName || code, resolved: 0, open: 0 };
    if (row.issueState === "resolved") entry.resolved += 1;
    if (row.issueState === "open") entry.open += 1;
    byCode.set(code, entry);
  });
  const byDestination = [...byCode.values()]
    .filter((entry) => entry.resolved + entry.open > 0)
    .sort((a, b) => b.resolved + b.open - (a.resolved + a.open) || a.code.localeCompare(b.code));

  const openList = openTransfers
    .filter((row) => live(row) && row.issueState === "open")
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .slice(0, OPEN_LIST_LIMIT)
    .map((row) => ({
      id: row.id || "",
      transferNumber: row.transferNumber || "",
      fromBranchName: row.fromBranchName || row.fromBranchCode || "",
      toBranchName: row.toBranchName || row.toBranchCode || "",
      note: row.note || "",
      createdAt: row.createdAt || ""
    }));

  return {
    total: rows.length,
    complete: rows.length - incompleteRows.length,
    incomplete: incompleteRows.length,
    resolved: resolvedRows.length,
    open: openRows.length,
    resolveRate: incompleteRows.length ? resolvedRows.length / incompleteRows.length : null,
    avgResolveHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null,
    byDestination,
    openList
  };
}

function summarizeAudits(audits, dates) {
  const dateSet = new Set(dates);
  const rows = audits.filter((audit) => live(audit) && dateSet.has(audit.serviceDate));
  const daily = dates.map((date) => {
    const dayRows = rows.filter((audit) => audit.serviceDate === date);
    const total = dayRows.reduce((sum, audit) => sum + num(audit.total), 0);
    const mismatch = dayRows.reduce((sum, audit) => sum + num(audit.mismatch), 0);
    return { date, docs: dayRows.length, total, match: total - mismatch, mismatch };
  });
  const total = daily.reduce((sum, day) => sum + day.total, 0);
  const mismatch = daily.reduce((sum, day) => sum + day.mismatch, 0);
  const activeDays = daily.filter((day) => day.total > 0).length;
  const latestMismatched = rows
    .filter((audit) => num(audit.mismatch) > 0)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, LATEST_MISMATCH_LIMIT)
    .map((audit) => ({
      id: audit.id || "",
      documentNumber: audit.documentNumber || "",
      branchName: audit.branchName || audit.branchCode || "",
      zone: audit.zone || "",
      note: audit.note || "",
      mismatch: num(audit.mismatch),
      total: num(audit.total),
      createdAt: audit.createdAt || ""
    }));
  return {
    docs: rows.length,
    total,
    match: total - mismatch,
    mismatch,
    accuracy: total > 0 ? (total - mismatch) / total : null,
    activeDays,
    avg: activeDays ? Math.round(total / activeDays) : 0,
    daily,
    latestMismatched
  };
}

export function buildStoreOverview({ period, anchorDate, transfers = [], audits = [], reports = [], openTransfers = [] }) {
  const range = periodRange(period, anchorDate);
  if (!range) return null;
  const dateSet = new Set(range.dates);
  return {
    period,
    from: range.from,
    to: range.to,
    rangeLabel: range.label,
    transfers: summarizeTransfers(transfers, openTransfers),
    audits: summarizeAudits(audits, range.dates),
    modules: {
      booking: summarizeReports(reports, "booking", dateSet),
      online: summarizeReports(reports, "online", dateSet)
    }
  };
}

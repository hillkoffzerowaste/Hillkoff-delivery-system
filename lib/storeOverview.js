// Pure aggregation for the store dashboard (รายงานแดชบอร์ดสโตร์): transfers, internal audits and booking/online report counts.
import { addDaysToDateKey, thaiDateLabel } from "./storeFormat.js";
import { buildRangeReport } from "./storeDailyReport.js";
import { publicWorkLog, sortWorkLogs } from "./storeWorkLog.js";

export const OVERVIEW_PERIODS = ["today", "7d", "month", "3m", "year"];
export const OPEN_LIST_LIMIT = 20;
export const LATEST_MISMATCH_LIMIT = 10;
export const RECENT_WORK_LOG_LIMIT = 30;
export const MAX_RANGE_DAYS = 366;
// Beyond about two months daily bars become unreadable, so charts switch to one bar per month.
export const DAILY_CHART_MAX_DAYS = 62;

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

function datesBetween(from, to) {
  const dates = [];
  for (let date = from; date && date <= to && dates.length <= MAX_RANGE_DAYS; date = addDaysToDateKey(date, 1)) dates.push(date);
  return dates;
}

function monthStartBefore(dateKey, months) {
  const [year, month] = dateKey.split("-").map(Number);
  const index = year * 12 + (month - 1) - months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

export function periodRange(period, anchorDate) {
  if (!OVERVIEW_PERIODS.includes(period) || !thaiDateLabel(anchorDate)) return null;
  const from = {
    today: anchorDate,
    "7d": addDaysToDateKey(anchorDate, -6),
    month: `${anchorDate.slice(0, 7)}-01`,
    "3m": monthStartBefore(anchorDate, 2),
    year: `${anchorDate.slice(0, 4)}-01-01`
  }[period];
  const dates = datesBetween(from, anchorDate);
  return { from, to: anchorDate, dates, label: rangeLabel(from, anchorDate) };
}

export function customRange(from, to) {
  if (!thaiDateLabel(from) || !thaiDateLabel(to) || from > to) return null;
  const dates = datesBetween(from, to);
  if (dates.length > MAX_RANGE_DAYS) return null;
  return { from, to, dates, label: rangeLabel(from, to) };
}

function groupByMonth(rows, keys) {
  const months = new Map();
  rows.forEach((row) => {
    const key = row.date.slice(0, 7);
    const entry = months.get(key) || Object.fromEntries([["date", key], ...keys.map((name) => [name, 0])]);
    keys.forEach((name) => { entry[name] += row[name]; });
    months.set(key, entry);
  });
  return [...months.values()];
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const live = (item) => Boolean(item) && !item.deletedAt;

export function isReportProblem(report) {
  if (["waiting", "partial"].includes(report.status)) return true;
  return ["booking", "online"].includes(report.type) && ["partial", "returned"].includes(report.packStatus);
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

function summarizeReportCharts(reports, dates) {
  const dateSet = new Set(dates);
  const rows = reports.filter((report) => live(report) && ["booking", "online"].includes(report.type) && report.status !== "draft" && dateSet.has(bangkokDateOf(report.createdAt)));
  const withProblem = (report) => isReportProblem(report) || hadPackProblem(report);
  const resolved = (report) => hadPackProblem(report) && !isReportProblem(report) && report.packStatus === "checked";
  const daily = dates.map((date) => {
    const day = rows.filter((report) => bangkokDateOf(report.createdAt) === date);
    return { date, booking: day.filter((x) => x.type === "booking").length, online: day.filter((x) => x.type === "online").length, bookingProblems: day.filter((x) => x.type === "booking" && withProblem(x)).length, onlineProblems: day.filter((x) => x.type === "online" && withProblem(x)).length, bookingResolved: day.filter((x) => x.type === "booking" && resolved(x)).length, onlineResolved: day.filter((x) => x.type === "online" && resolved(x)).length, problems: day.filter(withProblem).length };
  });
  const open = rows.filter(isReportProblem).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const issues = ["booking", "online"].flatMap((type) => open.filter((item) => item.type === type).slice(0, 20)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((item) => {
    const recent = [...(Array.isArray(item.workflowHistory) ? item.workflowHistory : [])].reverse().find((event) => PROBLEM_PACK_EVENTS.includes(event.action));
    return { id: item.id || "", type: item.type, bookingNumber: item.bookingNumber || "", detail: item.detail || "", reason: item.returnReason || item.note || recent?.reason || "", status: item.status || "", packStatus: item.packStatus || "", createdAt: item.createdAt || "" };
  });
  const resolvedRows = rows.filter(resolved);
  return { daily, issues, resolved: resolvedRows.length, resolvedByType: { booking: resolvedRows.filter(x => x.type === "booking").length, online: resolvedRows.filter(x => x.type === "online").length } };
}

function resolveHours(transfer) {
  const resolvedAt = Date.parse(transfer.resolution?.at || "");
  const createdAt = Date.parse(transfer.createdAt || "");
  if (!Number.isFinite(resolvedAt) || !Number.isFinite(createdAt)) return null;
  return Math.max(0, (resolvedAt - createdAt) / 3_600_000);
}

function summarizeTransfers(transfers, openTransfers, dates = []) {
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

  const daily = dates.map((date) => {
    const day = rows.filter((row) => row.serviceDate === date);
    const incomplete = day.filter((row) => row.receipt === "incomplete");
    return { date, complete: day.length - incomplete.length, incomplete: incomplete.length, open: incomplete.filter((row) => row.issueState === "open").length };
  });

  return {
    total: rows.length,
    complete: rows.length - incompleteRows.length,
    incomplete: incompleteRows.length,
    resolved: resolvedRows.length,
    open: openRows.length,
    resolveRate: incompleteRows.length ? resolvedRows.length / incompleteRows.length : null,
    avgResolveHours: hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null,
    byDestination,
    openList,
    daily
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

function recentWorkLogs(workLogs, from, to) {
  return sortWorkLogs(workLogs.filter((log) => live(log) && log.date >= from && log.date <= to)).reverse().slice(0, RECENT_WORK_LOG_LIMIT).map(publicWorkLog);
}

export function overviewRange({ period, anchorDate, from, to }) {
  return period === "custom" ? customRange(from, to) : periodRange(period, anchorDate);
}

export function buildStoreOverview({ period, anchorDate, from, to, transfers = [], audits = [], reports = [], openTransfers = [], roster = [], workLogs = [], staffRoles = {} }) {
  const range = overviewRange({ period, anchorDate, from, to });
  if (!range) return null;
  const dateSet = new Set(range.dates);
  const granularity = range.dates.length > DAILY_CHART_MAX_DAYS ? "month" : "day";
  const transferSummary = summarizeTransfers(transfers, openTransfers, range.dates);
  const auditSummary = summarizeAudits(audits, range.dates);
  const reportCharts = summarizeReportCharts(reports, range.dates);
  if (granularity === "month") {
    transferSummary.daily = groupByMonth(transferSummary.daily, ["complete", "incomplete", "open"]);
    auditSummary.daily = groupByMonth(auditSummary.daily, ["docs", "total", "match", "mismatch"]);
    reportCharts.daily = groupByMonth(reportCharts.daily, ["booking", "online", "bookingProblems", "onlineProblems", "bookingResolved", "onlineResolved", "problems"]);
  }
  const activeBars = auditSummary.daily.filter((bar) => bar.total > 0).length;
  auditSummary.chartAvg = granularity === "month" ? (activeBars ? Math.round(auditSummary.total / activeBars) : 0) : auditSummary.avg;
  const staff = buildRangeReport({ from: range.from, to: range.to, roster, reports, transfers, audits, workLogs });
  return {
    period,
    from: range.from,
    to: range.to,
    rangeLabel: range.label,
    granularity,
    transfers: transferSummary,
    audits: auditSummary,
    reportCharts,
    modules: {
      booking: summarizeReports(reports, "booking", dateSet),
      online: summarizeReports(reports, "online", dateSet)
    },
    staff: staff.people.map((p) => ({ ...p, position: staffRoles[p.uid]?.position || "", area: staffRoles[p.uid]?.area || "" })),
    workLogs: recentWorkLogs(workLogs, range.from, range.to)
  };
}

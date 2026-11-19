// Per-day summaries of booking/online reports. The dashboard reads these for days older than the
// live window instead of every report, so a whole-year view reads ~365 summaries, not ~20,000 reports.

export const REPORT_STATS_LIVE_DAYS = 45;
export const REPORT_DAY_KEYS = ["booking", "online", "bookingProblems", "onlineProblems", "bookingResolved", "onlineResolved", "problems"];
export const PROBLEM_PACK_EVENTS = ["pack_partial", "pack_returned", "pack_wrong"];

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const TYPES = ["booking", "online"];

export function bangkokDateOfReport(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !value) return "";
  return new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

// The store closing the report's case (after the pack room's latest result) ends the problem:
// goods still missing stay open until then; the pack room only records complete / incomplete / wrong.
export function isClosedByStore(report) {
  if (report?.caseStatus !== "closed") return false;
  const closedAt = Date.parse(report.caseUpdatedAt || "");
  const packAt = Date.parse(report.packUpdatedAt || "") || 0;
  return Number.isFinite(closedAt) && closedAt >= packAt;
}

export function isReportProblem(report) {
  if (isClosedByStore(report)) return false;
  if (["waiting", "partial"].includes(report.status)) return true;
  return TYPES.includes(report.type) && ["partial", "returned", "wrong"].includes(report.packStatus);
}

export function hadPackProblem(report) {
  return ["partial", "returned", "wrong"].includes(report?.packStatus) || packProblemEvents(report).length > 0;
}

export function packProblemEvents(report) {
  const events = new Map();
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const add = (event, checker = "") => {
    if (!PROBLEM_PACK_EVENTS.includes(event?.action)) return;
    const compact = { action: event.action, at: clean(event.at, 40), checkerName: clean(event.checkerName, 160), reason: clean(event.reason, 1000), storeCheckerName: clean(event.storeCheckerName || checker, 160) };
    const key = JSON.stringify([compact.action, compact.at, compact.checkerName, compact.reason]);
    const previous = events.get(key);
    if (!previous || (!previous.storeCheckerName && compact.storeCheckerName)) events.set(key, compact);
  };
  let checker = "";
  (Array.isArray(report?.workflowHistory) ? report.workflowHistory : []).forEach((event) => {
    if (["confirmed", "store_resubmitted"].includes(event?.action)) checker = clean(event.checkerName, 160);
    add(event, checker);
  });
  (Array.isArray(report?.packIssueHistory) ? report.packIssueHistory : []).forEach((event) => add(event));
  const currentAction = `pack_${report?.packStatus}`;
  if (PROBLEM_PACK_EVENTS.includes(currentAction) && ![...events.values()].some(event => event.action === currentAction && (!report.packUpdatedAt || event.at === report.packUpdatedAt))) {
    add({ action: currentAction, at: report.packUpdatedAt, checkerName: report.packCheckerName, reason: report.returnReason });
  }
  return [...events.values()].sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
}

export function summarizePackQuality(reports, { date = "" } = {}) {
  const unique = [...new Map((reports || []).filter(Boolean).map((report, index) => [report.id || `row-${index}`, report])).values()];
  const items = unique.filter((report) => isChartReport(report) && hadPackProblem(report)).map((report) => ({
    id: report.id || "", type: report.type, number: report.bookingNumber || report.id || "", serviceDate: report.serviceDate || bangkokDateOfReport(report.createdAt), detail: report.detail || "",
    state: isReportProblem(report) ? "open" : report.packStatus === "checked" || isClosedByStore(report) ? "resolved" : "awaitingRecheck",
    events: packProblemEvents(report),
    workflow: (Array.isArray(report.workflowHistory) ? report.workflowHistory : []).filter((event) => ["store_resubmitted", "pack_checked", "pack_auto_checked", "updated"].includes(event?.action))
  })).filter(item => !date || item.serviceDate === date || [...item.events, ...item.workflow].some(event => bangkokDateOfReport(event.at) === date));
  return { documents: items.length, open: items.filter((item) => item.state === "open").length, resolved: items.filter((item) => item.state === "resolved").length, awaitingRecheck: items.filter((item) => item.state === "awaitingRecheck").length, items };
}

const withProblem = (report) => isReportProblem(report) || hadPackProblem(report);
const isResolved = (report) => hadPackProblem(report) && !isReportProblem(report) && (report.packStatus === "checked" || isClosedByStore(report));
// Same rules the dashboard charts have always used: live, booking/online, not a draft, dated by createdAt.
export const isChartReport = (report) => Boolean(report) && !report.deletedAt && TYPES.includes(report.type) && report.status !== "draft";
// Same rule as the staff report: only confirmed reports count towards a checker.
const isCheckerCounted = (report) => Boolean(report) && !report.deletedAt && Boolean(report.confirmedAt) && TYPES.includes(report.type);

export function emptyReportDay(date) {
  return { date, ...Object.fromEntries(REPORT_DAY_KEYS.map((key) => [key, 0])), checkers: {} };
}

// One summary per date for every report created on that Bangkok date.
export function summarizeReportDays(reports, dates) {
  const days = new Map(dates.map((date) => [date, emptyReportDay(date)]));
  (reports || []).forEach((report) => {
    const day = days.get(bangkokDateOfReport(report?.createdAt));
    if (!day) return;
    if (isChartReport(report)) {
      day[report.type] += 1;
      if (withProblem(report)) {
        day[`${report.type}Problems`] += 1;
        day.problems += 1;
      }
      if (isResolved(report)) day[`${report.type}Resolved`] += 1;
    }
    if (isCheckerCounted(report)) {
      const name = String(report.storeCheckerName || "").trim();
      const entry = day.checkers[name] || { booking: 0, online: 0 };
      entry[report.type] += 1;
      day.checkers[name] = entry;
    }
  });
  return dates.map((date) => days.get(date));
}

// Firestore field names cannot be empty, so stored checker maps use "-" for "no name recorded".
export const toStoredDay = (day) => ({ ...day, checkers: Object.fromEntries(Object.entries(day.checkers).map(([name, counts]) => [name || "-", counts])) });
export const fromStoredDay = (doc) => ({
  ...emptyReportDay(doc.date),
  ...Object.fromEntries(REPORT_DAY_KEYS.map((key) => [key, Number(doc[key]) || 0])),
  checkers: Object.fromEntries(Object.entries(doc.checkers || {}).map(([name, counts]) => [name === "-" ? "" : name, { booking: Number(counts?.booking) || 0, online: Number(counts?.online) || 0 }]))
});

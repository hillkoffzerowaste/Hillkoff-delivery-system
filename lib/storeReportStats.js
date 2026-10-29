// Per-day summaries of booking/online reports. The dashboard reads these for days older than the
// live window instead of every report, so a whole-year view reads ~365 summaries, not ~20,000 reports.

export const REPORT_STATS_LIVE_DAYS = 45;
export const REPORT_DAY_KEYS = ["booking", "online", "bookingProblems", "onlineProblems", "bookingResolved", "onlineResolved", "problems"];
export const PROBLEM_PACK_EVENTS = ["pack_partial", "pack_returned"];

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const TYPES = ["booking", "online"];

export function bangkokDateOfReport(value) {
  const time = new Date(value || 0).getTime();
  if (!Number.isFinite(time) || !value) return "";
  return new Date(time + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function isReportProblem(report) {
  if (["waiting", "partial"].includes(report.status)) return true;
  return TYPES.includes(report.type) && ["partial", "returned"].includes(report.packStatus);
}

export function hadPackProblem(report) {
  const history = Array.isArray(report.workflowHistory) ? report.workflowHistory : [];
  return history.some((event) => PROBLEM_PACK_EVENTS.includes(event?.action));
}

const withProblem = (report) => isReportProblem(report) || hadPackProblem(report);
const isResolved = (report) => hadPackProblem(report) && !isReportProblem(report) && report.packStatus === "checked";
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

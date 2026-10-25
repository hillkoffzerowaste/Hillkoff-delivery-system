import { bangkokDateKey } from "./operationsReporting.js";

const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });

export function isKpiDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) >= 1900
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function kpiDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && value.length === 10) return isKpiDate(value) ? value : "";
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(typeof value === "object" && Number.isFinite(value.seconds) ? value.seconds * 1000 : value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "";
}

export function resolveKpiPeriod(selection, today = bangkokDateKey()) {
  const { mode = "daily", date = today, month = today.slice(0, 7), year = today.slice(0, 4) } = selection;
  let from, to;
  if (mode === "daily") from = to = date;
  else if (mode === "monthly" && /^\d{4}-\d{2}$/.test(month)) {
    from = `${month}-01`;
    if (!isKpiDate(from)) return null;
    to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  } else if (mode === "yearly" && /^\d{4}$/.test(String(year))) {
    from = `${year}-01-01`;
    to = `${year}-12-31`;
  } else if (mode === "range") ({ from, to } = selection);
  else return null;
  if (!isKpiDate(from) || !isKpiDate(to) || from > to) return null;
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > 366) return null;
  const label = mode === "daily" ? `รายวัน ${from}` : mode === "monthly" ? `รายเดือน ${month}` : mode === "yearly" ? `รายปี ${year}` : `${from} ถึง ${to}`;
  return { from, to, days, label };
}

export function isInKpiPeriod(value, period) {
  const key = kpiDateKey(value);
  return Boolean(key && period && key >= period.from && key <= period.to);
}

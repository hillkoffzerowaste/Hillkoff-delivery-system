// Pure formatting / Bangkok-date helpers shared by the store modules (server and client).

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;
const THAI_WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const THAI_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค."
];

export const fmt = (n) => Number(n).toLocaleString("th-TH");
export const pct = (part, total) => (total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "—");
export const one = (n) => Number(n).toLocaleString("th-TH", { maximumFractionDigits: 1 });

// Returns the UTC millisecond of Bangkok midnight for a valid key, otherwise null.
function bangkokMidnightMs(dateKey) {
  const match = DATE_KEY_PATTERN.exec(String(dateKey || ""));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return utc.getTime() - BANGKOK_OFFSET_MS;
}

function dateKeyFromUtcMidnight(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function bangkokDayRange(dateKey) {
  const start = bangkokMidnightMs(dateKey);
  if (start === null) return null;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS - 1).toISOString() };
}

export function bangkokRangeIso(fromKey, toKey) {
  const from = bangkokMidnightMs(fromKey);
  const to = bangkokMidnightMs(toKey);
  if (from === null || to === null || from > to) return null;
  return { start: new Date(from).toISOString(), endExclusive: new Date(to + DAY_MS).toISOString() };
}

export function bangkokMonthRange(monthKey) {
  const match = MONTH_KEY_PATTERN.exec(String(monthKey || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}` };
}

export function addDaysToDateKey(dateKey, days) {
  const start = bangkokMidnightMs(dateKey);
  if (start === null) return "";
  return dateKeyFromUtcMidnight(start + BANGKOK_OFFSET_MS + Number(days) * DAY_MS);
}

export function lastNDates(endDateKey, n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const dates = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const key = addDaysToDateKey(endDateKey, -offset);
    if (key) dates.push(key);
  }
  return dates;
}

export function bangkokTimeHHmm(isoString) {
  const time = new Date(isoString).getTime();
  if (!Number.isFinite(time)) return "";
  const shifted = new Date(time + BANGKOK_OFFSET_MS);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

export function thaiDateLabel(dateKey) {
  const start = bangkokMidnightMs(dateKey);
  if (start === null) return "";
  const date = new Date(start + BANGKOK_OFFSET_MS);
  const weekday = THAI_WEEKDAYS[date.getUTCDay()];
  return `${weekday} ${date.getUTCDate()} ${THAI_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear() + 543}`;
}

export function thaiMonthLabel(monthKey, { endDay } = {}) {
  const range = bangkokMonthRange(monthKey);
  if (!range) return "";
  const [year, month] = range.from.split("-").map(Number);
  const label = `${THAI_MONTHS[month - 1]} ${year + 543}`;
  return endDay ? `${label} (1–${endDay})` : label;
}

export function thaiBuddhistYY(dateKey) {
  const match = DATE_KEY_PATTERN.exec(String(dateKey || ""));
  if (!match) return "";
  return String((Number(match[1]) + 543) % 100).padStart(2, "0");
}

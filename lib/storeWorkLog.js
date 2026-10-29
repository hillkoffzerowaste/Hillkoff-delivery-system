// Personal daily work log (บันทึกงานประจำวัน): what each staff member did, where, when and how.
import { bangkokDayRange } from "./storeFormat.js";

export const WORK_LOG_LIMITS = { activity: 160, location: 120, detail: 1000 };
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = (value) => String(value ?? "").trim();

export function validateWorkLog(input = {}) {
  const date = text(input.date);
  const staffId = text(input.staffId);
  const start = text(input.start);
  const end = text(input.end);
  const activity = text(input.activity);
  const location = text(input.location);
  const detail = text(input.detail);
  if (!bangkokDayRange(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  if (!staffId || staffId.length > 200 || staffId.includes("/")) return { ok: false, error: "กรุณาเลือกพนักงาน" };
  if (!TIME_PATTERN.test(start)) return { ok: false, error: "กรุณาระบุเวลาเริ่มให้ถูกต้อง" };
  if (end && (!TIME_PATTERN.test(end) || end < start)) return { ok: false, error: "เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม" };
  if (!activity || activity.length > WORK_LOG_LIMITS.activity) return { ok: false, error: `กรุณาระบุงานที่ทำไม่เกิน ${WORK_LOG_LIMITS.activity} ตัวอักษร` };
  if (location.length > WORK_LOG_LIMITS.location) return { ok: false, error: `สถานที่ต้องไม่เกิน ${WORK_LOG_LIMITS.location} ตัวอักษร` };
  if (detail.length > WORK_LOG_LIMITS.detail) return { ok: false, error: "รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร" };
  return { ok: true, value: { date, staffId, start, end, activity, location, detail } };
}

export const workLogAt = (log) => new Date(`${log.date}T${log.start}:00+07:00`).toISOString();
export const workLogHours = (log) => (log.end ? `${log.start}–${log.end}` : log.start);

// Everything after the start time; the start time itself is shown in the timeline's time column.
export function workLogBody(log) {
  return [log.end ? `ถึง ${log.end}` : "", `${log.activity}${log.location ? ` @ ${log.location}` : ""}`, log.detail || ""].filter(Boolean).join(" · ");
}

export function workLogLine(log) {
  return [`${workLogHours(log)} ${log.activity}${log.location ? ` @ ${log.location}` : ""}`, log.detail || ""].filter(Boolean).join(" · ");
}

export function sortWorkLogs(logs) {
  return [...(logs || [])].sort((a, b) => text(a.date).localeCompare(text(b.date)) || text(a.start).localeCompare(text(b.start)) || text(a.createdAt).localeCompare(text(b.createdAt)));
}

// Drops audit metadata (uids, created stamps) but keeps updatedAt so the client can send it back for stale-edit checks.
export function publicWorkLog(log) {
  return { id: log.id || "", date: log.date, staffId: log.staffId, staffName: log.staffName || "", start: log.start, end: log.end || "", activity: log.activity, location: log.location || "", detail: log.detail || "", updatedAt: log.updatedAt || "" };
}

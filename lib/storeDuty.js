// Staff positions and daily duties beyond documents (e.g. head of the warehouse).
// A standing role lives per person; a duty for one date overrides it for that day only.
import { bangkokDayRange } from "./storeFormat.js";

export const DUTY_LIMITS = { position: 80, area: 160 };

const text = (value) => String(value ?? "").trim();

export function validateDuty(input = {}) {
  const scope = text(input.scope);
  const staffId = text(input.staffId);
  const date = text(input.date);
  const position = text(input.position);
  const area = text(input.area);
  if (!["default", "day"].includes(scope)) return { ok: false, error: "ประเภทหน้าที่ไม่ถูกต้อง" };
  if (!staffId || staffId.length > 200 || staffId.includes("/")) return { ok: false, error: "กรุณาเลือกพนักงาน" };
  if (scope === "day" && !bangkokDayRange(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  if (position.length > DUTY_LIMITS.position) return { ok: false, error: `ตำแหน่งต้องไม่เกิน ${DUTY_LIMITS.position} ตัวอักษร` };
  if (area.length > DUTY_LIMITS.area) return { ok: false, error: `ส่วนงานที่รับผิดชอบต้องไม่เกิน ${DUTY_LIMITS.area} ตัวอักษร` };
  if (scope === "day" && !position && !area) return { ok: false, error: "กรุณาระบุตำแหน่งหรือส่วนงานที่รับผิดชอบของวันนี้" };
  return { ok: true, value: scope === "day" ? { scope, staffId, date, position, area } : { scope, staffId, position, area } };
}

export const dayDutyId = (date, staffId) => `${date}_${staffId}`;

// roles: { [uid]: { position, area } }; duties: rows for one date with staffId.
export function resolveDuty(uid, roles = {}, duties = []) {
  const role = roles[uid] || {};
  const standing = { position: text(role.position), area: text(role.area) };
  const day = duties.find((item) => item && !item.deletedAt && item.staffId === uid);
  if (day) return { position: text(day.position), area: text(day.area), today: true, standing };
  return { ...standing, today: false, standing };
}

export const dutyText = (duty) => [text(duty?.position), text(duty?.area)].filter(Boolean).join(" · ");

export function rolesById(rows = []) {
  return Object.fromEntries(rows.filter((row) => row && row.id && (text(row.position) || text(row.area))).map((row) => [row.id, { position: text(row.position), area: text(row.area) }]));
}

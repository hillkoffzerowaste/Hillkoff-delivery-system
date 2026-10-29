import { bangkokDayRange, bangkokMonthRange } from "./storeFormat.js";
export function validateStorePlan(input = {}) {
 const title = String(input.title || "").trim(); const details = String(input.details || "").trim(); const scope = String(input.scope || ""); const date = String(input.date || "");
 if (!title || title.length > 160) return { ok: false, error: "กรุณาระบุชื่องานไม่เกิน 160 ตัวอักษร" };
 if (details.length > 1000) return { ok: false, error: "รายละเอียดต้องไม่เกิน 1,000 ตัวอักษร" };
 if (!bangkokDayRange(date) || !["daily", "monthly"].includes(scope)) return { ok: false, error: "ประเภทแผนหรือวันที่ไม่ถูกต้อง" };
 return { ok: true, value: { title, details, scope, date: scope === "monthly" ? `${date.slice(0,7)}-01` : date } };
}
export function calendarDays(month) {
 const range = bangkokMonthRange(month); if (!range) return [];
 const offset = new Date(`${range.from}T00:00:00Z`).getUTCDay(); const count = Number(range.to.slice(8,10));
 const rows = Array(offset).fill(null); for (let i = 1; i <= count; i += 1) rows.push(`${month}-${String(i).padStart(2,"0")}`);
 while (rows.length % 7) rows.push(null); return rows;
}

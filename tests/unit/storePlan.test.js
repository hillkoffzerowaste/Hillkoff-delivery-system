import { describe, expect, it } from "vitest";
import { validateStorePlan, calendarDays } from "../../lib/storePlan.js";
describe("store planning", () => {
 it("validates daily and monthly work plans and normalizes a monthly date", () => {
  expect(validateStorePlan({title:"ตรวจใบจอง",date:"2026-10-29",scope:"daily",details:"เช้า"})).toMatchObject({ok:true,value:{title:"ตรวจใบจอง",date:"2026-10-29",scope:"daily"}});
  expect(validateStorePlan({title:"สรุปงาน",date:"2026-10-29",scope:"monthly"})).toMatchObject({ok:true,value:{date:"2026-10-01",scope:"monthly"}});
  expect(validateStorePlan({title:"",date:"2026-10-29",scope:"daily"}).ok).toBe(false);
  expect(validateStorePlan({title:"x",date:"2026-02-30",scope:"daily"}).ok).toBe(false);
  expect(validateStorePlan({title:"x",date:"2026-10-29",scope:"unknown"}).ok).toBe(false);
 });
 it("lays out a real calendar including the month boundary", () => { const days=calendarDays("2026-10");expect(days).toHaveLength(35);expect(days[0]).toBeNull();expect(days[4]).toBe("2026-10-01");expect(days.at(-1)).toBe("2026-10-31");expect(calendarDays("2026-13")).toEqual([]); });
});

import { describe, expect, it } from "vitest";
import { selectPackBatch } from "../../lib/packReportHistory.js";
describe("pack bulk selection",()=>{it("selects at most 50 pending rows even for a month with hundreds of reports",()=>{const rows=Array.from({length:75},(_,i)=>({id:String(i),packStatus:i===0?"checked":"pending"}));const ids=selectPackBatch(rows);expect(ids).toHaveLength(50);expect(ids[0]).toBe("1");expect(ids.at(-1)).toBe("50");});});

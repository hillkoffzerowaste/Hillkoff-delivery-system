import { describe, expect, it } from "vitest";
import { filterPackReports, getPackHistoryMonthBounds } from "../../lib/packReportHistory.js";
describe("pack report history", () => {
 const rows = [{id:"a",type:"booking",confirmedAt:"x",packStatus:"pending"},{id:"b",type:"booking",confirmedAt:"x",packStatus:"checked"},{id:"c",type:"booking",confirmedAt:"",packStatus:"pending"},{id:"d",type:"online",confirmedAt:"x",packStatus:"checked"},{id:"e",type:"booking",confirmedAt:"x",packStatus:"checked",deletedAt:"x"}];
 it("allows completed records in history while keeping drafts, deleted records and other types out", () => { expect(filterPackReports(rows,{type:"booking",status:"all"}).map(x=>x.id)).toEqual(["a","b"]);expect(filterPackReports(rows,{type:"booking",status:"checked"}).map(x=>x.id)).toEqual(["b"]);expect(filterPackReports(rows,{type:"booking",status:"active"}).map(x=>x.id)).toEqual(["a"]); });
 it("computes Bangkok month bounds across year boundaries and rejects invalid months", () => { expect(getPackHistoryMonthBounds("2026-10")).toEqual({start:"2026-09-30T17:00:00.000Z",end:"2026-10-31T16:59:59.999Z"});expect(getPackHistoryMonthBounds("2026-13")).toBeNull();expect(getPackHistoryMonthBounds("2026-1")).toBeNull(); });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = (await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");

// fetchStoreReports อยู่ในคอมโพเนนต์ 8,000 บรรทัด เรียกแยกมาเทสต์ตรงๆ ไม่ได้ จึงยึดกฎไว้ที่ระดับ
// source แบบเดียวกับ dashboardLayout.test.js เพื่อกันการแก้กลับไปเป็นพฤติกรรมที่มีบัค
describe("store report fetch sequencing", () => {
  it("skips only background refreshes when a request is in flight, never user-initiated ones", () => {
    expect(pageSource).toContain("if (silent && storeReportsFetchInFlightRef.current) return;");
    // guard เดิมทิ้งทุกคำขอรวมถึงที่ผู้ใช้กดเอง ทำให้กดค้นหาตอน auto-refresh ทำงานแล้วไม่เกิดอะไรขึ้น
    expect(pageSource).not.toContain("if (storeReportsFetchInFlightRef.current) return;");
  });

  it("discards a response whose request has already been superseded", () => {
    expect(pageSource).toContain("if (generation !== storeReportsFetchGenerationRef.current) return;");
  });

  it("lets only the newest request clear the in-flight and loading flags", () => {
    expect(pageSource).toContain("if (generation === storeReportsFetchGenerationRef.current) {");
  });

  it("reads the live query from a ref so auto-refresh cannot reuse a stale search term", () => {
    expect(pageSource).toContain("query: storeReportSearchActive ? storeReportQueryRef.current : \"\"");
    expect(pageSource).toContain("storeReportQueryRef.current = storeReportQuery;");
  });
});

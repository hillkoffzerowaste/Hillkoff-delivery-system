import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../../app/layout.jsx", import.meta.url), "utf8");
const normalizedPageSource = pageSource.replaceAll("\r\n", "\n");

describe("dashboard layout", () => {
  it("does not render the retired five-card order summary on any page", () => {
    expect(pageSource).not.toContain('title="ออเดอร์วันนี้"');
    expect(pageSource).not.toContain('title="รอคนขับรับ"');
    expect(pageSource).not.toContain('title="กำลังส่ง"');
    expect(pageSource).not.toContain('title="ส่งสำเร็จ"');
    expect(pageSource).not.toContain('title="งานวิ่งวันนี้"');
  });

  it("keeps legacy customer editing beside the original sales customer panels", () => {
    expect(normalizedPageSource).toContain('<section className="panel">\n              <div className="panel-head"><h2>ข้อมูลลูกค้าเก่า</h2>');
    expect(normalizedPageSource).toContain('<section className="panel">\n              <div className="panel-head"><h2>เปิดออเดอร์ส่งของ</h2>');
    expect(normalizedPageSource).toContain('<section className="panel">\n              <div className="panel-head"><h2>เพิ่มลูกค้าใหม่</h2>');
  });

  it("renders the published shared sales workspace for every sales operations tab", () => {
    expect(pageSource).toContain('import { SalesWorkspace as SharedSalesWorkspace } from "@hillkoffzerowaste/sales-workspace"');
    expect(pageSource).toContain("Object.hasOwn(SHARED_SALES_VIEW_BY_TAB, displayTab)");
    expect(pageSource).toContain("adapter={sharedSalesAdapter}");
    expect(pageSource).toContain('sales: "overview"');
    expect(pageSource).toContain('"sales-outstation": "outstation"');
    expect(pageSource).toContain('dispatch: "dispatch"');
    expect(pageSource).toContain('chiangmai: "chiangmai"');
  });

  it("bundles Kanit locally so production builds do not depend on Google Fonts", () => {
    expect(layoutSource).not.toContain('next/font/google');
    expect(layoutSource).toContain('@fontsource/kanit/400.css');
  });
});

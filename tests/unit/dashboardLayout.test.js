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

  it("offers individual and select-all sales completion on the Chiang Mai preparation page", () => {
    expect(pageSource).toContain('canSalesCompleteChiangmaiOrder(order)');
    expect(pageSource).toContain('เลือกทั้งหมดที่จบงานได้');
    expect(pageSource).toContain('จบงานที่เลือก');
    expect(pageSource).toContain('/api/orders/chiangmai-complete');
  });

  it("keeps per-order deletion and adds multi-select deletion on the Chiang Mai preparation page", () => {
    expect(pageSource).toContain('canSalesDeleteChiangmaiOrder(order)');
    expect(pageSource).toContain('เลือกทั้งหมดที่ลบได้');
    expect(pageSource).toContain('ลบออเดอร์ที่เลือก');
    expect(pageSource).toContain('/api/orders/chiangmai-delete-bulk');
    expect(pageSource).toContain('ลบออเดอร์ที่กรอกผิด');
  });

  it("renders the in-app sales screens directly, with no shared workspace package", () => {
    expect(pageSource).not.toContain("@hillkoffzerowaste/sales-workspace");
    expect(pageSource).not.toContain("SharedSalesWorkspace");
    expect(pageSource).not.toContain("sharedSalesAdapter");
    expect(pageSource).not.toContain("SHARED_SALES_VIEW_BY_TAB");
  });

  it("owns every sales operations tab in this app, with no -legacy detour", () => {
    expect(pageSource).toContain('{displayTab === "sales" && (');
    expect(pageSource).toContain('{displayTab === "sales-outstation" && (');
    expect(pageSource).toContain('{displayTab === "dispatch" && (');
    expect(pageSource).toContain('{["chiangmai", "driver-prep"].includes(displayTab) && (');
    expect(pageSource).not.toContain("-legacy\"");
  });

  it("bundles Kanit locally so production builds do not depend on Google Fonts", () => {
    expect(layoutSource).not.toContain('next/font/google');
    expect(layoutSource).toContain('@fontsource/kanit/400.css');
  });
});

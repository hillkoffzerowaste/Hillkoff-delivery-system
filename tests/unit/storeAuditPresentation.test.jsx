import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreClaimsPanel, StoreProductionPanel, productionSalesLabel } from "../../app/components/store/StoreRecordsPanels.jsx";
import StoreDailyReport from "../../app/components/store/StoreDailyReport.jsx";
import StoreTransferPanel from "../../app/components/store/StoreTransferPanel.jsx";
import StoreAuditPanel from "../../app/components/store/StoreAuditPanel.jsx";
import StoreCasesPanel from "../../app/components/store/StoreCasesPanel.jsx";
import StorePlanningPanel, { readPlanningData } from "../../app/components/store/StorePlanningPanel.jsx";
import { normalizeStoreSettings } from "../../lib/storeSettings.js";

const props = { apiFetch: async () => {}, settings: normalizeStoreSettings({}), showHeading: false };

describe("store workspace presentation", () => {
  it.each([StoreClaimsPanel, StoreProductionPanel, StoreTransferPanel, StoreAuditPanel, StoreCasesPanel])("lets the shell supply the page title", (Panel) => {
    const html = renderToStaticMarkup(<Panel {...props} />);
    expect(html).not.toMatch(/<h2>(เคลมสินค้า|การผลิตสินค้า|ใบโอนสินค้า|Internal Audit สินค้า|ทะเบียนเคสและสินค้าขาด)<\/h2>/);
    expect(html).not.toMatch(/STORE OPERATIONS|STORE · CLAIMS|STORE · PRODUCTION/);
  });

  it("opens the daily report workflow directly with its LINE and personal tools", () => {
    const html = renderToStaticMarkup(<StoreDailyReport {...props} />);
    expect(html).toContain('aria-label="มุมมองรายงาน"');
    expect(html).toContain("ข้อความส่งกลุ่ม LINE");
    expect(html).not.toContain("ศูนย์ปฏิบัติการสโตร์");
  });

  it("does not present unknown sales as zero and marks partial sales", () => {
    expect(productionSalesLabel([{ items: [{ sold: null }] }])).toBe("—");
    expect(productionSalesLabel([{ items: [{ sold: 0 }] }])).toBe("0");
    expect(productionSalesLabel([{ items: [{ sold: 3 }, { sold: null }] }])).toBe("3 (ยังไม่ครบ)");
  });

  it("keeps unavailable booking results separate from a successful empty result", () => {
    const source = readFileSync(new URL("../../app/page.jsx", import.meta.url), "utf8");
    expect(source).toContain("setStoreReportsError(error?.message");
    expect(source).toContain("!storeReportsLoading && !storeReportsError && !selectedRows.length");
  });

  it("does not claim a calendar has no plans before its first successful load", () => {
    const html = renderToStaticMarkup(<StorePlanningPanel apiFetch={props.apiFetch} />);
    expect(html).not.toContain("ยังไม่มีแผนงาน");
    expect(html).toContain("กำลังโหลดแผนงาน");
  });

  it("reports a failed personal work-log read instead of showing zero activity", async () => {
    const apiFetch = async (url) => Response.json(url.includes("work-logs") ? { ok: false, error: "เข้าสู่ระบบใหม่" } : { ok: true, data: { items: [] } });
    await expect(readPlanningData(apiFetch, "2026-11", "u1")).rejects.toThrow("เข้าสู่ระบบใหม่");
  });

  it("loads personal plans and counts the real work logs", async () => {
    const apiFetch = async (url) => Response.json({ ok: true, data: { items: url.includes("work-logs") ? [{ date: "2026-11-01" }, { date: "2026-11-01" }] : [{ id: "p1" }] } });
    await expect(readPlanningData(apiFetch, "2026-11", "u1")).resolves.toEqual({ items: [{ id: "p1" }], counts: { "2026-11-01": 2 } });
  });

  it.each([StoreTransferPanel, StoreAuditPanel, StoreClaimsPanel, StoreProductionPanel])("keeps an unloaded document list distinct from an empty result", (Panel) => {
    const html = renderToStaticMarkup(<Panel {...props} />);
    expect(html).not.toMatch(/ยังไม่มีเอกสารตรวจนับ|ไม่มีรายการตามตัวกรองที่เลือก|ยังไม่มีเอกสารเคลม|ยังไม่มีรายการผลิตในช่วงนี้/);
    expect(html).toContain("กำลังโหลด");
  });
});

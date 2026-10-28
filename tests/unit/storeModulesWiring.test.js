import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = (await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");

const between = (start, end) => {
  const from = pageSource.indexOf(start);
  expect(from, `missing marker: ${start}`).toBeGreaterThan(-1);
  const to = pageSource.indexOf(end, from);
  expect(to, `missing marker: ${end}`).toBeGreaterThan(from);
  return pageSource.slice(from, to);
};

describe("store modules wiring in app/page.jsx", () => {
  it("resolves the store tab and sidebar from the store settings", () => {
    expect(pageSource).toContain("resolveStoreDisplayTab(tab, storeSettings)");
    expect(pageSource).toContain("getEnabledStoreModules(storeSettings)");
    expect(pageSource).toContain("STORE_SETTINGS_TAB_ID");
    expect(pageSource).toContain("ตั้งค่าสโตร์");
  });

  it("no longer hardcodes store-work in the store whitelist, login redirect or sidebar", () => {
    const displayTabSource = between("const displayTab = state.auth?.role", "document.addEventListener(\"visibilitychange\"");
    const storeBranch = displayTabSource.split("\n").find((line) => line.includes('state.auth?.role === "store"'));
    expect(storeBranch).not.toContain("store-work");
    expect(storeBranch).not.toContain("store-pickup");
    expect(pageSource).toContain("getFirstEnabledStoreTab(getDefaultStoreSettings())");
    expect(pageSource).not.toContain('json.data.role === "store" ? "store-work"');

    const sidebarSource = between('{auth.role === "store" && (\n            <>', '{auth.role === "pack" && (\n            <>');
    expect(sidebarSource).not.toContain("store-work");
    expect(sidebarSource).not.toContain("store-pickup");
  });

  it("renders the five new store panels only for the store role", () => {
    expect(pageSource).toContain('auth.role === "store" && displayTab === "store-dashboard"');
    expect(pageSource).toContain("<StoreDailyReport ");
    expect(pageSource).toContain("<StoreTransferPanel ");
    expect(pageSource).toContain("<StoreAuditPanel ");
    expect(pageSource).toContain("<StoreOverviewPanel ");
    expect(pageSource).toContain("<StoreSettingsPanel ");
    expect(pageSource).toContain("profile={storeProfile}");
    expect(pageSource).toContain("setFbUid(user?.uid");
  });

  it("keeps the PIN in memory only", () => {
    expect(pageSource).toContain("pin={storeSettingsPin}");
    expect(pageSource).not.toMatch(/(localStorage|sessionStorage)\.setItem\([^)]*[Pp]in/);
    expect(pageSource).toContain('if (state.auth?.role !== "store") setStoreSettingsPin("")');
  });

  it("loads store settings without blocking the UI and polls the unresolved transfer count", () => {
    expect(pageSource).toContain('authenticatedApiFetch("/api/store/settings")');
    expect(pageSource).toContain("normalizeStoreSettings(json.data?.settings)");
    expect(pageSource).toContain('authenticatedApiFetch("/api/store/transfers?alerts=true")');
    expect(pageSource).toContain("window.setInterval(fetchStoreTransferAlerts, REPORT_REFRESH_INTERVALS.issues)");
  });

  it("keeps the existing badge aria labels and adds the transfer badge", () => {
    expect(pageSource).toContain("`ใบสั่งจองของไม่ครบ ${storeBookingIssueCount} รายการ`");
    expect(pageSource).toContain("`ใบขายออนไลน์ของไม่ครบ ${storeOnlineIssueCount} รายการ`");
    expect(pageSource).toContain("`งานของไม่ครบรวม ${storeBookingIssueCount + storeOnlineIssueCount} รายการ`");
    expect(pageSource).toContain("`ใบโอนสินค้าไม่ครบที่ยังไม่แก้ไข ${storeTransferUnresolved.count} รายการ`");
  });

  it("titles the store tabs", () => {
    expect(pageSource).toContain('"store-dashboard": "รายงานประจำวัน · สโตร์"');
    expect(pageSource).toContain('"store-transfer": "ใบโอนสินค้า · สโตร์"');
    expect(pageSource).toContain('"store-audit": "Internal Audit · สโตร์"');
    expect(pageSource).toContain('"store-overview": "รายงานแดชบอร์ด · สโตร์"');
    expect(pageSource).toContain('"store-settings": "ตั้งค่าสโตร์"');
    expect(pageSource).toContain('"pack-dashboard": "รายงาน KPI ห้องแพ็ค"');
  });

  it("limits the shared operations KPI fetch to pack-dashboard and keeps the pack block intact", () => {
    expect(pageSource).toContain('const isOperationsKpi = displayTab === "pack-dashboard";');
    expect(pageSource).toContain('const isKpi = displayTab === "pack-dashboard";');
    expect(pageSource).not.toContain('["store-dashboard", "pack-dashboard"].includes(displayTab);');
    const reportEffect = between('const isKpi = displayTab === "pack-dashboard";', "const updateReportPackStatus");
    expect(reportEffect).not.toContain("store-dashboard");

    const packBlock = between('{displayTab === "pack-dashboard" && <OperationsKpiFilters', '{["pack-booking", "pack-online"].includes(displayTab)');
    expect(packBlock).toContain("<OperationsKpiFilters");
    expect(packBlock).toContain('copyPackSummary("daily")');
    expect(packBlock).toContain("<OperationsKpiDashboard");
  });

  it("removes the retired store KPI block from the store workspace", () => {
    expect(pageSource).not.toContain("copyStoreSummary");
    expect(pageSource).not.toContain("shareStoreSummary");
    expect(pageSource).not.toContain('displayTab === "store-dashboard" && <OperationsKpiFilters');
    expect(pageSource).not.toContain('displayTab === "store-dashboard" && kpiReady');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreTransferPanel, { TRANSFER_DRAFT_KEY } from "../../app/components/store/StoreTransferPanel.jsx";
import { getDefaultStoreSettings, normalizeStoreSettings } from "../../lib/storeSettings.js";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { items: [], summary: {}, count: 0 } }));
const profile = { uid: "store-1", name: "สโตร์หนึ่ง" };

function settingsWith(mutate = () => {}, { branches = true } = {}) {
  const settings = getDefaultStoreSettings();
  if (branches) {
    settings.branches = [
      { code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true },
      { code: "BR01", name: "สาขา 01", type: "สาขา", active: true },
      { code: "BR09", name: "สาขาเก่า", type: "สาขา", active: false }
    ];
  }
  if (!branches) settings.branches = [];
  mutate(settings);
  return normalizeStoreSettings(settings);
}

const render = (settings) => renderToStaticMarkup(<StoreTransferPanel apiFetch={apiFetch} settings={settings} profile={profile} onUnresolvedChange={() => {}} onNavigate={() => {}} />);
const field = (settings, id) => settings.documents.transfer.fields.find((item) => item.id === id);

describe("StoreTransferPanel", () => {
  it("renders the form, status chips and table headers", () => {
    const html = render(settingsWith());
    for (const text of ["เพิ่มรายการใบโอน", "เลขที่ใบโอน *", "อ้างอิงใบขอโอน", "ผู้จัดใบโอน *", "เลือกผู้จัด", "ยืนยันรายการ", "บันทึกร่าง", "+ เพิ่มรายการ", "ไม่มีรายการตามตัวกรองที่เลือก", "รายการใบโอน", "เลขที่ใบโอนรูปแบบ TR-0418"]) {
      expect(html).toContain(text);
    }
    for (const chip of ["ทั้งหมด · 0", "ยังไม่แก้ไข · 0", "แก้ไขแล้ว · 0", "สินค้าครบ · 0"]) expect(html).toContain(chip);
    expect(html).toContain('aria-label="กรองตามสถานะ"');
    expect(html).toContain('aria-label="ค้นหาใบโอน"');
    expect(html).toContain("ต้นทาง → ปลายทาง");
    expect(html).not.toContain("ข้อมูลตัวอย่าง");
  });

  it("offers only active branches in the branch dropdowns", () => {
    const html = render(settingsWith());
    expect(html).toContain("คลังหลัก");
    expect(html).toContain("สาขา 01");
    // the filter lists every branch for history, but the form must not offer the deactivated one
    const form = html.slice(html.indexOf('aria-label="เพิ่มรายการใบโอน"'), html.indexOf('aria-label="ค้นหาใบโอน"'));
    expect(form).not.toContain("สาขาเก่า");
  });

  it("shows the empty-branch message and disables confirming when no branch exists", () => {
    const html = render(settingsWith(() => {}, { branches: false }));
    expect(html).toContain("ยังไม่มีสาขา · ไปที่ตั้งค่าสโตร์ &gt; สาขา เพื่อเพิ่ม");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>ยืนยันรายการ<\/button>/);
  });

  it("uses the labels and required marks from settings", () => {
    const html = render(settingsWith((s) => {
      const ref = s.documents.transfer.fields.find((item) => item.id === "ref");
      ref.label = "ใบขอ X";
      ref.required = true;
      s.documents.transfer.fields.find((item) => item.id === "preparer").label = "คนจัด";
    }));
    expect(html).toContain("ใบขอ X *");
    expect(html).toContain("คนจัด *");
    expect(html).not.toContain("อ้างอิงใบขอโอน *");
  });

  it("does not render hidden fields", () => {
    const settings = settingsWith((s) => {
      s.documents.transfer.fields.find((item) => item.id === "ref").show = false;
      s.documents.transfer.fields.find((item) => item.id === "preparer").show = false;
    });
    expect(field(settings, "ref").show).toBe(false);
    const html = render(settings);
    // the table keeps its column headers; only the form inputs disappear
    expect(html).not.toContain('placeholder="RQ-0395"');
    expect(html).not.toContain("ผู้จัดใบโอน *");
    expect(html).not.toContain("เลือกผู้จัด");
    expect(html).toContain("เลขที่ใบโอน *");
  });

  it("does not show the cross-day banner before any unresolved transfer is loaded", () => {
    expect(render(settingsWith())).not.toContain("มีใบโอนสินค้าไม่ครบที่ยังไม่แก้ไข");
  });

  it("keeps drafts in the browser session only", () => {
    expect(TRANSFER_DRAFT_KEY).toBe("store-transfer-draft");
  });
});

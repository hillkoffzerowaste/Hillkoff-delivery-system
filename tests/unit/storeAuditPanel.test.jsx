import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreAuditPanel from "../../app/components/store/StoreAuditPanel.jsx";
import { normalizeStoreSettings } from "../../lib/storeSettings.js";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { items: [], documentNumber: "AU-0001" } }));
const profile = { uid: "store-1", name: "สโตร์หนึ่ง" };
const branches = [
  { code: "WH", name: "คลังหลัก", type: "คลังสินค้า" },
  { code: "BR01", name: "สาขา 01", type: "สาขา" },
  { code: "BR02", name: "สาขาปิด", type: "สาขา", active: false }
];
const render = (settings, props = {}) => renderToStaticMarkup(<StoreAuditPanel apiFetch={apiFetch} settings={settings} profile={profile} {...props} />);

describe("StoreAuditPanel", () => {
  const html = render(normalizeStoreSettings({ branches }));

  it("renders the page title, the form, today's table and the 7-day summary", () => {
    expect(html).toContain("Internal Audit สินค้า");
    expect(html).toContain("บันทึกผลตรวจนับ");
    expect(html).toContain("เอกสารตรวจนับวันนี้");
    expect(html).toContain("ตรวจนับทั้งหมดวันนี้");
    expect(html).toContain("สรุปตรวจนับรายวัน");
    expect(html).toContain("สรุปตรวจนับรายวัน · 7 วันล่าสุด");
    expect(html).toContain("เฉลี่ยตรวจนับต่อวัน");
    expect(html).toContain("รวม 7 วัน");
  });

  it("offers both divisors with the active-days one selected first", () => {
    expect(html).toContain("หารด้วย");
    expect(html).toContain('<option value="active" selected="">เฉพาะวันที่มีการตรวจนับ</option>');
    expect(html).toContain('<option value="calendar">ทุกวันตามปฏิทิน</option>');
    expect(html).toContain("หาร 1 วันที่มีการตรวจ");
  });

  it("shows seven day rows with the empty-day wording", () => {
    expect(html.match(/ไม่มีการตรวจนับ/g)).toHaveLength(7);
    expect(html).toContain("(วันนี้)");
  });

  it("shows the live mismatch box as a dash and the default checker name", () => {
    expect(html).toContain("สินค้าไม่ตรง (คำนวณอัตโนมัติ)");
    expect(html).toContain("<strong>—</strong>");
    expect(html).toContain('value="สโตร์หนึ่ง"');
    expect(html).toContain("ความแม่นยำ");
    expect(html).toContain("เลขที่เอกสารรันอัตโนมัติ (AU-0418)");
  });

  it("lists only active branches and keeps submit enabled", () => {
    expect(html).toContain("คลังหลัก");
    expect(html).toContain("สาขา 01");
    expect(html).not.toContain("สาขาปิด");
    expect(html).not.toContain("ยังไม่มีสาขา");
    expect(html).not.toMatch(/<button type="submit" class="primary" disabled/);
  });

  it("explains how to add a branch and disables saving when there is none", () => {
    const empty = render(normalizeStoreSettings({}));
    expect(empty).toContain("ยังไม่มีสาขา · ไปที่ตั้งค่าสโตร์ &gt; สาขา เพื่อเพิ่ม");
    expect(empty).toMatch(/<button type="submit" class="primary" disabled/);
  });

  it("follows the configured labels, hidden fields and required flags", () => {
    const custom = render(normalizeStoreSettings({
      branches,
      documents: {
        audit: {
          fields: [
            { id: "zone", label: "โซนจัดเก็บ", show: true, required: true },
            { id: "checker", label: "ผู้นับสต็อก", show: true, required: true },
            { id: "note", label: "ข้อสังเกต", show: false }
          ]
        }
      }
    }));
    expect(custom).toContain("โซนจัดเก็บ *");
    expect(custom).toContain("ผู้นับสต็อก *");
    expect(custom).not.toContain("ข้อสังเกต");
    expect(custom).not.toContain("เช่น ไซรัปคาราเมล");

    const hidden = render(normalizeStoreSettings({
      branches,
      documents: { audit: { fields: [{ id: "zone", show: false }, { id: "checker", show: false }] } }
    }));
    expect(hidden).not.toContain("เช่น หมวด A");
    expect(hidden).not.toContain("ชื่อผู้ตรวจ");
    expect(hidden).toContain("รายการที่ไม่ตรง");
  });

  it("uses the configured document prefix in the hint", () => {
    const custom = render(normalizeStoreSettings({ branches, documents: { audit: { prefix: "IA", digits: 5 } } }));
    expect(custom).toContain("เลขที่เอกสารรันอัตโนมัติ (IA-00418)");
  });

  it("never ships sample data", () => {
    expect(html).not.toContain("ข้อมูลตัวอย่าง");
    expect(html).not.toContain("AU-0201");
  });
});

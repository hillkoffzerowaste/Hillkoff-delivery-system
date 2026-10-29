import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreSettingsDocuments from "../../app/components/store/StoreSettingsDocuments.jsx";
import { getDefaultStoreSettings } from "../../lib/storeSettings.js";

const render = (draft = getDefaultStoreSettings()) => renderToStaticMarkup(<StoreSettingsDocuments draft={draft} onPatch={() => {}} />);
const plain = (html) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");

function withDocument(kind, patch) {
  const draft = getDefaultStoreSettings();
  draft.documents[kind] = { ...draft.documents[kind], ...patch };
  return draft;
}

describe("StoreSettingsDocuments", () => {
  it("renders the section headings and the default next number", () => {
    const html = render();
    expect(html).toContain("เลขที่และชื่อเอกสาร");
    expect(html).toContain("หัวเอกสาร (ใช้ร่วมทุกโมดูล)");
    expect(html).toContain("ช่องข้อมูลในฟอร์ม");
    expect(plain(html)).toContain("ตัวอย่างเลขที่ถัดไป: TR-0418 · เลขรันต่อเนื่องไม่รีเซ็ต");
    expect(html).toContain("ตัวอย่างหัวเอกสาร (อัปเดตทันที)");
  });

  it("lists the document modules by their configured names", () => {
    const draft = getDefaultStoreSettings();
    draft.modules.find((m) => m.id === "store-transfer").name = "ใบย้ายสินค้า";
    const html = render(draft);
    expect(html).toContain("ใบย้ายสินค้า");
    expect(html).toContain("Internal Audit");
    expect(html).toContain("ใบสั่งจอง");
    expect(html).toContain("ใบขายออนไลน์");
  });

  it("disables the checkboxes of locked fields and keeps hidable ones editable", () => {
    const html = render();
    const rows = html.split('class="ss-docs-field-row"').slice(1);
    expect(rows).toHaveLength(8);
    const byLabel = (label) => rows.find((row) => row.includes(`aria-label="ชื่อช่อง ${label}"`));
    // locked field: both "แสดง" and "บังคับกรอก" disabled, with the system badge
    expect(byLabel("เลขที่ใบโอน").match(/disabled=""/g)).toHaveLength(2);
    expect(byLabel("เลขที่ใบโอน")).toContain("ช่องระบบ");
    // hidable + optional field: nothing disabled
    expect(byLabel("อ้างอิงใบขอโอน")).not.toContain("disabled");
    expect(byLabel("อ้างอิงใบขอโอน")).not.toContain("ช่องระบบ");
  });

  it("disables the required checkbox of a field that is hidden", () => {
    const draft = getDefaultStoreSettings();
    const preparer = draft.documents.transfer.fields.find((f) => f.id === "preparer");
    preparer.show = false;
    preparer.required = false;
    const row = render(draft).split('class="ss-docs-field-row"').slice(1).find((r) => r.includes("ชื่อช่อง ผู้จัดใบโอน"));
    expect(row.match(/disabled=""/g)).toHaveLength(1);
  });

  it("hides the address and tax id in the preview when showAddress is false", () => {
    const draft = getDefaultStoreSettings();
    draft.header = { ...draft.header, address: "99 ถนนทดสอบ", taxId: "0123456789012", phone: "053-000000", showAddress: false };
    const html = render(draft);
    const paper = html.slice(html.indexOf("ss-docs-paper-head"));
    expect(paper).not.toContain("99 ถนนทดสอบ");
    expect(paper).not.toContain("เลขประจำตัวผู้เสียภาษี 0123456789012");
    draft.header.showAddress = true;
    const shown = render(draft);
    expect(shown.slice(shown.indexOf("ss-docs-paper-head"))).toContain("99 ถนนทดสอบ");
    expect(plain(shown)).toContain("เลขประจำตัวผู้เสียภาษี 0123456789012 · โทร 053-000000");
  });

  it("shows signature boxes only when showSign is on", () => {
    const draft = getDefaultStoreSettings();
    expect(render(draft)).toContain("ผู้ส่งสินค้า");
    expect(render(draft)).toContain("วันที่ ____/____/______");
    draft.header = { ...draft.header, showSign: false };
    expect(render(draft)).not.toContain("ผู้ส่งสินค้า");
  });

  it("hides the logo box when showLogo is off", () => {
    const draft = getDefaultStoreSettings();
    expect(render(draft)).toContain("ss-docs-logo");
    draft.header = { ...draft.header, showLogo: false };
    expect(render(draft)).not.toContain("ss-docs-logo");
  });

  it("builds the sample number from the pattern, prefix and digits", () => {
    expect(plain(render(withDocument("transfer", { pattern: "yymm" })))).toContain("ตัวอย่างเลขที่ถัดไป: TR6910-0418");
    expect(plain(render(withDocument("transfer", { pattern: "branch" })))).toContain("ตัวอย่างเลขที่ถัดไป: TR-CP-0418");
    expect(plain(render(withDocument("transfer", { digits: 5, prefix: "XF" })))).toContain("ตัวอย่างเลขที่ถัดไป: XF-00418");
    expect(plain(render(withDocument("transfer", { reset: "month" })))).toContain("เลขรันเริ่ม 1 ใหม่ทุกต้นเดือน");
    expect(plain(render(withDocument("transfer", { reset: "year" })))).toContain("เลขรันเริ่ม 1 ใหม่ทุกต้นปี");
  });

  it("uses the first active branch for the example number and defaults to the shared header", () => {
    const draft = getDefaultStoreSettings();
    draft.branches = [
      { code: "OLD", name: "สาขาปิด", type: "สาขา", active: false },
      { code: "BR9", name: "สาขาเก้า", type: "สาขา", active: true }
    ];
    draft.documents.transfer.pattern = "branch";
    const text = plain(render(draft));
    expect(text).not.toContain("สาขา: สาขาเก้า");
    expect(text).toContain("ข้อมูลส่วนกลาง");
    expect(text).toContain("ตัวอย่างเลขที่ถัดไป: TR-BR9-0418");
    expect(plain(render({ ...getDefaultStoreSettings(), branches: [] }))).not.toContain("สาขา: ");
  });

  it("marks required fields with * in the preview table and shows only visible fields", () => {
    const draft = getDefaultStoreSettings();
    draft.documents.transfer.fields.find((f) => f.id === "note").show = false;
    const html = render(draft);
    expect(html).toContain("ผู้จัดใบโอน *");
    expect(html).toContain("<th scope=\"col\">อ้างอิงใบขอโอน</th>");
    expect(html).not.toContain("<th scope=\"col\">หมายเหตุสินค้าไม่ครบ");
    expect(html).toContain("* = ช่องบังคับกรอก");
  });

  it("offers no add or delete buttons for fields", () => {
    const html = render();
    expect(html).not.toContain("เพิ่มช่องข้อมูล");
    expect(html).not.toContain("ลบช่อง");
  });
});

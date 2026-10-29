import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreAuditPanel from "../../app/components/store/StoreAuditPanel.jsx";
import { normalizeStoreSettings } from "../../lib/storeSettings.js";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { items: [] } }));
const settings = normalizeStoreSettings({ branches: [{ code: "WH", name: "คลังหลัก", type: "คลังสินค้า" }] });

describe("audit checker dropdown", () => {
  it("offers a roster dropdown and preselects a real person's name", () => {
    const html = renderToStaticMarkup(<StoreAuditPanel apiFetch={apiFetch} settings={settings} profile={{ uid: "u1", name: "สุภาพ" }} />);
    expect(html).toContain("<option value=\"\">เลือกผู้ตรวจนับ</option>");
    expect(html).toMatch(/<option value="สุภาพ" selected="">สุภาพ<\/option>/);
  });

  it("does not preselect the shared store login", () => {
    const html = renderToStaticMarkup(<StoreAuditPanel apiFetch={apiFetch} settings={settings} profile={{ uid: "shared", name: "store" }} />);
    expect(html).toMatch(/<option value="" selected="">เลือกผู้ตรวจนับ<\/option>/);
    expect(html).not.toContain('value="store"');
  });
});

describe("audit number with a locked prefix", () => {
  it("locks prefix and year-month and leaves only the running number to type", () => {
    const yymm = normalizeStoreSettings({ branches: [{ code: "WH", name: "คลังหลัก", type: "คลังสินค้า" }], documents: { audit: { title: "Audit", prefix: "STK-AUD", pattern: "yymm", digits: 4, reset: "month" } } });
    const html = renderToStaticMarkup(<StoreAuditPanel apiFetch={apiFetch} settings={yymm} profile={{ uid: "u1", name: "สุภาพ" }} />);
    expect(html).toMatch(/<span class="locked-number-prefix" aria-hidden="true">STK-AUD\d{4}-<\/span>/);
    expect(html).toContain("แก้ได้เฉพาะเลขรัน");
  });
});

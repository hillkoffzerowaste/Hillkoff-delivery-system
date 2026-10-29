import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreTransferPanel, { lockedNumberPrefix, runningPart } from "../../app/components/store/StoreTransferPanel.jsx";
import { normalizeStoreSettings } from "../../lib/storeSettings.js";

const cfg = { prefix: "STK-TRF", pattern: "yymm", digits: 4 };

describe("locked transfer number prefix", () => {
  it("locks the prefix and Buddhist year-month so only the running number is typed", () => {
    expect(lockedNumberPrefix(cfg, "2026-10-29")).toBe("STK-TRF6910-");
    expect(lockedNumberPrefix(cfg, "2027-01-02")).toBe("STK-TRF7001-");
    expect(lockedNumberPrefix({ prefix: "TR", pattern: "dash" }, "2026-10-29")).toBe("TR-");
    expect(lockedNumberPrefix({ prefix: "TR", pattern: "branch" }, "2026-10-29")).toBe("");
    expect(runningPart("STK-TRF6910-0042", "STK-TRF6910-")).toBe("0042");
    expect(runningPart("", "STK-TRF6910-")).toBe("");
  });

  it("shows the locked prefix and a numeric running-number box on the form", () => {
    const settings = normalizeStoreSettings({
      branches: [{ code: "WH", name: "คลัง", type: "คลังสินค้า" }, { code: "B1", name: "สาขา 1", type: "สาขา" }],
      documents: { transfer: { title: "ใบโอนสินค้า", prefix: "STK-TRF", pattern: "yymm", digits: 4, reset: "month" } }
    });
    const html = renderToStaticMarkup(<StoreTransferPanel apiFetch={async () => new Response("{}")} settings={settings} profile={{ uid: "u", name: "ณัฐ" }} />);
    expect(html).toMatch(/<span class="st-locked-prefix" aria-hidden="true">STK-TRF\d{4}-<\/span>/);
    expect(html).toContain('aria-label="เลขที่ใบโอน เลขรัน"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('aria-label="อ้างอิงใบขอโอน เดือน"');
    expect(html).toContain("กรอกเฉพาะเลขรัน");
  });
});

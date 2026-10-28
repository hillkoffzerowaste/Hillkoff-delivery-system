import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreOverviewPanel, { barHeights, branchWidths, chartScale, formatAccuracy, formatRate, formatResolveHours } from "../../app/components/store/StoreOverviewPanel.jsx";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: null }));

describe("StoreOverviewPanel", () => {
  it("renders the title, period buttons and the module table on first render", () => {
    const html = renderToStaticMarkup(<StoreOverviewPanel apiFetch={apiFetch} settings={{ modules: [] }} onNavigate={() => {}} />);
    expect(html).toContain("รายงานแดชบอร์ดสโตร์");
    expect(html).toContain('aria-label="ช่วงเวลา"');
    ["วันนี้", "7 วัน", "เดือนนี้"].forEach((label) => expect(html).toContain(`>${label}</button>`));
    expect(html).toContain('aria-pressed="true">7 วัน');
    expect(html).toContain("ภาพรวมทุกโมดูลสโตร์");
    expect(html).toContain("ไปหน้าใบโอน");
    expect(html).toContain("ไปหน้า Audit");
    ["ใบโอนทั้งหมด", "ไม่ครบ · ค้างแก้ไข", "อัตราแก้ไขแล้ว", "ตรวจนับทั้งหมด", "ความแม่นยำสต็อก", "เฉลี่ยตรวจนับต่อวัน"].forEach((label) => expect(html).toContain(label));
    expect(html).not.toContain("ข้อมูลตัวอย่าง");
  });

  it("takes module names from settings by id and falls back to defaults", () => {
    const settings = { modules: [{ id: "store-transfer", name: "โอนของ" }, { id: "store-audit", name: "ตรวจสต็อก" }] };
    const html = renderToStaticMarkup(<StoreOverviewPanel apiFetch={apiFetch} settings={settings} onNavigate={() => {}} />);
    expect(html).toContain(">โอนของ</th>");
    expect(html).toContain(">ตรวจสต็อก</th>");
    expect(html).toContain(">ใบสั่งจอง</th>");
    expect(html).toContain(">ใบขายออนไลน์</th>");
  });
});

describe("StoreOverviewPanel helpers", () => {
  it("formats resolve hours, rate and accuracy with a dash when empty", () => {
    expect(formatResolveHours(4.25)).toBe("4.3 ชม.");
    expect(formatResolveHours(null)).toBe("—");
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(2 / 3)).toBe("67%");
    expect(formatRate(null)).toBe("—");
    expect(formatAccuracy(0.9876)).toBe("98.8%");
    expect(formatAccuracy(null)).toBe("—");
  });

  it("scales bars from the tallest day or the average, with headroom", () => {
    const daily = [{ total: 200, mismatch: 10 }, { total: 100, mismatch: 0 }];
    expect(chartScale(daily, 150)).toBeCloseTo(230);
    expect(chartScale([], 0)).toBeCloseTo(1.15);
    expect(chartScale([{ total: 10, mismatch: 0 }], 500)).toBeCloseTo(575);
  });

  it("computes stacked bar heights and keeps a small mismatch visible", () => {
    expect(barHeights({ total: 100, mismatch: 20 }, 200)).toEqual({ match: 40, mismatch: 10 });
    expect(barHeights({ total: 1000, mismatch: 1 }, 1000).mismatch).toBe(1.5);
    expect(barHeights({ total: 0, mismatch: 0 }, 100)).toEqual({ match: 0, mismatch: 0 });
    expect(barHeights({ total: 5, mismatch: 0 }, 0)).toEqual({ match: 0, mismatch: 0 });
  });

  it("sizes branch bars against the busiest branch", () => {
    expect(branchWidths({ resolved: 1, open: 1 }, 4)).toEqual({ resolved: 25, open: 25 });
    expect(branchWidths({ resolved: 0, open: 0 }, 0)).toEqual({ resolved: 0, open: 0 });
  });
});

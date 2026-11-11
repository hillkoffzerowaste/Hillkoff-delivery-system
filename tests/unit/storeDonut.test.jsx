import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import StoreDonutChart from "../../app/components/store/StoreDonutChart.jsx";
it("exposes each nonempty arc and every legend as keyboard buttons with exact counts", () => {
  const html = renderToStaticMarkup(<StoreDonutChart title="เอกสาร" unit="เอกสาร" parts={[{ id: "a", label: "ใบโอน", rows: [{ id: "1" }, { id: "2" }] }, { id: "b", label: "ออนไลน์", rows: [] }]} onPick={() => {}} />);
  expect(html).toContain('role="button"'); expect(html).toContain('tabindex="0"'); expect(html).toContain("ใบโอน 2 เอกสาร"); expect(html).toContain("ออนไลน์ 0 เอกสาร"); expect(html).toContain("100%");
});
it("renders honest zero rather than a synthetic segment or percentage", () => {
  const html = renderToStaticMarkup(<StoreDonutChart title="เคส" unit="เคส" parts={[]} onPick={() => {}} />);
  expect(html).toContain("ไม่มีข้อมูลในขอบเขตนี้"); expect(html).not.toContain('role="button"');
});

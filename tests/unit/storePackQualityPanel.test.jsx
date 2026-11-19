import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import StorePackQuality from "../../app/components/store/StorePackQuality.jsx";

it("shows document, actual inspection and correction times, without blaming the latest checker", () => {
  const html = renderToStaticMarkup(<StorePackQuality quality={{ documents: 1, open: 0, resolved: 0, awaitingRecheck: 1, items: [{ id: "r", number: "CSP-1023", state: "awaitingRecheck", events: [{ action: "pack_returned", at: "2026-11-19T05:01:20.926Z", checkerName: "กิต", reason: "จัดผิด" }], workflow: [{ action: "store_resubmitted", at: "2026-11-19T06:57:41.219Z", checkerName: "สุภาพ" }] }] }} />);
  expect(html).toContain("CSP-1023");
  expect(html).toContain("รอห้องแพ็คตรวจซ้ำ");
  expect(html).toContain("12:01");
  expect(html).toContain("13:57");
  expect(html).toContain("กิต");
  expect(html).toContain("สุภาพ");
});

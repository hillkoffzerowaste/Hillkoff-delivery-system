import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CaseEditor } from "../../app/components/store/StoreCasesPanel.jsx";
it("shows legacy unknown lines without inventing zero and exposes quantity tracking", () => {
  const html = renderToStaticMarkup(<CaseEditor item={{ sourceType: "transfer", sourceId: "t", lines: [], status: "open", legacy: true }} onSave={() => {}} onCancel={() => {}} />);
  expect(html).toContain("ยังไม่ระบุรายการสินค้า"); expect(html).toContain("เพิ่มสินค้า"); expect(html).toContain("สาเหตุ");
});


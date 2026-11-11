import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentCharts, CaseSummary } from "../../app/components/store/StoreDashboardCharts.jsx";
import { CaseEditor } from "../../app/components/store/StoreCasesPanel.jsx";
it("renders document units separately from cases with accessible drilldown", () => {
  const html = renderToStaticMarkup(<DocumentCharts data={{ people: [{ uid: "u", name: "A", booking: 2, online: 1, transfer: 3, auditDocs: 4 }], total: 10, activePeople: 1 }} onPick={() => {}} />);
  expect(html).toContain("A"); expect(html).toContain("Audit 4 เอกสาร"); expect(html).toContain("เจาะเอกสารของ A");
  expect(renderToStaticMarkup(<CaseSummary summary={{ created: 3, cohortOpen: 2, cohortClosed: 1, backlog: 8, resolvedActivities: 4, cancelledActivities: 1, exceptionActivities: 0 }} />)).toContain("สถานะปัจจุบัน");
});
it("shows legacy unknown lines without inventing zero and exposes quantity tracking", () => {
  const html = renderToStaticMarkup(<CaseEditor item={{ sourceType: "transfer", sourceId: "t", lines: [], status: "open", legacy: true }} onSave={() => {}} onCancel={() => {}} />);
  expect(html).toContain("ยังไม่ระบุรายการสินค้า"); expect(html).toContain("เพิ่มสินค้า"); expect(html).toContain("สาเหตุ");
});

it("keeps closed-case cancellation separate from successful receipt", () => {
  const html = renderToStaticMarkup(<CaseSummary summary={{ created: 1, cohortOpen: 0, cohortClosed: 1, backlog: 0, resolvedActivities: 0, cancelledActivities: 1, exceptionActivities: 0 }} />);
  expect(html).toContain("ยกเลิกในช่วง (กิจกรรม)");
  expect(html).toContain("ข้อมูลเก่าที่ปิดก่อนเริ่มทะเบียนอาจไม่ครบ");
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DispatchDashboard from "../../app/components/DispatchDashboard.jsx";
import VehicleInspectionReport from "../../app/components/VehicleInspectionReport.jsx";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { rows: [], summary: {}, dataQuality: {}, vehicles: [], cards: {}, orders: [], driverLoads: [], availableDates: [] } }));

describe("operations replacement workspaces", () => {
  it("renders the completely replaced vehicle report controls", () => {
    const html = renderToStaticMarkup(<VehicleInspectionReport apiFetch={apiFetch} role="accounting" />);
    expect(html).toContain("รายงานการตรวจรถและการใช้รถ");
    expect(html).toContain("ส่งออกทั้งหมดตามตัวกรอง");
    expect(html).toContain("จัดการข้อมูล");
    expect(html).not.toContain("ดาวน์โหลด TXT");
  });

  it("renders a creation-date filter, eight cards and daily driver load", () => {
    const html = renderToStaticMarkup(<DispatchDashboard apiFetch={apiFetch} role="sales" onDeleteOrder={() => {}} onResetOrders={() => {}} />);
    expect(html).toContain("วันที่สร้างออเดอร์");
    expect(html).toContain("เชียงใหม่รอจัดส่ง");
    expect(html).toContain("เชียงใหม่ค้างส่ง");
    expect(html).toContain("ต่างจังหวัดรอจัดส่ง");
    expect(html).toContain("ออเดอร์ปัจจุบันแบบรายวัน");
    expect(html).not.toContain("วิธีใช้งานเร็ว");
  });
});

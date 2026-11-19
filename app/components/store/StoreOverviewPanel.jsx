"use client";

// เมนู "รายงานแดชบอร์ด" ของสโตร์ = แดชบอร์ดคลังสินค้าแบบใหม่ (รายงานประจำวัน / LINE อยู่ที่เมนูรายงานประจำวัน).
// StoreOverviewPanel.css still styles the shared so-* cards used by the planning calendar.
import "./StoreOverviewPanel.css";
import StoreWarehouseDashboard from "./StoreWarehouseDashboard.jsx";

export default function StoreOverviewPanel(props) {
  return <StoreWarehouseDashboard {...props} />;
}

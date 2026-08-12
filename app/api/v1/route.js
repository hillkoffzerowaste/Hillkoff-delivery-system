import { apiV1Json, apiV1Options, API_V1_VERSION } from "../../../lib/apiV1";

export const runtime = "nodejs";

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/me", scopes: [], description: "ตรวจสอบ API key และดูสิทธิ์ที่ได้รับ" },
  { method: "GET", path: "/api/v1/orders", scopes: ["orders:read"], description: "ค้นหาออเดอร์ (?q=) หรือดึงรายการเดียว (?id=)" },
  { method: "POST", path: "/api/v1/orders", scopes: ["orders:write"], description: "สร้างออเดอร์ใหม่" },
  { method: "POST", path: "/api/v1/orders/delete", scopes: ["orders:write"], description: "ลบออเดอร์" },
  { method: "PATCH", path: "/api/v1/orders/workflow", scopes: ["orders:write"], description: "เปลี่ยนสถานะออเดอร์ตาม workflow" },
  { method: "PATCH", path: "/api/v1/orders/chiangmai-rounds", scopes: ["orders:write"], description: "จัดรอบส่งเชียงใหม่" },
  { method: "POST", path: "/api/v1/orders/chiangmai-complete", scopes: ["orders:write"], description: "จบงานเชียงใหม่ที่ตรวจครบเป็นชุด" },
  { method: "POST", path: "/api/v1/orders/dispatch-dashboard", scopes: ["reports:read"], description: "สรุปภาพรวมการจ่ายงาน" },
  { method: "POST", path: "/api/v1/orders/report-range", scopes: ["reports:read"], description: "รายงานออเดอร์ตามช่วงวันที่" },
  { method: "GET", path: "/api/v1/customers", scopes: ["customers:read"], description: "ค้นหาลูกค้า (?q= หรือ ?all=true)" },
  { method: "POST", path: "/api/v1/customers", scopes: ["customers:write"], description: "สร้าง/แก้ไขข้อมูลลูกค้า" },
  { method: "GET", path: "/api/v1/customers/history", scopes: ["customers:read"], description: "ประวัติการสั่งของลูกค้า" },
  { method: "POST", path: "/api/v1/customers/delete", scopes: ["customers:write"], description: "ลบข้อมูลลูกค้า" },
  { method: "GET", path: "/api/v1/drivers", scopes: ["drivers:read"], description: "รายชื่อคนขับ" },
  { method: "POST", path: "/api/v1/drivers", scopes: ["drivers:write"], description: "สร้าง/แก้ไขข้อมูลคนขับ" },
  { method: "PATCH", path: "/api/v1/drivers", scopes: ["drivers:write"], description: "แก้ไขข้อมูลคนขับ" },
  { method: "DELETE", path: "/api/v1/drivers", scopes: ["drivers:write"], description: "ปิดการใช้งานคนขับ" },
  { method: "GET", path: "/api/v1/vehicles", scopes: ["vehicles:read"], description: "ทะเบียนรถทั้งหมด" },
  { method: "POST", path: "/api/v1/vehicles", scopes: ["vehicles:write"], description: "สร้าง/แก้ไขข้อมูลรถ" },
  { method: "PATCH", path: "/api/v1/vehicles", scopes: ["vehicles:write"], description: "แก้ไขข้อมูลรถ" },
  { method: "DELETE", path: "/api/v1/vehicles", scopes: ["vehicles:write"], description: "ปิดการใช้งานรถ" },
  { method: "POST", path: "/api/v1/vehicle-report", scopes: ["reports:read"], description: "รายงานการใช้รถตามช่วงเวลา" },
  { method: "GET", path: "/api/v1/tracking", scopes: ["tracking:read"], description: "สถานะการส่งสำหรับลูกค้า (?phone=)" }
];

export function GET(request) {
  return apiV1Json(request, {
    ok: true,
    data: {
      service: "hillkoff-delivery",
      version: API_V1_VERSION,
      auth: {
        header: "x-api-key: hk_live_...",
        alternative: "Authorization: Bearer hk_live_...",
        note: "API key ใช้ได้เฉพาะเส้นทาง /api/v1 เท่านั้น"
      },
      endpoints: ENDPOINTS
    }
  });
}

export { apiV1Options as OPTIONS };

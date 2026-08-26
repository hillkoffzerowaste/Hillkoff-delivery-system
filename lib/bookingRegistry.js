export const BOOKING_NUMBER_PATTERN = /^[^-\s]{1,20}-\d{4}$/;

export function normalizeBookingNumber(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function bookingMonthKey(serviceDate) {
  const month = String(serviceDate || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : "";
}

export function bookingRegistryId(serviceDate, bookingNumber) {
  const month = bookingMonthKey(serviceDate);
  const normalized = normalizeBookingNumber(bookingNumber);
  if (!month || !BOOKING_NUMBER_PATTERN.test(normalized)) return "";
  return `${month}__${normalized}`;
}

export const ORDER_REGISTRY_SOURCE = "orders";

// route เดิมเคยเขียน source เป็น "order" เอกพจน์ ทำให้ตัวอ่านทุกตัวมองไม่เห็นการจองนั้น
// (ลบออเดอร์แล้วเลขไม่ถูกปล่อย และรายงานสโตร์ขึ้น conflict) ยังต้องรับค่าเก่าเพราะมีข้อมูลค้างในระบบ
export function isOrderRegistrySource(value) {
  return ["orders", "order"].includes(String(value || ""));
}

export function bookingRegistryRecord({ serviceDate, bookingNumber, source, sourceId, customerName, createdAt, createdBy }) {
  const normalized = normalizeBookingNumber(bookingNumber);
  return {
    monthKey: bookingMonthKey(serviceDate),
    bookingNumber: normalized,
    source: String(source || ""),
    sourceId: String(sourceId || ""),
    customerName: String(customerName || "").slice(0, 200),
    createdAt: String(createdAt || new Date().toISOString()),
    createdBy: String(createdBy || "").slice(0, 200),
    // ออเดอร์แบบ pack assist ยืมการจองของรายงานสโตร์ไปใช้ได้ (canPackAssistShareBooking)
    // ต้องรู้ว่ามีใครยืมอยู่ ไม่งั้นตอนลบรายงานจะปล่อยเลขที่ออเดอร์ยังใช้อยู่ กลายเป็นจองซ้ำได้
    sharedWithOrderIds: []
  };
}

// ปล่อยการจองคืนได้เฉพาะตอนที่พิสูจน์ได้ว่าไม่มีออเดอร์ยืมอยู่ เรกคอร์ดเก่าที่ไม่มีฟิลด์นี้
// พิสูจน์ไม่ได้ จึงไม่ปล่อย (คงพฤติกรรมเดิม ดีกว่าเสี่ยงปล่อยเลขที่ยังถูกใช้)
export function canReleaseStoreReportReservation(registry, reportId) {
  if (String(registry?.source || "") !== "store_reports") return false;
  if (String(registry?.sourceId || "") !== String(reportId || "")) return false;
  return Array.isArray(registry?.sharedWithOrderIds) && registry.sharedWithOrderIds.length === 0;
}

export function normalizeBookingNumberList(values) {
  const raw = Array.isArray(values) ? values : values != null ? [values] : [];
  const seen = new Set();
  return raw
    .map(normalizeBookingNumber)
    .filter((v) => BOOKING_NUMBER_PATTERN.test(v) && !seen.has(v) && seen.add(v));
}

export function parseBookingNumberList(values) {
  const raw = Array.isArray(values) ? values : values != null ? [values] : [];
  if (raw.length > 20) return { ok: false, error: "เลขที่ใบสั่งจองต้องไม่เกิน 20 เลข", items: null };
  const normalized = raw.map(normalizeBookingNumber);
  const firstInvalid = normalized.find((v) => !BOOKING_NUMBER_PATTERN.test(v));
  if (firstInvalid !== undefined) return { ok: false, error: `เลขที่ใบสั่งจองไม่ถูกต้อง: ${firstInvalid || "(ว่าง)"}`, items: null };
  const seen = new Set();
  return { ok: true, error: null, items: normalized.filter((v) => !seen.has(v) && seen.add(v)) };
}

export function bookingConflictMessage(record) {
  const reference = record?.sourceId ? ` (${record.sourceId})` : "";
  const customer = record?.customerName ? ` · ${record.customerName}` : "";
  return `เลขที่ใบสั่งจอง ${record?.bookingNumber || "นี้"} ถูกใช้แล้วในเดือนนี้${reference}${customer}`;
}

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

export function bookingRegistryRecord({ serviceDate, bookingNumber, source, sourceId, customerName, createdAt, createdBy }) {
  const normalized = normalizeBookingNumber(bookingNumber);
  return {
    monthKey: bookingMonthKey(serviceDate),
    bookingNumber: normalized,
    source: String(source || ""),
    sourceId: String(sourceId || ""),
    customerName: String(customerName || "").slice(0, 200),
    createdAt: String(createdAt || new Date().toISOString()),
    createdBy: String(createdBy || "").slice(0, 200)
  };
}

export function bookingConflictMessage(record) {
  const reference = record?.sourceId ? ` (${record.sourceId})` : "";
  const customer = record?.customerName ? ` · ${record.customerName}` : "";
  return `เลขที่ใบสั่งจอง ${record?.bookingNumber || "นี้"} ถูกใช้แล้วในเดือนนี้${reference}${customer}`;
}

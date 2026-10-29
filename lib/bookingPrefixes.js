// ใบสั่งจอง and ใบขายออนไลน์ use different document heads; anything else goes through "เพิ่มรหัสเอง".
export const BOOKING_PREFIXES = { booking: ["CSP", "CSR", "TSR"], online: ["AS1", "AS2", "AS6", "AS7"] };
const ALL_BOOKING_PREFIXES = [...BOOKING_PREFIXES.booking, ...BOOKING_PREFIXES.online];

// "AS1-0042" -> { prefix: "AS1", digits: "0042" }; older values without a hyphen ("CSP0042") still split on a known head.
export function splitBookingNumber(value) {
  const raw = String(value || "").trim().toUpperCase();
  const hyphen = raw.lastIndexOf("-");
  if (hyphen >= 0) return { prefix: raw.slice(0, hyphen).replace(/-/g, ""), digits: raw.slice(hyphen + 1).replace(/\D/g, "").slice(0, 4) };
  const known = ALL_BOOKING_PREFIXES.find((item) => raw.startsWith(item) && /^\d*$/.test(raw.slice(item.length)));
  return known ? { prefix: known, digits: raw.slice(known.length).slice(0, 4) } : { prefix: raw, digits: "" };
}

export function joinBookingNumber(prefix, digits) {
  const cleanPrefix = String(prefix || "").replace(/[-\s]/g, "").toUpperCase().slice(0, 20);
  return cleanPrefix ? `${cleanPrefix}-${String(digits || "").replace(/\D/g, "").slice(0, 4)}` : "";
}

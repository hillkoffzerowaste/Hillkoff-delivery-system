"use client";

import { useState } from "react";
import { BOOKING_PREFIXES, joinBookingNumber, splitBookingNumber } from "../../lib/bookingPrefixes.js";

// Head select + 4-digit box for ใบสั่งจอง (kind "booking") and ใบขายออนไลน์ (kind "online").
export default function BookingNumberInput({ value, onChange, required = false, kind = "booking" }) {
  const prefixes = BOOKING_PREFIXES[kind] || BOOKING_PREFIXES.booking;
  const [customMode, setCustomMode] = useState(false);
  const parts = splitBookingNumber(value);
  // The custom box keeps whatever is typed (digits included, or a head from the other list) until a listed head is picked.
  const isCustom = customMode || Boolean(parts.prefix && !prefixes.includes(parts.prefix));
  const prefix = isCustom ? parts.prefix : parts.prefix || prefixes[0];
  const label = kind === "online" ? "ใบขายออนไลน์" : "ใบสั่งจอง";
  const emit = (nextPrefix, nextDigits) => onChange(joinBookingNumber(nextPrefix, nextDigits));
  return <div style={{ display: "grid", gridTemplateColumns: isCustom ? "92px minmax(84px, .7fr) minmax(0, 1fr)" : "92px minmax(0, 1fr)", gap: "var(--sp-3)" }}>
    <select value={isCustom ? "custom" : prefix} onChange={e => { const next = e.target.value; if (next === "custom") { setCustomMode(true); emit("", parts.digits); return; } setCustomMode(false); emit(next, parts.digits); }} aria-label={`คำนำหน้า${label}`}>{prefixes.map(item => <option key={item} value={item}>{item}</option>)}<option value="custom">เพิ่มรหัสเอง</option></select>
    {isCustom && <input value={prefix} onChange={e => emit(e.target.value, parts.digits)} maxLength={20} placeholder={`รหัสหน้า เช่น ${kind === "online" ? "AS3" : "CSX"}`} aria-label="กรอกรหัสหน้าเอง" autoComplete="off" />}
    <input value={parts.digits} onChange={e => emit(prefix, e.target.value)} inputMode="numeric" maxLength={4} placeholder={required ? "เลข 4 หลัก *" : "เลข 4 หลัก"} aria-label={`เลข 4 หลักของ${label}`} />
  </div>;
}

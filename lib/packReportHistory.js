import { bangkokMonthRange, bangkokRangeIso } from "./storeFormat.js";

export function filterPackReports(rows, { type, status = "active" } = {}) {
  return (rows || []).filter((item) => item.type === type && item.confirmedAt && !item.deletedAt && (status === "all" || (status === "active" && ["pending", "partial", "returned"].includes(item.packStatus)) || item.packStatus === status));
}

export function getPackHistoryMonthBounds(month) {
  const range = bangkokMonthRange(month);
  if (!range) return null;
  const iso = bangkokRangeIso(range.from, range.to);
  return { start: iso.start, end: new Date(Date.parse(iso.endExclusive) - 1).toISOString() };
}

export function selectPackBatch(rows) {
  return (rows || []).filter((item) => item.packStatus === "pending").slice(0, 50).map((item) => item.id);
}

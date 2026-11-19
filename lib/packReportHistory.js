import { bangkokMonthRange, bangkokRangeIso } from "./storeFormat.js";
import { isClosedByStore } from "./storeReportStats.js";

export function filterPackReports(rows, { type, status = "active" } = {}) {
  return (rows || []).filter((item) => item.type === type && item.confirmedAt && !item.deletedAt && (status === "all" || (status === "active" && ["pending", "partial", "returned", "wrong"].includes(item.packStatus) && !isClosedByStore(item)) || item.packStatus === status));
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

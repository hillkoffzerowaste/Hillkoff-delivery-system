const QR_PATTERN = /^HKO([12])\|([^|/\s]{1,120})\|([^|/\s]{0,120})\|(\d{1,5})\|(\d{1,5})$/;
const LEGACY_QR_PATTERN = /^HKO1\|([^|/\s]{1,120})\|(\d{1,5})\|(\d{1,5})$/;

function positiveInteger(value, fallback = 0) {
  const parsed = Math.trunc(Number(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanOrderId(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizedScans(value) {
  const unique = new Map();
  (Array.isArray(value) ? value : []).forEach(scan => {
    const boxIndex = positiveInteger(scan?.boxIndex);
    if (boxIndex && !unique.has(boxIndex)) unique.set(boxIndex, { ...scan, boxIndex });
  });
  return [...unique.values()].sort((left, right) => left.boxIndex - right.boxIndex);
}

export function createOutstationQrPayload(item = {}) {
  const orderId = cleanOrderId(item.orderId);
  const labelRevision = cleanOrderId(item.labelRevision);
  const boxIndex = positiveInteger(item.boxIndex);
  const boxTotal = positiveInteger(item.boxTotal);
  if (!orderId || !boxIndex || !boxTotal || boxIndex > boxTotal) throw new Error("Invalid outstation QR item");
  return labelRevision
    ? `HKO2|${orderId}|${labelRevision}|${boxIndex}|${boxTotal}`
    : `HKO1|${orderId}|${boxIndex}|${boxTotal}`;
}

function extractOutstationQrPayload(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("HKO1|") || raw.startsWith("HKO2|")) return raw;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return path === "/outstation-qr" ? String(url.searchParams.get("t") || "") : "";
  } catch {
    return "";
  }
}

export function parseOutstationQrPayload(value) {
  const raw = extractOutstationQrPayload(value);
  const legacyMatch = raw.match(LEGACY_QR_PATTERN);
  if (legacyMatch) {
    const [, orderId, boxIndexText, boxTotalText] = legacyMatch;
    const boxIndex = positiveInteger(boxIndexText);
    const boxTotal = positiveInteger(boxTotalText);
    if (!boxIndex || !boxTotal || boxIndex > boxTotal) throw new Error("Invalid outstation QR payload");
    return { orderId, labelRevision: "", boxIndex, boxTotal };
  }
  const match = raw.match(QR_PATTERN);
  if (!match) throw new Error("Invalid outstation QR payload");
  const [, version, orderId, labelRevision, boxIndexText, boxTotalText] = match;
  if (version !== "2" || !labelRevision) throw new Error("Invalid outstation QR payload");
  const boxIndex = positiveInteger(boxIndexText);
  const boxTotal = positiveInteger(boxTotalText);
  if (!boxIndex || !boxTotal || boxIndex > boxTotal) throw new Error("Invalid outstation QR payload");
  return { orderId, labelRevision, boxIndex, boxTotal };
}

export function validateOutstationDispatchOrder(order = {}, payload = {}) {
  if (order?.deliveryMethod !== "outstation") return false;
  const requiredRevision = String(order?.outstationLabelRevision || order?.outstationLabelInvalidatedAt || "").trim();
  const payloadRevision = String(payload?.labelRevision || "").trim();
  if (requiredRevision) return payloadRevision === requiredRevision;
  return true;
}

export function getOutstationScanOutcome(result = {}) {
  if (result.duplicate) return "duplicate";
  return result.complete ? "complete" : "scanned";
}

export function applyOutstationBoxScan(order = {}, payload = {}, actor = {}, now = new Date().toISOString()) {
  const expectedCount = positiveInteger(order.outstationDispatchBoxTotal) || positiveInteger(payload.boxTotal);
  const boxIndex = positiveInteger(payload.boxIndex);
  if (!expectedCount || !boxIndex || boxIndex > expectedCount) throw new Error("Invalid outstation QR payload");
  if (positiveInteger(payload.boxTotal) !== expectedCount) throw new Error("QR box total does not match the first scanned label");

  const scans = normalizedScans(order.outstationDispatchScans);
  const duplicate = scans.some(scan => scan.boxIndex === boxIndex);
  const scan = {
    boxIndex,
    scannedAt: now,
    scannedBy: String(actor.name || actor.email || "").trim().slice(0, 160),
    scannedByUid: String(actor.uid || "").trim().slice(0, 160),
    scannedRole: String(actor.role || "").trim().slice(0, 40)
  };
  const nextScans = duplicate ? scans : [...scans, scan].sort((left, right) => left.boxIndex - right.boxIndex);
  const scannedCount = nextScans.length;
  const complete = scannedCount === expectedCount;
  const patch = {
    outstationDispatchBoxTotal: expectedCount,
    outstationDispatchScans: nextScans,
    outstationDispatchScannedCount: scannedCount,
    outstationDispatchLastScannedAt: now,
    updatedAt: now
  };

  if (complete) {
    patch.status = "ส่งสำเร็จ";
    patch.queueStatus = "completed";
    patch.outstationDispatchedAt = order.outstationDispatchedAt || now;
    patch.outstationDispatchedBy = order.outstationDispatchedBy || scan.scannedBy;
  }

  return { duplicate, complete, scannedCount, expectedCount, patch, scan };
}

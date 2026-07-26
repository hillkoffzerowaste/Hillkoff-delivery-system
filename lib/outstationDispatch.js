const QR_PATTERN = /^HKO1\|([^|/\s]{1,120})\|(\d{1,5})\|(\d{1,5})$/;

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
  const boxIndex = positiveInteger(item.boxIndex);
  const boxTotal = positiveInteger(item.boxTotal);
  if (!orderId || !boxIndex || !boxTotal || boxIndex > boxTotal) throw new Error("Invalid outstation QR item");
  return `HKO1|${orderId}|${boxIndex}|${boxTotal}`;
}

function extractOutstationQrPayload(value) {
  const raw = String(value || "").trim();
  if (raw.startsWith("HKO1|")) return raw;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    return path === "/outstation-qr" ? String(url.searchParams.get("t") || "") : "";
  } catch {
    return "";
  }
}

export function parseOutstationQrPayload(value) {
  const match = extractOutstationQrPayload(value).match(QR_PATTERN);
  if (!match) throw new Error("Invalid outstation QR payload");
  const [, orderId, boxIndexText, boxTotalText] = match;
  const boxIndex = positiveInteger(boxIndexText);
  const boxTotal = positiveInteger(boxTotalText);
  if (!boxIndex || !boxTotal || boxIndex > boxTotal) throw new Error("Invalid outstation QR payload");
  return { orderId, boxIndex, boxTotal };
}

export function validateOutstationDispatchOrder(order = {}) {
  return order?.deliveryMethod === "outstation";
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

import { normalizeLabelDraft, validateLabelDraft } from "./outstationLabels.js";

const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const MAX_JOB_ITEMS = 10_000;

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanLines(value, maxLines, maxLength = 500) {
  const source = Array.isArray(value) ? value : [];
  return source.map(line => clean(line, maxLength)).filter(Boolean).slice(0, maxLines);
}

function required(value, field) {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

export function canReprintOutstationLabel(order = {}, jobCreatedAt = "") {
  if (order?.deliveryMethod !== "outstation") return false;
  const invalidatedAt = Date.parse(String(order?.outstationLabelInvalidatedAt || ""));
  if (!Number.isFinite(invalidatedAt)) return true;
  const createdAt = Date.parse(String(jobCreatedAt || ""));
  return Number.isFinite(createdAt) && createdAt >= invalidatedAt;
}

export function normalizeIdempotencyKey(value) {
  const key = clean(value, 200)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  if (key.length < 8 || !SAFE_ID_PATTERN.test(key)) throw new Error("Invalid idempotency key");
  return key;
}

export function sanitizeSenderProfile(input = {}) {
  const name = required(clean(input.name, 200), "sender name");
  const addressLines = cleanLines(input.addressLines, 3, 300);
  if (!addressLines.length) throw new Error("sender address is required");
  return { name, addressLines };
}

export function sanitizeRecipientRecord(input = {}) {
  const customerId = clean(input.customerId, 120);
  if (!SAFE_ID_PATTERN.test(customerId)) throw new Error("Invalid customer id");
  const recipientName = required(clean(input.recipientName, 200), "recipient name");
  const recipientAddressLines = cleanLines(input.recipientAddressLines, 4, 400);
  if (!recipientAddressLines.length) throw new Error("recipient address is required");
  const recipientPhone = clean(input.recipientPhone, 50);
  return {
    customerId,
    recipientName,
    recipientAddressLines,
    recipientPhone,
    phoneDigits: recipientPhone.replace(/\D/g, "")
  };
}

function sanitizePrintItem(input = {}, index = 0) {
  const normalized = normalizeLabelDraft(input);
  const validation = validateLabelDraft(normalized);
  if (!validation.ok) throw new Error(`Invalid label item ${index + 1}: ${validation.errors.join(", ")}`);
  if (!normalized.senderName || !normalized.senderAddressLines.length) {
    throw new Error(`Invalid sender details for label item ${index + 1}`);
  }

  const orderId = clean(input.orderId, 120);
  if (!SAFE_ID_PATTERN.test(orderId)) throw new Error(`Invalid order id for label item ${index + 1}`);
  const customerId = clean(input.customerId, 120);
  if (customerId && !SAFE_ID_PATTERN.test(customerId)) throw new Error(`Invalid customer id for label item ${index + 1}`);
  const boxIndex = Math.trunc(Number(input.boxIndex));
  const boxTotal = Math.trunc(Number(input.boxTotal));
  if (!Number.isInteger(boxIndex) || !Number.isInteger(boxTotal) || boxIndex < 1 || boxTotal < 1 || boxIndex > boxTotal) {
    throw new Error(`Invalid box sequence for label item ${index + 1}`);
  }
  const boxLabel = `${boxIndex}/${boxTotal}`;
  if (clean(input.boxLabel, 30) !== boxLabel) throw new Error(`Invalid box label for label item ${index + 1}`);
  const labelRevision = clean(input.labelRevision, 120);
  if (labelRevision && !/^[A-Za-z0-9:._-]+$/.test(labelRevision)) throw new Error(`Invalid label revision for label item ${index + 1}`);

  return {
    orderId,
    labelRevision,
    customerId,
    senderName: normalized.senderName,
    senderAddressLines: normalized.senderAddressLines,
    recipientName: normalized.recipientName,
    recipientAddressLines: normalized.recipientAddressLines,
    recipientPhone: normalized.recipientPhone,
    carrier: normalized.carrier,
    trackingCode: normalized.trackingCode,
    codEnabled: normalized.codEnabled,
    codAmount: normalized.codAmount,
    codDetail: normalized.codDetail,
    note: normalized.note,
    boxIndex,
    boxTotal,
    boxLabel
  };
}

export function sanitizePrintJob(input = {}) {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const sourceItems = Array.isArray(input.items) ? input.items : [];
  if (!sourceItems.length) throw new Error("Print job requires at least one item");
  if (sourceItems.length > MAX_JOB_ITEMS) throw new Error(`Print job exceeds ${MAX_JOB_ITEMS} items`);
  return {
    idempotencyKey,
    items: sourceItems.map(sanitizePrintItem)
  };
}

export function sanitizePrintStatusPatch(input = {}) {
  const status = clean(input.status, 20).toLowerCase();
  if (!["printed", "reprinted", "cancelled"].includes(status)) throw new Error("Invalid print status");
  const reason = clean(input.reason, 500);
  if (["reprinted", "cancelled"].includes(status) && !reason) throw new Error(`${status} reason is required`);
  return { status, reason };
}

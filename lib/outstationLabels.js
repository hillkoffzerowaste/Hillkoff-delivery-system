export const OUTSTATION_LABELS_PER_PAGE = 4;
export const GREEN_MAIL_TRACKING_DEFAULT = "BU003931";

export const DEFAULT_OUTSTATION_SENDER = Object.freeze({
  name: "บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)",
  addressLines: Object.freeze([
    "66 ณช้างเผือก ต.ศรีภูมิ",
    "อ.เมือง จ.เชียงใหม่ 50200",
    "โทร.053-213078"
  ])
});

function cleanText(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function cleanLines(value, maxLines, maxLength = 500) {
  const source = Array.isArray(value) ? value : cleanText(value, maxLength) ? [value] : [];
  return source.map(line => cleanText(line, maxLength)).filter(Boolean).slice(0, maxLines);
}

function finiteAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

export function getDefaultTrackingCode(carrier) {
  return cleanText(carrier, 100) === "เมล์เขียว" ? GREEN_MAIL_TRACKING_DEFAULT : "";
}

export function normalizeLabelDraft(input = {}) {
  return {
    senderName: cleanText(input.senderName, 200),
    senderAddressLines: cleanLines(input.senderAddressLines, 3, 300),
    recipientName: cleanText(input.recipientName, 200),
    recipientAddressLines: cleanLines(input.recipientAddressLines, 4, 400),
    recipientPhone: cleanText(input.recipientPhone, 50),
    carrier: cleanText(input.carrier, 100),
    trackingCode: cleanText(input.trackingCode, 160),
    codEnabled: Boolean(input.codEnabled),
    codAmount: finiteAmount(input.codAmount),
    codDetail: cleanText(input.codDetail, 500),
    note: cleanText(input.note, 500)
  };
}

export function buildLabelSnapshot(order = {}, draft = {}) {
  const boxTotal = Math.max(1, Math.trunc(Number(draft.boxTotal || order.boxes || 1)));
  const boxIndex = Math.min(boxTotal, Math.max(1, Math.trunc(Number(draft.boxIndex || 1))));
  const orderCod = finiteAmount(order.cod);
  const hasDraftCodEnabled = Object.prototype.hasOwnProperty.call(draft, "codEnabled");
  const carrier = draft.carrier ?? order.shippingCarrier;
  const normalized = normalizeLabelDraft({
    senderName: draft.senderName ?? DEFAULT_OUTSTATION_SENDER.name,
    senderAddressLines: draft.senderAddressLines ?? DEFAULT_OUTSTATION_SENDER.addressLines,
    recipientName: draft.recipientName ?? order.customerName,
    recipientAddressLines: draft.recipientAddressLines ?? [order.address || order.zone],
    recipientPhone: draft.recipientPhone ?? order.customerPhone ?? order.phone,
    carrier,
    trackingCode: draft.trackingCode ?? getDefaultTrackingCode(carrier),
    codEnabled: hasDraftCodEnabled ? draft.codEnabled : orderCod > 0,
    codAmount: draft.codAmount ?? orderCod,
    codDetail: draft.codDetail ?? "",
    note: draft.note ?? ""
  });

  return {
    orderId: cleanText(order.id, 120),
    customerId: cleanText(order.customerId, 120),
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
    boxLabel: `${boxIndex}/${boxTotal}`
  };
}

export function expandOrderToLabelItems(order = {}, draftOverrides = {}) {
  const total = Math.max(1, Math.trunc(Number(order.boxes || 1)));
  return Array.from({ length: total }, (_, index) => buildLabelSnapshot(order, {
    ...draftOverrides,
    boxIndex: index + 1,
    boxTotal: total
  }));
}

export function replaceOrderLabelItems(items = [], orderId, nextBoxTotal) {
  const targetOrderId = cleanText(orderId, 120);
  const total = Math.max(1, Math.trunc(Number(nextBoxTotal || 1)));
  const template = items.find(item => String(item?.orderId || "") === targetOrderId);
  if (!template || !targetOrderId) return items.slice();

  const order = {
    id: template.orderId,
    customerId: template.customerId,
    boxes: total,
    customerName: template.recipientName,
    customerPhone: template.recipientPhone,
    address: (template.recipientAddressLines || []).join("\n"),
    shippingCarrier: template.carrier,
    cod: template.codAmount
  };
  const replacements = Array.from({ length: total }, (_, index) => buildLabelSnapshot(order, {
    ...template,
    boxIndex: index + 1,
    boxTotal: total
  }));
  const result = [];
  let inserted = false;
  items.forEach(item => {
    if (String(item?.orderId || "") !== targetOrderId) {
      result.push(item);
      return;
    }
    if (!inserted) {
      result.push(...replacements);
      inserted = true;
    }
  });
  return result;
}

export function paginateLabelItems(items = [], pageSize = OUTSTATION_LABELS_PER_PAGE) {
  const normalizedPageSize = Math.max(1, Math.trunc(Number(pageSize || OUTSTATION_LABELS_PER_PAGE)));
  const pages = [];
  for (let index = 0; index < items.length; index += normalizedPageSize) {
    pages.push(items.slice(index, index + normalizedPageSize));
  }
  return pages;
}

export function validateLabelDraft(input = {}) {
  const draft = normalizeLabelDraft(input);
  const errors = [];
  if (!draft.recipientName) errors.push("recipientName");
  if (!draft.recipientAddressLines.length) errors.push("recipientAddress");
  if (!draft.carrier) errors.push("carrier");
  return { ok: errors.length === 0, errors };
}

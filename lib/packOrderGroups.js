const EXPLICIT_PACK_GROUP_FIELDS = [
  "packBatchId",
  "packGroupId",
  "orderGroupId",
  "batchId",
  "parentOrderId",
  "coffeeBlendId",
  "blendId",
  "mixGroupId"
];

function clean(value) {
  return String(value || "").trim();
}

function normalizedBookingNumbers(order = {}) {
  const values = Array.isArray(order.bookingNumbers)
    ? order.bookingNumbers
    : [order.bookingNumber];
  return [...new Set(values.map(clean).filter(Boolean).map((value) => value.toUpperCase()))].sort();
}

function customerKey(order = {}) {
  return clean(order.customerId) || clean(order.customerName).toLowerCase();
}

function serviceDateKey(order = {}) {
  return clean(order.serviceDate) || clean(order.createdAt).slice(0, 10);
}

function groupContextKey(order = {}) {
  return [
    customerKey(order),
    serviceDateKey(order),
    clean(order.deliveryMethod),
    clean(order.workflowType),
    clean(order.packageUnit) || "box"
  ].join("|");
}

export function getPackOrderGroupKey(order = {}) {
  const context = groupContextKey(order);
  const explicitGroupId = EXPLICIT_PACK_GROUP_FIELDS.map((field) => clean(order[field])).find(Boolean);
  if (explicitGroupId) return `explicit:${context}|${explicitGroupId}`;

  const bookingNumbers = normalizedBookingNumbers(order);
  if (bookingNumbers.length) return `booking:${context}|${bookingNumbers.join(",")}`;

  return `order:${clean(order.id)}`;
}

export function groupPackOrders(orders = []) {
  const groups = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== "object") continue;
    const key = getPackOrderGroupKey(order);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        orderIds: [],
        orders: [],
        representative: order,
        totalBoxes: 0,
        packageUnit: clean(order.packageUnit) || "box",
        isBatch: false
      };
      groups.set(key, group);
    }
    group.orderIds.push(clean(order.id));
    group.orders.push(order);
    group.totalBoxes += Math.max(0, Number(order.boxes) || 0);
    group.isBatch = group.orders.length > 1;
  }
  return [...groups.values()];
}

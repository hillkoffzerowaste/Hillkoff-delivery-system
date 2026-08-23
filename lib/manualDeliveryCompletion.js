function trimText(value, limit = 1000) {
  return String(value || "").trim().slice(0, limit);
}

export function buildSalesManualDeliveryCompletionPatch(order = {}, actor = {}, driver = {}, now = new Date().toISOString(), options = {}) {
  const previousDriverId = trimText(order.driverId, 160);
  const previousDriverName = trimText(order.driverName, 160);
  const actualDriverId = trimText(driver.id || driver.driverId, 160);
  const actualDriverName = trimText(driver.name, 160);
  const actorName = trimText(actor.name || actor.email || actor.uid, 160);
  const reason = trimText(options.reason);
  const history = {
    action: "sales_completed_delivery",
    result: "completed_by_sales",
    role: trimText(actor.role, 40),
    name: actorName,
    uid: trimText(actor.uid, 160),
    at: now,
    reason,
    actualDriverId,
    actualDriverName,
    previousDriverId,
    previousDriverName,
    previousStatus: trimText(order.status, 80)
  };
  return {
    patch: {
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      deliveryCompleteness: order.deliveryCompleteness || "complete",
      deliveredAt: order.deliveredAt || now,
      driverId: actualDriverId,
      driverName: actualDriverName,
      previousDriverId,
      previousDriverName,
      driverConfirmed: false,
      manualDeliveryCompletedAt: now,
      manualDeliveryCompletedBy: actorName,
      manualDeliveryCompletedByUid: trimText(actor.uid, 160),
      manualDeliveryCompletionReason: reason,
      updatedAt: now,
      workflowHistory: [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-99), history]
    },
    history
  };
}

import { getDeliverySheetUrl, postToGoogleAppsScript } from "./googleAppsScript";

function postToDeliverySheet(payload) {
  return postToGoogleAppsScript(getDeliverySheetUrl(), payload);
}

export async function syncDeliveryOrderToSheet(db, orderId, suppliedOrder = null) {
  const ref = db.collection("orders").doc(String(orderId));
  let order = suppliedOrder;
  if (!order) {
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: "Order not found" };
    order = snap.data();
  }
  const result = await postToDeliverySheet({ action: "upsertDailyDeliveryOrder", order: { id: String(orderId), ...order } });
  const now = new Date().toISOString();
  await ref.set({
    sheetSyncStatus: result?.ok === false ? "failed" : result?.skipped ? "skipped" : "synced",
    sheetSyncError: result?.ok === false ? String(result.error || "sync failed").slice(0, 500) : "",
    sheetSyncedAt: result?.ok === false || result?.skipped ? null : now
  }, { merge: true });
  return result;
}

export async function setupDeliverySheet() {
  return postToDeliverySheet({ action: "setupDeliveryWorkbook" });
}

import { after } from "next/server";
import { getDeliverySheetUrl, postToGoogleAppsScript } from "./googleAppsScript";

function postToDeliverySheet(payload) {
  return postToGoogleAppsScript(getDeliverySheetUrl(), payload);
}

async function runDeliverySheetSyncJobs(db, jobs) {
  const results = await Promise.allSettled(
    jobs.map(({ orderId, suppliedOrder }) => syncDeliveryOrderToSheet(db, orderId, suppliedOrder))
  );
  const failures = results
    .map((result, index) => {
      if (result.status === "rejected") return { orderId: jobs[index].orderId, error: result.reason?.message || String(result.reason) };
      if (result.value?.ok === false) return { orderId: jobs[index].orderId, error: result.value.error || "sheet sync failed" };
      return null;
    })
    .filter(Boolean);
  if (failures.length) console.warn("Delivery sheet background sync failed", failures);
}

function scheduleAfterResponse(task) {
  try {
    after(task);
  } catch (error) {
    // Unit tests and non-request callers do not have a Next.js after context.
    // Keep the manual/CLI path useful while route handlers still fail open.
    console.warn("Delivery sheet after-response scheduling unavailable", error?.message || error);
    void Promise.resolve().then(task).catch((taskError) => {
      console.warn("Delivery sheet background sync failed", taskError?.message || taskError);
    });
  }
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

export function scheduleDeliveryOrderSheetSync(db, orderId, suppliedOrder = null) {
  scheduleAfterResponse(() => runDeliverySheetSyncJobs(db, [{ orderId: String(orderId), suppliedOrder }]));
}

export function scheduleDeliverySheetSync(db, orders = []) {
  const jobs = (Array.isArray(orders) ? orders : [])
    .map((order) => ({ orderId: String(order?.id || ""), suppliedOrder: order }))
    .filter((job) => job.orderId);
  if (!jobs.length) return;
  scheduleAfterResponse(() => runDeliverySheetSyncJobs(db, jobs));
}

export async function setupDeliverySheet() {
  return postToDeliverySheet({ action: "setupDeliveryWorkbook" });
}

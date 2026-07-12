const DELIVERY_SHEET_URL = process.env.GOOGLE_DAILY_DELIVERY_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";

async function postToDeliverySheet(payload) {
  if (!DELIVERY_SHEET_URL) return { ok: true, skipped: true, error: "Missing GOOGLE_DAILY_DELIVERY_WEB_APP_URL" };
  try {
    const response = await fetch(DELIVERY_SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: text || `HTTP ${response.status}` };
    try { return JSON.parse(text); } catch { return { ok: true, raw: text }; }
  } catch (error) { return { ok: false, error: error?.message || String(error) }; }
}

export async function syncDeliveryOrderToSheet(db, orderId) {
  const snap = await db.collection("orders").doc(String(orderId)).get();
  if (!snap.exists) return { ok: false, error: "Order not found" };
  const result = await postToDeliverySheet({ action: "upsertDailyDeliveryOrder", order: { id: snap.id, ...snap.data() } });
  const now = new Date().toISOString();
  await snap.ref.set({
    sheetSyncStatus: result?.ok === false ? "failed" : result?.skipped ? "skipped" : "synced",
    sheetSyncError: result?.ok === false ? String(result.error || "sync failed").slice(0, 500) : "",
    sheetSyncedAt: result?.ok === false || result?.skipped ? null : now
  }, { merge: true });
  return result;
}

export async function setupDeliverySheet() {
  return postToDeliverySheet({ action: "setupDeliveryWorkbook" });
}

const DEFAULT_TIMEOUT_MS = 8000;

export function getMileageSheetUrl() {
  return process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
}

export function getDeliverySheetUrl() {
  return process.env.GOOGLE_DAILY_DELIVERY_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL || "";
}

export async function postToGoogleAppsScript(url, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!url) return { ok: true, skipped: true, reason: "Missing Google Apps Script URL" };

  const sharedSecret = String(process.env.GOOGLE_SHEETS_SHARED_SECRET || "").trim();
  if (!sharedSecret) {
    return { ok: false, skipped: true, error: "Missing GOOGLE_SHEETS_SHARED_SECRET" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, sharedSecret }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    if (!response.ok) return { ok: false, error: text.slice(0, 500) || `HTTP ${response.status}` };
    try {
      const result = JSON.parse(text);
      return result && typeof result === "object" ? result : { ok: false, error: "Invalid Apps Script response" };
    } catch {
      return { ok: false, error: "Non-JSON Apps Script response" };
    }
  } catch (error) {
    const message = error?.name === "TimeoutError" ? "Google Apps Script request timed out" : (error?.message || String(error));
    return { ok: false, error: String(message).slice(0, 500) };
  }
}

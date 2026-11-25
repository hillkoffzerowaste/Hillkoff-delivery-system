export async function forwardLineEvents(events) {
  const url = String(process.env.SCAN_TO_SHEET_LINE_EVENTS_URL || '').trim();
  const secret = String(process.env.SCAN_TO_SHEET_LINE_FORWARD_SECRET || '').trim();
  if (!url || !secret || !Array.isArray(events) || events.length === 0) {
    return { ok: false, skipped: true };
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Forward-Secret': secret,
      },
      body: JSON.stringify({ source: 'hillkoff-delivery-system', events }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}

export async function searchScanToSheet(query) {
  const url = String(process.env.SCAN_TO_SHEET_LINE_SEARCH_URL || '').trim();
  const secret = String(process.env.SCAN_TO_SHEET_LINE_FORWARD_SECRET || '').trim();
  if (!url || !secret) return { ok: false, skipped: true, results: [] };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Forward-Secret': secret,
      },
      body: JSON.stringify({ query: String(query || '').slice(0, 120) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { ok: false, status: response.status, results: [] };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, results: Array.isArray(payload.results) ? payload.results : [] };
  } catch (error) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed', results: [] };
  }
}

export async function summarizeScanToSheet(date) {
  const url = String(process.env.SCAN_TO_SHEET_LINE_SUMMARY_URL || '').trim();
  const secret = String(process.env.SCAN_TO_SHEET_LINE_FORWARD_SECRET || '').trim();
  if (!url || !secret) return { ok: false, skipped: true };
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Line-Forward-Secret': secret }, body: JSON.stringify({ date }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { ok: false, status: response.status };
    return await response.json();
  } catch (error) {
    return { ok: false, error: error?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}

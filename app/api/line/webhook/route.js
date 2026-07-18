import { getAdminDb } from "../../../../lib/firebaseAdmin";
import { verifyLineSignature } from "../../../../lib/lineOa";

export const runtime = "nodejs";

export async function POST(request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }
  const signature = request.headers.get("x-line-signature") || "";
  if (!verifyLineSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: "Invalid LINE signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const events = Array.isArray(payload?.events) ? payload.events.slice(0, 100) : [];
  if (!events.length) return Response.json({ ok: true });

  try {
    await getAdminDb().collection("line_webhook_events").add({
      events,
      destination: payload?.destination || "",
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }

  return Response.json({ ok: true });
}

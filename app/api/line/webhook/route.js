import { getAdminDb } from "../../../../lib/firebaseAdmin";
import { processPackEvents } from "../../../../lib/linePackEvents";
import { forwardLineEvents, searchScanToSheet, summarizeScanToSheet } from "../../../../lib/lineRelay";
import { replyLineCard, replyLinePackMenu, verifyLineSignature } from "../../../../lib/lineOa";

export const runtime = "nodejs";

export async function POST(request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }
  const signature = request.headers.get("x-line-signature") || "";
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // LINE's console verification probe is an empty event batch without a signature.
  // It carries no user data and must not bypass validation for real webhook events.
  const verificationProbe = !signature && Array.isArray(payload?.events) && payload.events.length === 0;
  if (!verificationProbe && !verifyLineSignature(rawBody, signature)) {
    return Response.json({ ok: false, error: "Invalid LINE signature" }, { status: 401 });
  }

  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (!events.length) return Response.json({ ok: true });

  const allowedGroups = new Set((process.env.LINE_ALLOWED_GROUP_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
  const result = await processPackEvents({ events, allowedGroups, getDb: getAdminDb, reply: replyLineCard, replyMenu: replyLinePackMenu, scanSearch: searchScanToSheet, scanSummary: summarizeScanToSheet });
  const relayEvents = events.filter((event) => (
    event?.source?.type === "group" && allowedGroups.has(String(event.source.groupId || ""))
  ));
  await forwardLineEvents(relayEvents);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}

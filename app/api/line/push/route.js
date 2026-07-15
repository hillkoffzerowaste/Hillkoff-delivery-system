import { pushLineText } from "../../../../lib/lineOa";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(payload?.text || "").trim();
  if (!text) return Response.json({ ok: false, error: "Missing text" }, { status: 400 });
  if (text.length > 5000) return Response.json({ ok: false, error: "LINE text exceeds 5000 characters" }, { status: 400 });

  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const to = String(process.env.LINE_DEFAULT_TO || "").trim();
    if (!to) return Response.json({ ok: false, error: "LINE_DEFAULT_TO is not configured" }, { status: 503 });
    const result = await pushLineText({ to, text, metadata: { uid: profile.uid, source: "api" } });
    await db.collection("notifications").add({
      channel: "line",
      to: to || process.env.LINE_DEFAULT_TO || "",
      text,
      result,
      createdByUid: profile.uid,
      createdAt: new Date().toISOString()
    });
    return Response.json({ ok: result.ok, data: result }, { status: result.ok ? 200 : 502 });
  } catch (error) { return errorResponse(error); }
}

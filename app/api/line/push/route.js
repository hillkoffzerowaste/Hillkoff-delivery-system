import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { pushLineText } from "../../../../lib/lineOa";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const text = String(payload?.text || "").trim();
  const to = String(payload?.to || "").trim();
  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!text) return Response.json({ ok: false, error: "Missing text" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const result = await pushLineText({ to, text, metadata: { uid: decoded.uid, source: "api" } });
    await getAdminDb().collection("notifications").add({
      channel: "line",
      to: to || process.env.LINE_DEFAULT_TO || "",
      text,
      result,
      createdByUid: decoded.uid,
      createdAt: new Date().toISOString()
    });
    return Response.json({ ok: result.ok, data: result });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

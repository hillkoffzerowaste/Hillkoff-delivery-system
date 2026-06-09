import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const customerId = String(payload?.customerId || "").trim();

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!customerId) return Response.json({ ok: false, error: "Missing customerId" }, { status: 400 });

  try {
    const auth = getAdminAuth();
    await auth.verifyIdToken(idToken, true);
    const db = getAdminDb();
    await db.collection("customers").doc(customerId).delete();
    return Response.json({ ok: true, data: { id: customerId } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

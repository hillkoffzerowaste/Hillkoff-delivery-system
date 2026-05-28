import { getAdminDb } from "../../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(payload?.token || "").trim();
  const role = String(payload?.role || "").trim();
  const phoneDigits = String(payload?.phoneDigits || "").trim();

  if (!token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
  if (!["driver", "sales"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  if (!phoneDigits) return Response.json({ ok: false, error: "Missing phoneDigits" }, { status: 400 });

  const db = getAdminDb();
  await db.collection("push_tokens").doc(token).set(
    {
      token,
      role,
      phoneDigits,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return Response.json({ ok: true });
}


import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(payload?.token || "").trim().slice(0, 4096);
  const role = String(payload?.role || "").trim();
  const deviceId = String(payload?.deviceId || "").trim().slice(0, 200);

  if (!token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
  if (!["driver", "sales"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  try {
    const { profile, db } = await requireProfile(request, ["driver", "sales"]);
    if (profile.role !== role) return Response.json({ ok: false, error: "Role mismatch" }, { status: 403 });
    const phoneDigits = String(profile.phoneDigits || profile.phone || "").replace(/\D/g, "");
    const driverId = profile.role === "driver" ? String(profile.driverId || "").trim() : "";
    if (!phoneDigits) return Response.json({ ok: false, error: "Profile phone is missing" }, { status: 400 });
    const ref = db.collection("push_tokens").doc(token);
    const current = await ref.get();
    const now = new Date().toISOString();
    await ref.set({
      token,
      role: profile.role,
      phoneDigits,
      driverId,
      deviceId,
      userAgent: String(request.headers.get("user-agent") || "").slice(0, 500),
      ownerUid: profile.uid,
      updatedAt: now,
      ...(!current.exists ? { createdAt: now } : {})
    }, { merge: true });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

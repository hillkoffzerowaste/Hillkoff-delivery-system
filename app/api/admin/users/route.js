import { getAdminAuth } from "../../../../lib/firebaseAdmin";
import { requireProfile, errorResponse } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    const snap = await db.collection("users").where("role", "in", ["store", "pack"]).limit(200).get();
    return Response.json({ ok: true, data: snap.docs.map((doc) => ({ uid: doc.id, ...doc.data(), password: undefined })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const username = String(body?.username || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const role = String(body?.role || "");
    const name = String(body?.name || "").trim();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return Response.json({ ok: false, error: "Invalid username" }, { status: 400 });
    if (password.length < 8) return Response.json({ ok: false, error: "Password must be at least 8 characters" }, { status: 400 });
    if (!["store", "pack"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
    const email = `${username}@staff.hillkoff.local`;
    const auth = getAdminAuth();
    let user;
    try { user = await auth.createUser({ email, password, displayName: name || username, disabled: false }); }
    catch (error) {
      if (error?.code !== "auth/email-already-exists") throw error;
      user = await auth.getUserByEmail(email);
      await auth.updateUser(user.uid, { password, displayName: name || username, disabled: false });
    }
    const now = new Date().toISOString();
    const userRef = db.collection("users").doc(user.uid);
    const existing = await userRef.get();
    await userRef.set({
      uid: user.uid,
      username,
      email,
      name: name || username,
      role,
      department: role,
      status: "approved",
      active: true,
      createdBy: profile.email,
      updatedAt: now,
      ...(existing.exists ? {} : { createdAt: now })
    }, { merge: true });
    return Response.json({ ok: true, data: { uid: user.uid, username, name: name || username, role } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const uid = String(body?.uid || "");
    if (!uid) return Response.json({ ok: false, error: "Missing uid" }, { status: 400 });
    const patch = { updatedAt: new Date().toISOString() };
    if (typeof body.active === "boolean") patch.active = body.active;
    if (body.name) patch.name = String(body.name).trim();
    await db.collection("users").doc(uid).set(patch, { merge: true });
    // ต้องส่ง disabled เฉพาะตอนที่ body ระบุ active มาจริง ไม่งั้นการแก้แค่ชื่อจะได้
    // disabled: false ติดไปด้วย (undefined === false เป็น false) แล้วปลดแบนบัญชีที่แอดมินปิดไว้
    const authUpdate = {};
    if (typeof body.active === "boolean") authUpdate.disabled = !body.active;
    if (patch.name) authUpdate.displayName = patch.name;
    if (Object.keys(authUpdate).length) await getAdminAuth().updateUser(uid, authUpdate);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

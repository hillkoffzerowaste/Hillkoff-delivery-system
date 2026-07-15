import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const DEFAULT_CHECKERS = {
  store: ["เล็ก", "ณัฐ", "สุภาพ", "ลืน", "โจ้", "สมนึก"],
  pack: ["กิต", "มาย", "ยุทธ", "หล้า", "มุก"]
};

function cleanNames(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.map((name) => String(name || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 50);
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "pack", "admin"]);
    const snap = await db.collection("app_settings").doc("preparation_checkers").get();
    const data = snap.exists ? snap.data() : {};
    return Response.json({ ok: true, data: { store: cleanNames(data.store, DEFAULT_CHECKERS.store), pack: cleanNames(data.pack, DEFAULT_CHECKERS.pack) } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "pack", "admin"]);
    const body = await request.json();
    const current = await db.collection("app_settings").doc("preparation_checkers").get();
    const saved = current.exists ? current.data() : {};
    const canEditStore = profile.role === "store" || profile.role === "admin";
    const canEditPack = profile.role === "pack" || profile.role === "admin";
    const data = {
      store: canEditStore ? cleanNames(body?.store, cleanNames(saved.store, DEFAULT_CHECKERS.store)) : cleanNames(saved.store, DEFAULT_CHECKERS.store),
      pack: canEditPack ? cleanNames(body?.pack, cleanNames(saved.pack, DEFAULT_CHECKERS.pack)) : cleanNames(saved.pack, DEFAULT_CHECKERS.pack),
      updatedAt: new Date().toISOString(), updatedBy: profile.name || profile.email, updatedByUid: profile.uid
    };
    await db.collection("app_settings").doc("preparation_checkers").set(data, { merge: true });
    return Response.json({ ok: true, data: { store: data.store, pack: data.pack } });
  } catch (error) { return errorResponse(error); }
}

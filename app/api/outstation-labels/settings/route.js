import { DEFAULT_OUTSTATION_SENDER } from "../../../../lib/outstationLabels";
import { sanitizeSenderProfile } from "../../../../lib/outstationLabelStorage";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function asBadRequest(error) {
  if (!error?.status) error.status = 400;
  return error;
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const snap = await db.collection("outstation_label_settings").doc("default").get();
    const data = snap.exists ? snap.data() || {} : DEFAULT_OUTSTATION_SENDER;
    return Response.json({ ok: true, data: sanitizeSenderProfile(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    let payload;
    try { payload = await request.json(); }
    catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
    let sender;
    try { sender = sanitizeSenderProfile(payload?.sender || payload); }
    catch (error) { throw asBadRequest(error); }
    const now = new Date().toISOString();
    await db.collection("outstation_label_settings").doc("default").set({
      ...sender,
      updatedAt: now,
      updatedByUid: profile.uid,
      updatedByName: String(profile.name || profile.email || "").slice(0, 200)
    }, { merge: true });
    return Response.json({ ok: true, data: sender });
  } catch (error) {
    return errorResponse(error);
  }
}

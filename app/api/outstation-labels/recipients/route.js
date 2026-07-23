import { createHash } from "node:crypto";
import { sanitizeRecipientRecord } from "../../../../lib/outstationLabelStorage";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function cleanId(value) {
  const id = String(value || "").trim().slice(0, 120);
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) throw Object.assign(new Error("Invalid customer id"), { status: 400 });
  return id;
}

function addressRecordId(record) {
  return createHash("sha256")
    .update([record.customerId, record.recipientName, ...record.recipientAddressLines, record.phoneDigits].join("\n"))
    .digest("hex")
    .slice(0, 40);
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const customerId = cleanId(new URL(request.url).searchParams.get("customerId"));
    const snap = await db.collection("outstation_recipient_addresses").where("customerId", "==", customerId).limit(100).get();
    const data = snap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
      .sort((a, b) => String(b.lastUsedAt || b.createdAt || "").localeCompare(String(a.lastUsedAt || a.createdAt || "")));
    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    let payload;
    try { payload = await request.json(); }
    catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
    let record;
    try { record = sanitizeRecipientRecord(payload?.recipient || payload); }
    catch (error) { throw Object.assign(error, { status: 400 }); }
    const now = new Date().toISOString();
    const ref = db.collection("outstation_recipient_addresses").doc(addressRecordId(record));
    const current = await ref.get();
    await ref.set({
      ...record,
      lastUsedAt: now,
      lastUsedByUid: profile.uid,
      lastUsedByName: String(profile.name || profile.email || "").slice(0, 200),
      ...(!current.exists ? { createdAt: now, createdByUid: profile.uid } : {})
    }, { merge: true });
    return Response.json({ ok: true, data: { id: ref.id, ...record } });
  } catch (error) {
    return errorResponse(error);
  }
}

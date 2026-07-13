import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { customerSearchRecord } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

function cleanCustomer(customer) {
  return {
    name: String(customer.name || ""),
    contact: String(customer.contact || ""),
    phone: String(customer.phone || ""),
    zone: String(customer.zone || ""),
    address: String(customer.address || ""),
    mapUrl: String(customer.mapUrl || ""),
    note: String(customer.note || ""),
    updatedAt: new Date().toISOString()
  };
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const customer = payload?.customer && typeof payload.customer === "object" ? payload.customer : null;
  const customerId = String(customer?.id || "").trim();

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!customerId) return Response.json({ ok: false, error: "Missing customer id" }, { status: 400 });

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const db = getAdminDb();
    const next = cleanCustomer(customer);
    await db.collection("customers").doc(customerId).set({
      ...next,
      updatedByUid: decoded.uid
    }, { merge: true });
    await db.collection("customer_search").doc(customerId).set(customerSearchRecord(next), { merge: true });

    return Response.json({ ok: true, data: { id: customerId } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

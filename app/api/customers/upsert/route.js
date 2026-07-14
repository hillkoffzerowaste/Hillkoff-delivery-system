import { customerSearchRecord } from "../../../../lib/customerSearchIndex";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

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

  const customer = payload?.customer && typeof payload.customer === "object" ? payload.customer : null;
  const customerId = String(customer?.id || "").trim();

  if (!customerId) return Response.json({ ok: false, error: "Missing customer id" }, { status: 400 });

  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const next = cleanCustomer(customer);
    await db.collection("customers").doc(customerId).set({
      ...next,
      updatedByUid: profile.uid
    }, { merge: true });
    await db.collection("customer_search").doc(customerId).set(customerSearchRecord(next), { merge: true });

    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const customerId = String(payload?.customerId || "").trim();

  if (!customerId) return Response.json({ ok: false, error: "Missing customerId" }, { status: 400 });
  if (customerId.length > 200 || customerId.includes("/")) return Response.json({ ok: false, error: "Invalid customerId" }, { status: 400 });

  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const batch = db.batch();
    batch.delete(db.collection("customers").doc(customerId));
    batch.delete(db.collection("customer_search").doc(customerId));
    await batch.commit();
    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

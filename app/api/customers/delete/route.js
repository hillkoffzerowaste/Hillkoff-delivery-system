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

  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    await db.collection("customers").doc(customerId).delete();
    await db.collection("customer_search").doc(customerId).delete();
    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

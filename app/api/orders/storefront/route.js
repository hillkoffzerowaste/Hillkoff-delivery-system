import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { isStorefrontPickupOrder, toStorefrontPickupOrder } from "../../../../lib/storefrontPickup";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["storefront", "admin"]);
    const snap = await db.collection("orders")
      .where("deliveryMethod", "in", ["grab_pickup", "customer_pickup"])
      .limit(250)
      .get();
    const data = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter(isStorefrontPickupOrder)
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
      .map(toStorefrontPickupOrder);
    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

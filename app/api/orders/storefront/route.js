import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { isValidServiceDate } from "../../../../lib/serviceDate";
import { isStorefrontPickupOrder, toStorefrontPickupOrder } from "../../../../lib/storefrontPickup";

export const runtime = "nodejs";
const STOREFRONT_LIMIT = 500;

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["storefront", "admin"]);
    const requestedDate = new URL(request.url).searchParams.get("date")?.trim() || "";
    if (requestedDate && !isValidServiceDate(requestedDate)) {
      return Response.json({ ok: false, error: "Invalid service date" }, { status: 400 });
    }
    let query = db.collection("orders")
      .where("deliveryMethod", "in", ["grab_pickup", "customer_pickup"]);
    if (requestedDate) query = query.where("serviceDate", "==", requestedDate);
    const snap = await query
      .limit(STOREFRONT_LIMIT + 1)
      .get();
    const hasMore = snap.docs.length > STOREFRONT_LIMIT;
    const data = snap.docs.slice(0, STOREFRONT_LIMIT)
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter(isStorefrontPickupOrder)
      .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
      .map(toStorefrontPickupOrder);
    return Response.json({ ok: true, data, hasMore });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { isOutstationOrder } from "../../../../lib/preparationWorkflow";

export const runtime = "nodejs";

const MAX_SEARCH_RESULTS = 100;
const SEARCH_PAGE_SIZE = 500;
const MAX_SCANNED_ORDERS = 5000;

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "store", "pack", "admin"]);
    const params = new URL(request.url).searchParams;
    const id = clean(params.get("id"));
    if (id) {
      if (id.length > 120 || id.includes("/")) return Response.json({ ok: false, error: "Invalid order id" }, { status: 400 });
      const ref = db.collection("orders").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return Response.json({ ok: false, error: "Order not found" }, { status: 404 });
      const activity = await ref.collection("activity").orderBy("at", "asc").limit(1000).get();
      return Response.json({ ok: true, data: { id: snap.id, ...snap.data(), activity: activity.docs.map((doc) => ({ id: doc.id, ...doc.data() })) } });
    }
    const scope = clean(params.get("scope"), 40);
    if (scope && !["store_pickup", "outstation"].includes(scope)) return Response.json({ ok: false, error: "Invalid search scope" }, { status: 400 });
    const queryText = clean(params.get("q")).toLowerCase();
    if (queryText.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters" }, { status: 400 });
    const data = [];
    let cursor = null;
    let scanned = 0;
    while (data.length < MAX_SEARCH_RESULTS && scanned < MAX_SCANNED_ORDERS) {
      let query = db.collection("orders").orderBy("updatedAt", "desc").limit(SEARCH_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      scanned += snap.size;
      cursor = snap.docs[snap.docs.length - 1];
      for (const doc of snap.docs) {
        const order = { id: doc.id, ...(doc.data() || {}) };
        if (!order.workflowType) continue;
        if (scope === "store_pickup" && !["grab_pickup", "customer_pickup"].includes(order.deliveryMethod)) continue;
        if (scope === "outstation" && !isOutstationOrder(order)) continue;
        const haystack = [order.id, order.bookingNumber, ...(Array.isArray(order.bookingNumbers) ? order.bookingNumbers : []), order.customerName, order.customerPhone, order.zone, order.address, order.salesNote, order.driverNote, order.status, order.storeStatus, order.packStatus].join(" ").toLowerCase();
        if (haystack.includes(queryText)) data.push(order);
        if (data.length >= MAX_SEARCH_RESULTS) break;
      }
      if (snap.size < SEARCH_PAGE_SIZE) break;
    }
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}

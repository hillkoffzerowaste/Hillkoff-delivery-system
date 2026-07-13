import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "store", "pack", "admin"]);
    const params = new URL(request.url).searchParams;
    const id = clean(params.get("id"));
    if (id) {
      const ref = db.collection("orders").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return Response.json({ ok: false, error: "Order not found" }, { status: 404 });
      const activity = await ref.collection("activity").orderBy("at", "asc").limit(300).get();
      return Response.json({ ok: true, data: { id: snap.id, ...snap.data(), activity: activity.docs.map((doc) => ({ id: doc.id, ...doc.data() })) } });
    }
    const queryText = clean(params.get("q")).toLowerCase();
    if (queryText.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters" }, { status: 400 });
    const snap = await db.collection("orders").orderBy("updatedAt", "desc").limit(1000).get();
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((order) => {
      if (!order.workflowType) return false;
      const haystack = [order.id, order.bookingNumber, order.customerName, order.customerPhone, order.zone, order.address, order.salesNote, order.driverNote, order.status, order.storeStatus, order.packStatus].join(" ").toLowerCase();
      return haystack.includes(queryText);
    }).slice(0, 100);
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}

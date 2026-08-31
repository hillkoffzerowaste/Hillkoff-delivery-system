import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { isOutstationOrder } from "../../../../lib/preparationWorkflow";

export const runtime = "nodejs";

const MAX_SEARCH_RESULTS = 100;
const SEARCH_PAGE_SIZE = 500;
const MAX_SCANNED_ORDERS = 5000;

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function matchesScope(order, scope) {
  if (!order?.workflowType) return false;
  if (scope === "store_pickup") return ["grab_pickup", "customer_pickup"].includes(order.deliveryMethod);
  return scope !== "outstation" || isOutstationOrder(order);
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
    const rawQuery = clean(params.get("q"));
    const queryText = rawQuery.toLowerCase();
    if (queryText.length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters" }, { status: 400 });
    // เส้นทางที่ผู้ใช้ใช้มากที่สุดคือเลขออเดอร์, เลขใบสั่งจอง และเบอร์โทร
    // ให้ใช้ indexed lookup ก่อนเสมอ แทนการไล่อ่านประวัติทั้ง collection แบบ substring scan
    const canUseIndexedLookup = /\d/.test(rawQuery) && /^[A-Za-z0-9._-]{1,120}$/.test(rawQuery);
    if (canUseIndexedLookup) {
      const exact = await db.collection("orders").doc(rawQuery).get();
      const order = exact.exists ? { id: exact.id, ...(exact.data() || {}) } : null;
      if (order && matchesScope(order, scope)) return Response.json({ ok: true, data: [order] });
    }
    if (canUseIndexedLookup) {
      const phoneDigits = queryText.replace(/\D/g, "");
      const indexedQueries = [
        db.collection("orders").where("bookingNumber", "==", rawQuery).limit(MAX_SEARCH_RESULTS).get(),
        db.collection("orders").where("bookingNumbers", "array-contains", rawQuery).limit(MAX_SEARCH_RESULTS).get()
      ];
      if (phoneDigits.length >= 8) indexedQueries.push(
        db.collection("orders").where("customerPhoneDigits", "==", phoneDigits).limit(MAX_SEARCH_RESULTS).get()
      );
      const indexed = await Promise.all(indexedQueries);
      const indexedData = new Map();
      indexed.forEach((snap) => snap.docs.forEach((doc) => {
        const order = { id: doc.id, ...(doc.data() || {}) };
        if (matchesScope(order, scope)) indexedData.set(doc.id, order);
      }));
      if (indexedData.size) return Response.json({ ok: true, data: [...indexedData.values()].slice(0, MAX_SEARCH_RESULTS) });
    }
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
        if (!matchesScope(order, scope)) continue;
        const haystack = [order.id, order.bookingNumber, ...(Array.isArray(order.bookingNumbers) ? order.bookingNumbers : []), order.customerName, order.customerPhone, order.zone, order.address, order.salesNote, order.driverNote, order.status, order.storeStatus, order.packStatus].join(" ").toLowerCase();
        if (haystack.includes(queryText)) data.push(order);
        if (data.length >= MAX_SEARCH_RESULTS) break;
      }
      if (snap.size < SEARCH_PAGE_SIZE) break;
    }
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}

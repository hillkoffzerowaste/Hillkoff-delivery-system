import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function orderTimestamp(order) {
  const value = order?.updatedAt || order?.createdAt || order?.deliveredAt || "";
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function addQuery(queries, seen, db, field, value) {
  const normalizedValue = String(value || "");
  if (!normalizedValue) return;
  const key = `${field}:${normalizedValue}`;
  if (seen.has(key)) return;
  seen.add(key);
  queries.push(db.collection("orders").where(field, "==", normalizedValue).limit(1000).get());
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const params = new URL(request.url).searchParams;
    const customerId = clean(params.get("customerId"), 120);
    if (!customerId) return Response.json({ ok: false, error: "Missing customerId" }, { status: 400 });
    if (customerId.includes("/")) return Response.json({ ok: false, error: "Invalid customerId" }, { status: 400 });

    const customerRef = db.collection("customers").doc(customerId);
    const customerSnap = await customerRef.get();
    const indexedCustomerSnap = customerSnap.exists ? null : await db.collection("customer_search").doc(customerId).get();
    if (!customerSnap.exists && !indexedCustomerSnap?.exists) return Response.json({ ok: false, error: "Customer not found" }, { status: 404 });
    const customerSource = customerSnap.exists ? customerSnap : indexedCustomerSnap;
    const customer = { id: customerSource.id, ...(customerSource.data() || {}) };
    const name = clean(customer.name);
    const phone = clean(customer.phone);
    const phoneDigits = String(customer.phoneDigits || phone.replace(/\D/g, ""));
    const queries = [];
    const seen = new Set();

    // The canonical link covers new orders. The legacy equality queries keep old
    // orders searchable until the optional backfill has populated customerId.
    addQuery(queries, seen, db, "customerId", customerId);
    addQuery(queries, seen, db, "customerPhoneDigits", phoneDigits);
    addQuery(queries, seen, db, "customerPhone", phone);
    addQuery(queries, seen, db, "phone", phone);
    addQuery(queries, seen, db, "customerName", name);

    const snapshots = await Promise.all(queries);
    const byId = new Map();
    snapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        if (!byId.has(doc.id)) byId.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
      });
    });

    // Do not return an unrelated same-name record when the order has a different
    // phone number. This is important for shops that share a display name.
    const normalizedName = normalizeCustomerSearch(name);
    const filtered = Array.from(byId.values()).filter((order) => {
      if (String(order.customerId || "") === customerId) return true;
      const orderPhone = String(order.customerPhoneDigits || order.phoneDigits || "").replace(/\D/g, "");
      if (phoneDigits && orderPhone) return orderPhone === phoneDigits;
      if (phone && String(order.customerPhone || order.phone || "").trim() === phone) return true;
      return normalizedName && normalizeCustomerSearch(order.customerName) === normalizedName;
    }).sort((a, b) => orderTimestamp(b) - orderTimestamp(a));

    return Response.json({ ok: true, data: { customer, orders: filtered, count: filtered.length } });
  } catch (error) {
    return errorResponse(error);
  }
}

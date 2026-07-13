import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_RESULTS = 50;
const cache = new Map();
const pending = new Map();

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").trim();
}

function matches(data, query) {
  const compactQuery = normalize(query);
  return [data.name, data.customerName, data.contact, data.phone, data.customerPhone, data.zone, data.address]
    .some((value) => normalize(value).includes(compactQuery));
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const query = String(new URL(request.url).searchParams.get("q") || "").trim();
    const normalizedQuery = normalize(query);
    if (normalizedQuery.length < 3) return Response.json({ ok: false, error: "Enter at least 3 characters" }, { status: 400 });
    const cached = cache.get(normalizedQuery);
    if (cached && Date.now() - cached.at < 5 * 60_000) return Response.json({ ok: true, data: cached.data });

    if (pending.has(normalizedQuery)) return Response.json({ ok: true, data: await pending.get(normalizedQuery) });
    const search = (async () => {
    const [customersSnap, ordersSnap] = await Promise.all([
      db.collection("customers").get(),
      db.collection("orders").get()
    ]);
    const results = [];
    const seen = new Set();
    const add = (item) => {
      const key = `${normalize(item.name)}|${normalize(item.phone)}`;
      if (!item.name || seen.has(key) || results.length >= MAX_RESULTS) return;
      seen.add(key);
      results.push(item);
    };

    customersSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (matches(data, query)) add({ id: doc.id, ...data });
    });
    ordersSnap.docs.forEach((doc) => {
      const data = doc.data() || {};
      if (matches(data, query)) add({
        id: String(data.customerId || `legacy-${doc.id}`),
        name: String(data.customerName || "").trim(),
        contact: String(data.customerContact || "").trim(),
        phone: String(data.customerPhone || "").trim(),
        zone: String(data.zone || "").trim(),
        address: String(data.address || "").trim(),
        mapUrl: String(data.mapUrl || "").trim(),
        legacy: true
      });
    });
    cache.set(normalizedQuery, { at: Date.now(), data: results });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return results;
    })();
    pending.set(normalizedQuery, search);
    try { return Response.json({ ok: true, data: await search }); }
    finally { pending.delete(normalizedQuery); }
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";

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
    const normalizedQuery = normalizeCustomerSearch(query);
    if (normalizedQuery.length < 3) return Response.json({ ok: false, error: "Enter at least 3 characters" }, { status: 400 });
    const cached = cache.get(normalizedQuery);
    if (cached && Date.now() - cached.at < 5 * 60_000) return Response.json({ ok: true, data: cached.data });

    if (pending.has(normalizedQuery)) return Response.json({ ok: true, data: await pending.get(normalizedQuery) });
    const search = (async () => {
    const snap = await db.collection("customer_search").where("terms", "array-contains", normalizedQuery).limit(MAX_RESULTS).get();
    const results = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
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

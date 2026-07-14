import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { compactCustomerSearch, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 250;
const cache = new Map();
const pending = new Map();

function normalize(value) {
  return compactCustomerSearch(value);
}

function matches(data, query) {
  const compactQuery = normalize(query);
  const phoneQuery = String(query || "").replace(/\D/g, "");
  if (phoneQuery.length >= 3 && String(data.phoneDigits || data.phone || data.customerPhone || "").replace(/\D/g, "").includes(phoneQuery)) return true;
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
    const toMatches = (docs) => docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter((data) => matches(data, query));
    const prefixSnap = await db.collection("customer_search").where("terms", "array-contains", normalizedQuery).limit(MAX_RESULTS).get();
    let results = toMatches(prefixSnap.docs);
    if (!results.length) {
      const searchKey = compactCustomerSearch(query).slice(0, 3);
      const keySnap = await db.collection("customer_search").where("searchKeys", "array-contains", searchKey).limit(MAX_CANDIDATES).get();
      results = toMatches(keySnap.docs);
    }
    results = results
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, MAX_RESULTS);
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

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { compactCustomerSearch, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 250;
const MAX_ALL_RESULTS = 1000;
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
    const params = new URL(request.url).searchParams;
    const loadAll = params.get("all") === "true";
    const query = String(params.get("q") || "").trim();
    const normalizedQuery = normalizeCustomerSearch(query);
    if (!loadAll && normalizedQuery.length < 3) return Response.json({ ok: false, error: "Enter at least 3 characters" }, { status: 400 });
    const cacheKey = loadAll ? "__all_customers__" : normalizedQuery;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 5 * 60_000) return Response.json({ ok: true, data: cached.data });

    if (pending.has(cacheKey)) return Response.json({ ok: true, data: await pending.get(cacheKey) });
    const search = (async () => {
    if (loadAll) {
      const snap = await db.collection("customer_search").orderBy("updatedAt", "desc").limit(MAX_ALL_RESULTS).get();
      const data = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
      cache.set(cacheKey, { at: Date.now(), data });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
      return data;
    }
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
    cache.set(cacheKey, { at: Date.now(), data: results });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return results;
    })();
    pending.set(cacheKey, search);
    try { return Response.json({ ok: true, data: await search }); }
    finally { pending.delete(cacheKey); }
  } catch (error) {
    return errorResponse(error);
  }
}

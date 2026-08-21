import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { compactCustomerSearch, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";
import { readCustomerSearchCache, writeCustomerSearchCache } from "../../../../lib/customerSearchCache";

export const runtime = "nodejs";

const MAX_RESULTS = 50;
const MAX_CANDIDATES = 120;
const MAX_ALL_RESULTS = 1000;
const pending = new Map();

// terms และ searchKeys เป็นดัชนีสำหรับ query ฝั่งเซิร์ฟเวอร์เท่านั้น (อย่างละไม่เกิน 200 ค่าต่อราย)
// ไม่มีผู้ใช้ฝั่ง client จึงตัดออกทั้งจาก response และจากสิ่งที่เก็บลงแคช
function toPublicCustomer(id, data) {
  const { terms, searchKeys, ...rest } = data || {};
  void terms;
  void searchKeys;
  return { id, ...rest };
}

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
    const { db } = await requireProfile(request, ["sales", "admin", "store", "pack"]);
    const params = new URL(request.url).searchParams;
    const loadAll = params.get("all") === "true";
    const query = String(params.get("q") || "").trim();
    const requestedLimit = Number(params.get("limit"));
    const allResultsLimit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_ALL_RESULTS, Math.max(1, Math.trunc(requestedLimit)))
      : MAX_ALL_RESULTS;
    const normalizedQuery = normalizeCustomerSearch(query);
    if (!loadAll && normalizedQuery.length < 3) return Response.json({ ok: false, error: "Enter at least 3 characters" }, { status: 400 });
    const cacheKey = loadAll ? `__all_customers__:${allResultsLimit}` : normalizedQuery;
    const cached = await readCustomerSearchCache(db, cacheKey);
    if (cached) return Response.json({ ok: true, data: cached });

    if (pending.has(cacheKey)) return Response.json({ ok: true, data: await pending.get(cacheKey) });
    const search = (async () => {
      if (loadAll) {
        const snap = await db.collection("customer_search").orderBy("updatedAt", "desc").limit(allResultsLimit).get();
        const data = snap.docs.map((doc) => toPublicCustomer(doc.id, doc.data()));
        await writeCustomerSearchCache(db, cacheKey, data);
        return data;
      }
      const toMatches = (docs) => docs.map((doc) => toPublicCustomer(doc.id, doc.data())).filter((data) => matches(data, query));
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
      await writeCustomerSearchCache(db, cacheKey, results);
      return results;
    })();
    pending.set(cacheKey, search);
    try { return Response.json({ ok: true, data: await search }); }
    finally { pending.delete(cacheKey); }
  } catch (error) {
    return errorResponse(error);
  }
}

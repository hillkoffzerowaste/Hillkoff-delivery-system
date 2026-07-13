import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_RESULTS = 50;

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
    if (normalize(query).length < 2) return Response.json({ ok: false, error: "Enter at least 2 characters" }, { status: 400 });

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
    return Response.json({ ok: true, data: results });
  } catch (error) {
    return errorResponse(error);
  }
}

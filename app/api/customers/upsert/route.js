import { customerSearchRecord, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function cleanCustomer(customer) {
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  return {
    name,
    nameKey: normalizeCustomerSearch(name),
    contact: String(customer.contact || ""),
    phone,
    phoneDigits: phone.replace(/\D/g, ""),
    zone: String(customer.zone || ""),
    address: String(customer.address || ""),
    mapUrl: String(customer.mapUrl || ""),
    note: String(customer.note || ""),
    updatedAt: new Date().toISOString()
  };
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const customer = payload?.customer && typeof payload.customer === "object" ? payload.customer : null;
  const customerId = String(customer?.id || "").trim();

  if (!customerId) return Response.json({ ok: false, error: "Missing customer id" }, { status: 400 });

  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const next = cleanCustomer(customer);
    const duplicateQueries = [];
    if (next.nameKey.length >= 3) {
      duplicateQueries.push(db.collection("customers").where("nameKey", "==", next.nameKey).get());
      duplicateQueries.push(db.collection("customer_search").where("nameKey", "==", next.nameKey).get());
      duplicateQueries.push(db.collection("customer_search").where("terms", "array-contains", next.nameKey.slice(0, 40)).get());
    }
    if (next.phoneDigits.length >= 8) {
      duplicateQueries.push(db.collection("customers").where("phoneDigits", "==", next.phoneDigits).get());
      duplicateQueries.push(db.collection("customer_search").where("phoneDigits", "==", next.phoneDigits).get());
      duplicateQueries.push(db.collection("customer_search").where("terms", "array-contains", next.phoneDigits.slice(0, 40)).get());
    }
    if (duplicateQueries.length) {
      const duplicateSnapshots = await Promise.all(duplicateQueries);
      const duplicateIds = new Set();
      duplicateSnapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => duplicateIds.add(doc.id)));
      const customerSnapshots = await Promise.all(Array.from(duplicateIds).map((id) => db.collection("customers").doc(id).get()));
      const duplicate = customerSnapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.exists ? snapshot.data() || {} : {} })).find(({ id, data }) => {
        if (id === customerId || !data.name) return false;
        const candidateName = normalizeCustomerSearch(data.name);
        const candidatePhone = String(data.phoneDigits || data.phone || "").replace(/\D/g, "");
        return candidateName === next.nameKey || (next.phoneDigits.length >= 8 && candidatePhone === next.phoneDigits);
      });
      if (duplicate) {
        const duplicateId = duplicate.id;
        const duplicateData = duplicate.data;
        const duplicatePhone = String(duplicateData.phoneDigits || duplicateData.phone || "").replace(/\D/g, "");
        const duplicateField = next.phoneDigits.length >= 8 && duplicatePhone === next.phoneDigits ? "เบอร์โทร" : "ชื่อลูกค้า";
        return Response.json({
          ok: false,
          error: `พบข้อมูลลูกค้าเดิมจาก${duplicateField}แล้ว`,
          data: { duplicateId, duplicateName: duplicateData.name || duplicateId, duplicateField }
        }, { status: 409 });
      }
    }
    await db.collection("customers").doc(customerId).set({
      ...next,
      updatedByUid: profile.uid
    }, { merge: true });
    await db.collection("customer_search").doc(customerId).set(customerSearchRecord(next), { merge: true });

    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

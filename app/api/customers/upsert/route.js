import { customerSearchRecord, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function cleanCustomer(customer) {
  const clean = (value, max) => String(value || "").trim().slice(0, max);
  const name = clean(customer.name, 200);
  const phone = clean(customer.phone, 40);
  return {
    name,
    nameKey: normalizeCustomerSearch(name),
    contact: clean(customer.contact, 200),
    phone,
    phoneDigits: phone.replace(/\D/g, ""),
    zone: clean(customer.zone, 200),
    address: clean(customer.address, 1500),
    mapUrl: clean(customer.mapUrl, 1500),
    note: clean(customer.note, 3000),
    updatedAt: new Date().toISOString()
  };
}

function isSafeHttpUrl(value) {
  if (!value) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
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

  if (!/^[A-Za-z0-9._-]{1,120}$/.test(customerId)) return Response.json({ ok: false, error: "Invalid customer id" }, { status: 400 });

  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin", "store"]);
    const next = cleanCustomer(customer);
    if (!next.name) return Response.json({ ok: false, error: "Customer name is required" }, { status: 400 });
    if (!isSafeHttpUrl(next.mapUrl)) return Response.json({ ok: false, error: "Map URL must use http or https" }, { status: 400 });
    const duplicateQueries = [];
    if (next.nameKey.length >= 3) {
      duplicateQueries.push(db.collection("customers").where("nameKey", "==", next.nameKey).limit(20));
      duplicateQueries.push(db.collection("customer_search").where("nameKey", "==", next.nameKey).limit(20));
      duplicateQueries.push(db.collection("customer_search").where("terms", "array-contains", next.nameKey.slice(0, 40)).limit(20));
    }
    if (next.phoneDigits.length >= 8 && next.phoneDigits.length <= 15) {
      duplicateQueries.push(db.collection("customers").where("phoneDigits", "==", next.phoneDigits).limit(20));
      duplicateQueries.push(db.collection("customer_search").where("phoneDigits", "==", next.phoneDigits).limit(20));
      duplicateQueries.push(db.collection("customer_search").where("terms", "array-contains", next.phoneDigits.slice(0, 40)).limit(20));
    }
    const customerRef = db.collection("customers").doc(customerId);
    let duplicateResponse = null;
    await db.runTransaction(async (transaction) => {
      if (duplicateQueries.length) {
        const duplicateSnapshots = await Promise.all(duplicateQueries.map((query) => transaction.get(query)));
        const duplicateIds = new Set();
        duplicateSnapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => duplicateIds.add(doc.id)));
        const customerSnapshots = await Promise.all(Array.from(duplicateIds).map((id) => transaction.get(db.collection("customers").doc(id))));
        const duplicate = customerSnapshots.map((snapshot) => ({ id: snapshot.id, data: snapshot.exists ? snapshot.data() || {} : {} })).find(({ id, data }) => {
          if (id === customerId || !data.name) return false;
          const candidateName = normalizeCustomerSearch(data.name);
          const candidatePhone = String(data.phoneDigits || data.phone || "").replace(/\D/g, "");
          return candidateName === next.nameKey || (next.phoneDigits.length >= 8 && next.phoneDigits.length <= 15 && candidatePhone === next.phoneDigits);
        });
        if (duplicate) {
          const duplicateData = duplicate.data;
          const duplicatePhone = String(duplicateData.phoneDigits || duplicateData.phone || "").replace(/\D/g, "");
          const duplicateField = next.phoneDigits.length >= 8 && next.phoneDigits.length <= 15 && duplicatePhone === next.phoneDigits ? "เบอร์โทร" : "ชื่อลูกค้า";
          duplicateResponse = { duplicateId: duplicate.id, duplicateName: duplicateData.name || duplicate.id, duplicateField };
          return;
        }
      }
      const current = await transaction.get(customerRef);
      transaction.set(customerRef, {
        ...next,
        updatedByUid: profile.uid,
        updatedByRole: profile.role,
        updatedByName: String(profile.name || profile.email || "").slice(0, 200),
        ...(!current.exists ? { createdAt: new Date().toISOString(), createdByUid: profile.uid } : {})
      }, { merge: true });
      transaction.set(db.collection("customer_search").doc(customerId), customerSearchRecord(next), { merge: true });
    });

    if (duplicateResponse) {
      return Response.json({
        ok: false,
        error: `พบข้อมูลลูกค้าเดิมจาก${duplicateResponse.duplicateField}แล้ว`,
        data: duplicateResponse
      }, { status: 409 });
    }
    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

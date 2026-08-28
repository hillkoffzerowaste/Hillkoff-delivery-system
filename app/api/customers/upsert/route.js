import { customerSearchRecord, normalizeCustomerSearch } from "../../../../lib/customerSearchIndex";
import { bumpCustomerSearchIndexVersion } from "../../../../lib/customerSearchCache";
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
    defaultDeliveryMethod: customer.defaultDeliveryMethod === "outstation" ? "outstation" : "company_driver",
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
  const allowDuplicatePhone = payload?.allowDuplicatePhone === true;

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
    const searchRef = db.collection("customer_search").doc(customerId);
    let duplicateResponse = null;
    await db.runTransaction(async (transaction) => {
      const [current, currentSearch] = await Promise.all([transaction.get(customerRef), transaction.get(searchRef)]);
      // ลูกค้าบางรายมีแต่ doc ในดัชนีค้นหา (หน้าเว็บแสดงจากดัชนี) การแก้ไขรายนั้นคือการแก้ของเดิม ไม่ใช่การสร้างใหม่
      const currentData = current.exists ? current.data() || {} : (currentSearch.exists ? currentSearch.data() || {} : null);
      // ข้อมูลซ้ำที่ค้างอยู่ในระบบไม่ควรล็อกไม่ให้แก้ไขฟิลด์อื่น จึงตรวจซ้ำเฉพาะตอนที่ชื่อหรือเบอร์เปลี่ยนจริง
      const identityChanged = !currentData
        || normalizeCustomerSearch(currentData.name) !== next.nameKey
        || String(currentData.phoneDigits || currentData.phone || "").replace(/\D/g, "") !== next.phoneDigits;
      if (duplicateQueries.length && identityChanged) {
        const duplicateSnapshots = await Promise.all(duplicateQueries.map((query) => transaction.get(query)));
        const duplicateIds = new Set();
        duplicateSnapshots.forEach((snapshot) => snapshot.docs.forEach((doc) => duplicateIds.add(doc.id)));
        const customerSnapshots = await Promise.all(Array.from(duplicateIds).map((id) => transaction.get(db.collection("customers").doc(id))));
        const candidates = customerSnapshots
          .map((snapshot) => ({ id: snapshot.id, data: snapshot.exists ? snapshot.data() || {} : {} }))
          .filter(({ id, data }) => id !== customerId && data.name);
        const usablePhone = next.phoneDigits.length >= 8 && next.phoneDigits.length <= 15;
        const nameDuplicate = candidates.find(({ data }) => normalizeCustomerSearch(data.name) === next.nameKey);
        // สาขาของบริษัทเดียวกันใช้เบอร์กลางร่วมกันเป็นเรื่องปกติ เบอร์ซ้ำที่ชื่อไม่ซ้ำจึงเป็นคำเตือนที่ยืนยันข้ามได้
        const phoneDuplicate = usablePhone
          ? candidates.find(({ data }) => String(data.phoneDigits || data.phone || "").replace(/\D/g, "") === next.phoneDigits)
          : null;
        const duplicate = nameDuplicate || (allowDuplicatePhone ? null : phoneDuplicate);
        if (duplicate) {
          duplicateResponse = {
            duplicateId: duplicate.id,
            duplicateName: duplicate.data.name || duplicate.id,
            duplicateField: nameDuplicate ? "ชื่อลูกค้า" : "เบอร์โทร",
            canOverride: !nameDuplicate
          };
          return;
        }
      }
      transaction.set(customerRef, {
        ...next,
        updatedByUid: profile.uid,
        updatedByRole: profile.role,
        updatedByName: String(profile.name || profile.email || "").slice(0, 200),
        ...(!current.exists ? { createdAt: new Date().toISOString(), createdByUid: profile.uid } : {})
      }, { merge: true });
      transaction.set(searchRef, customerSearchRecord(next), { merge: true });
    });

    if (duplicateResponse) {
      return Response.json({
        ok: false,
        error: `พบข้อมูลลูกค้าเดิมจาก${duplicateResponse.duplicateField}แล้ว`,
        data: duplicateResponse
      }, { status: 409 });
    }
    // ดัชนีเปลี่ยนแล้ว ต้องเดินเลขเวอร์ชันเพื่อให้ผลค้นหาที่แคชไว้หมดอายุทันทีทุก instance
    await bumpCustomerSearchIndexVersion(db);
    return Response.json({ ok: true, data: { id: customerId } });
  } catch (error) { return errorResponse(error); }
}

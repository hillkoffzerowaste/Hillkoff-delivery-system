import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { customerSearchRecord } from "../lib/customerSearchIndex.js";

const db = getAdminDb();
const [snap, customersSnap] = await Promise.all([db.collection("orders").get(), db.collection("customers").get()]);
let batch = db.batch();
let writes = 0;
let phoneCount = 0;
let indexCount = 0;
async function enqueue(ref, data) {
  batch.set(ref, data, { merge: true });
  writes += 1;
  if (writes === 400) { await batch.commit(); batch = db.batch(); writes = 0; }
}
const customerIds = new Set(customersSnap.docs.map((doc) => doc.id));
for (const doc of snap.docs) {
  const data = doc.data() || {};
  const digits = String(data.customerPhone || "").replace(/\D/g, "");
  if (!data.customerPhoneDigits && digits) { await enqueue(doc.ref, { customerPhoneDigits: digits }); phoneCount += 1; }
  const customerId = String(data.customerId || `legacy-${doc.id}`);
  if (!customerIds.has(customerId)) {
    await enqueue(db.collection("customer_search").doc(customerId), customerSearchRecord({ name: data.customerName, phone: data.customerPhone, zone: data.zone, address: data.address, mapUrl: data.mapUrl }));
    indexCount += 1;
  }
}
for (const doc of customersSnap.docs) { await enqueue(db.collection("customer_search").doc(doc.id), customerSearchRecord(doc.data() || {})); indexCount += 1; }
if (writes) await batch.commit();
console.log(`Backfilled ${phoneCount} phone fields and ${indexCount} search records.`);

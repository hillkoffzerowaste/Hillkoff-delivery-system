import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { customerSearchRecord } from "../lib/customerSearchIndex.js";

const db = getAdminDb();
const [snap, customersSnap] = await Promise.all([db.collection("orders").get(), db.collection("customers").get()]);
let batch = db.batch();
let count = 0;
for (const doc of snap.docs) {
  const data = doc.data() || {};
  if (data.customerPhoneDigits) continue;
  const digits = String(data.customerPhone || "").replace(/\D/g, "");
  if (!digits) continue;
  batch.set(doc.ref, { customerPhoneDigits: digits }, { merge: true });
  count += 1;
  if (count % 400 === 0) { await batch.commit(); batch = db.batch(); }
}
for (const doc of customersSnap.docs) batch.set(db.collection("customer_search").doc(doc.id), customerSearchRecord(doc.data() || {}), { merge: true });
if (count % 400) await batch.commit();
console.log(`Backfilled customerPhoneDigits for ${count} orders.`);

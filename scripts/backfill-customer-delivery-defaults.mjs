import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { bumpCustomerSearchIndexVersion } from "../lib/customerSearchCache.js";
import { defaultDeliveryMethodFromLatestOrder } from "../lib/customerDeliveryPreference.js";

const applyChanges = process.argv.includes("--apply");
const db = getAdminDb();
const [ordersSnap, customersSnap, indexSnap] = await Promise.all([
  db.collection("orders").get(),
  db.collection("customers").get(),
  db.collection("customer_search").get()
]);

const customers = new Map(customersSnap.docs.map((doc) => [doc.id, doc]));
const searchRecords = new Map(indexSnap.docs.map((doc) => [doc.id, doc]));
const byCustomer = new Map();
for (const doc of ordersSnap.docs) {
  const order = doc.data() || {};
  const customerId = String(order.customerId || "").trim();
  if (!customerId) continue;
  const current = byCustomer.get(customerId) || { orders: [], hasOutstation: false };
  current.orders.push(order);
  current.hasOutstation ||= order.deliveryMethod === "outstation";
  byCustomer.set(customerId, current);
}

let batch = db.batch();
let queued = 0;
let changedRecords = 0;
let outstationDefaults = 0;
let companyDriverDefaults = 0;
async function enqueue(ref, patch) {
  if (!applyChanges) return;
  batch.set(ref, patch, { merge: true });
  queued += 1;
  if (queued === 400) {
    await batch.commit();
    batch = db.batch();
    queued = 0;
  }
}

for (const [customerId, history] of byCustomer) {
  if (!history.hasOutstation) continue;
  const defaultDeliveryMethod = defaultDeliveryMethodFromLatestOrder(history.orders);
  if (defaultDeliveryMethod === "outstation") outstationDefaults += 1;
  else companyDriverDefaults += 1;
  const records = [customers.get(customerId), searchRecords.get(customerId)].filter(Boolean);
  for (const record of records) {
    if (record.data()?.defaultDeliveryMethod === defaultDeliveryMethod) continue;
    changedRecords += 1;
    await enqueue(record.ref, { defaultDeliveryMethod });
  }
}

if (applyChanges && queued) await batch.commit();
if (applyChanges && changedRecords) await bumpCustomerSearchIndexVersion(db);

console.log(JSON.stringify({
  mode: applyChanges ? "apply" : "dry-run",
  customersWithOutstationHistory: [...byCustomer.values()].filter((history) => history.hasOutstation).length,
  outstationDefaults,
  companyDriverDefaults,
  customerRecordsToUpdate: changedRecords
}, null, 2));
await db.terminate();

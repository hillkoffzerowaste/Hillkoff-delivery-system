import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { customerSearchRecord } from "../lib/customerSearchIndex.js";

const applyChanges = process.argv.includes("--apply");
const db = getAdminDb();
const [snap, customersSnap, indexSnap] = await Promise.all([db.collection("orders").get(), db.collection("customers").get(), db.collection("customer_search").get()]);
let batch = db.batch();
let writes = 0;
let phoneCount = 0;
let indexCount = 0;
async function enqueue(ref, data) {
  writes += 1;
  if (!applyChanges) return;
  batch.set(ref, data, { merge: true });
  if (writes === 400) { await batch.commit(); batch = db.batch(); writes = 0; }
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function indexMatches(current, next) {
  if (!current) return false;
  return ["name", "nameKey", "contact", "phone", "phoneDigits", "zone", "address", "mapUrl"].every((key) => String(current[key] || "") === String(next[key] || ""))
    && sameArray(current.terms, next.terms)
    && sameArray(current.searchKeys, next.searchKeys);
}

function mergeLegacyCustomer(current, order) {
  const pick = (...values) => values.find((value) => String(value || "").trim()) || "";
  return {
    name: pick(current?.name, order.customerName),
    phone: pick(current?.phone, order.customerPhone),
    zone: pick(current?.zone, order.zone),
    address: pick(current?.address, order.address),
    mapUrl: pick(current?.mapUrl, order.mapUrl)
  };
}

const customerIds = new Set(customersSnap.docs.map((doc) => doc.id));
const currentIndex = new Map(indexSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
const legacyCustomers = new Map();
const indexedCustomerIds = new Set();
for (const doc of snap.docs) {
  const data = doc.data() || {};
  const digits = String(data.customerPhone || "").replace(/\D/g, "");
  if (!data.customerPhoneDigits && digits) { await enqueue(doc.ref, { customerPhoneDigits: digits }); phoneCount += 1; }
  const customerId = String(data.customerId || `legacy-${doc.id}`);
  if (!customerIds.has(customerId)) {
    legacyCustomers.set(customerId, mergeLegacyCustomer(legacyCustomers.get(customerId), data));
  }
}
for (const doc of customersSnap.docs) {
  const next = customerSearchRecord(doc.data() || {});
  indexedCustomerIds.add(doc.id);
  if (!indexMatches(currentIndex.get(doc.id), next)) { await enqueue(db.collection("customer_search").doc(doc.id), next); indexCount += 1; }
}
for (const [customerId, customer] of legacyCustomers) {
  const next = customerSearchRecord(customer);
  indexedCustomerIds.add(customerId);
  if (!indexMatches(currentIndex.get(customerId), next)) { await enqueue(db.collection("customer_search").doc(customerId), next); indexCount += 1; }
}
for (const [customerId, customer] of currentIndex) {
  if (indexedCustomerIds.has(customerId) || !String(customer.name || "").trim()) continue;
  const next = customerSearchRecord(customer);
  if (!indexMatches(customer, next)) { await enqueue(db.collection("customer_search").doc(customerId), next); indexCount += 1; }
}
if (applyChanges && writes) await batch.commit();
console.log(`${applyChanges ? "Backfilled" : "Dry run found"} ${phoneCount} phone fields and ${indexCount} search records.`);
if (!applyChanges) console.log("No data was written. Pass --apply after reviewing this result.");
await db.terminate();

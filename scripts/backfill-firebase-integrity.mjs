import dotenv from "dotenv";
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { customerSearchRecord, normalizeCustomerSearch } from "../lib/customerSearchIndex.js";

dotenv.config({ path: ".env.local" });

const applyChanges = process.argv.includes("--apply");
const db = getAdminDb();
const counters = {
  customerFields: 0,
  customerIndexes: 0,
  orderFields: 0,
  userMirrors: 0,
  userDefaults: 0
};
let pending = [];

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function serviceDate(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function publicProfile(data, uid) {
  return {
    uid,
    uidLast: uid,
    email: String(data.email || ""),
    role: String(data.role || ""),
    status: String(data.status || "active"),
    active: data.active !== false,
    phone: String(data.phone || data.phoneDigits || ""),
    phoneDigits: phoneDigits(data.phoneDigits || data.phone),
    name: String(data.name || ""),
    driverId: String(data.driverId || ""),
    driverProfile: data.role === "driver" ? data.driverProfile || null : null,
    authProvider: String(data.authProvider || "pin"),
    updatedAt: new Date().toISOString(),
    createdAt: data.createdAt || new Date().toISOString()
  };
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function indexMatches(current, next) {
  if (!current) return false;
  return ["name", "nameKey", "contact", "phone", "phoneDigits", "zone", "address", "mapUrl"]
    .every((key) => String(current[key] || "") === String(next[key] || "")) &&
    sameArray(current.terms, next.terms) && sameArray(current.searchKeys, next.searchKeys);
}

function shallowObjectMatches(left, right) {
  const a = left && typeof left === "object" ? left : {};
  const b = right && typeof right === "object" ? right : {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => a[key] === b[key]);
}

function queueWrite(ref, data, options = { merge: true }) {
  pending.push({ ref, data, options });
}

async function flush() {
  if (!applyChanges || !pending.length) {
    pending = [];
    return;
  }
  while (pending.length) {
    const chunk = pending.splice(0, 400);
    const batch = db.batch();
    chunk.forEach(({ ref, data, options }) => batch.set(ref, data, options));
    await batch.commit();
  }
}

const [ordersSnap, customersSnap, indexSnap, phoneUsersSnap, usersSnap] = await Promise.all([
  db.collection("orders").get(),
  db.collection("customers").get(),
  db.collection("customer_search").get(),
  db.collection("users_by_phone").get(),
  db.collection("users").get()
]);

const currentIndexes = new Map(indexSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
const currentUsers = new Map(usersSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
for (const doc of customersSnap.docs) {
  const data = doc.data() || {};
  const nextFields = {
    phoneDigits: phoneDigits(data.phone),
    nameKey: normalizeCustomerSearch(data.name)
  };
  if (String(data.phoneDigits || "") !== nextFields.phoneDigits || String(data.nameKey || "") !== nextFields.nameKey) {
    queueWrite(doc.ref, nextFields);
    counters.customerFields += 1;
  }
  const nextIndex = customerSearchRecord({ ...data, ...nextFields });
  if (!indexMatches(currentIndexes.get(doc.id), nextIndex)) {
    queueWrite(db.collection("customer_search").doc(doc.id), nextIndex);
    counters.customerIndexes += 1;
  }
}

for (const doc of ordersSnap.docs) {
  const data = doc.data() || {};
  const patch = {};
  const digits = phoneDigits(data.customerPhone);
  if (digits && String(data.customerPhoneDigits || "") !== digits) patch.customerPhoneDigits = digits;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.serviceDate || ""))) {
    const derived = serviceDate(data.createdAt || data.updatedAt);
    if (derived) patch.serviceDate = derived;
  }
  if (Object.keys(patch).length) {
    queueWrite(doc.ref, patch);
    counters.orderFields += 1;
  }
}

for (const doc of phoneUsersSnap.docs) {
  const data = doc.data() || {};
  const uid = String(data.uidLast || data.uid || "").trim();
  if (!uid || !["driver", "sales"].includes(data.role)) continue;
  const next = publicProfile(data, uid);
  const current = currentUsers.get(uid) || {};
  const fields = ["uid", "uidLast", "email", "role", "status", "active", "phone", "phoneDigits", "name", "driverId", "authProvider", "createdAt"];
  const matches = fields.every((key) => current[key] === next[key]) && shallowObjectMatches(current.driverProfile, next.driverProfile);
  if (!matches) {
    queueWrite(db.collection("users").doc(uid), next);
    counters.userMirrors += 1;
  }
}

for (const doc of usersSnap.docs) {
  const data = doc.data() || {};
  const defaults = {
    uid: doc.id,
    uidLast: doc.id,
    phone: String(data.phone || ""),
    phoneDigits: phoneDigits(data.phoneDigits || data.phone),
    driverId: String(data.driverId || ""),
    status: String(data.status || "active"),
    active: data.active !== false
  };
  const changed = Object.entries(defaults).some(([key, value]) => data[key] !== value);
  if (changed) {
    queueWrite(doc.ref, defaults);
    counters.userDefaults += 1;
  }
}

await flush();

console.log(JSON.stringify({ mode: applyChanges ? "applied" : "dry-run", ...counters }, null, 2));

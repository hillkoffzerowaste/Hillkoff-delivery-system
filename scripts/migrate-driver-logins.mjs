import fs from "node:fs";
import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const env = dotenv.parse(fs.readFileSync(".env.local"));
const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const apply = process.argv.includes("--apply");

const digits = (value) => String(value || "").replace(/\D/g, "");
const inactive = (data) => data?.active === false || ["disabled", "rejected", "inactive"].includes(String(data?.status || "").toLowerCase());
const displayName = (data) => String(data?.name || `${data?.firstName || ""} ${data?.lastName || ""}`).trim();
const maskedPhone = (phone) => phone.length >= 7 ? `${phone.slice(0, 3)}***${phone.slice(-4)}` : phone;

const historyCollections = ["orders", "route_tasks", "driver_assessments", "vehicle_usage", "fuel_bills", "driver_locations"];
const [driversSnap, phoneUsersSnap, loginLimitsSnap, ...historySnapshots] = await Promise.all([
  db.collection("drivers").get(),
  db.collection("users_by_phone").get(),
  db.collection("login_rate_limits").get(),
  ...historyCollections.map((collection) => db.collection(collection).get()),
]);
const phoneUsers = new Map(phoneUsersSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }]));
const driverDocs = driversSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const driverByPhone = new Map(driverDocs.map((driver) => [digits(driver.phone || driver.phoneDigits || driver.driverPhone), driver]));
const activeAccounts = [...phoneUsers.values()].filter((account) => account.role === "driver" && !inactive(account));
const historicalNames = new Map();
for (const snapshot of historySnapshots) {
  for (const doc of snapshot.docs) {
    const record = doc.data() || {};
    const driverId = String(record.driverId || "");
    const name = String(record.driverName || record.name || record.createdByName || "").trim();
    if (driverId && name && !name.startsWith("driver_") && !historicalNames.has(driverId)) historicalNames.set(driverId, name);
  }
}
const activeDrivers = activeAccounts.map((account) => ({
  ...(driverByPhone.get(digits(account.phoneDigits || account.phone)) || {}),
  ...account,
  id: account.driverId || driverByPhone.get(digits(account.phoneDigits || account.phone))?.id || `driver_${account.id}`,
  account,
}));

const rows = [];
let linked = 0;
let missingPhone = 0;
let missingAccount = 0;
let missingPassword = 0;

for (const driver of activeDrivers) {
  const phone = digits(driver.phone || driver.phoneDigits || driver.driverPhone);
  const account = driver.account || (phone ? phoneUsers.get(phone) : null);
  const currentName = displayName(driver) || displayName(account);
  const name = currentName && !currentName.startsWith("driver_")
    ? currentName
    : (historicalNames.get(String(account?.driverId || driver.driverId || driver.id)) || currentName || driver.id);
  const hasPassword = Boolean((account?.passwordHash || account?.pinHash) && (account?.passwordSalt || account?.pinSalt));
  const driverId = String(account?.driverId || driver.driverId || driver.id);
  let state = "ready";
  if (!phone) { state = "missing_phone"; missingPhone += 1; }
  else if (!account) { state = "missing_account"; missingAccount += 1; }
  else if (!hasPassword) { state = "missing_password"; missingPassword += 1; }

  if (apply && account) {
    const now = new Date().toISOString();
    const driverProfile = {
      ...(account.driverProfile || {}),
      firstName: driver.firstName || account.driverProfile?.firstName || name.split(/\s+/)[0] || "",
      lastName: driver.lastName || account.driverProfile?.lastName || name.split(/\s+/).slice(1).join(" "),
      phone: driver.phone || account.phone || phone,
      vehicle: driver.vehicle || account.driverProfile?.vehicle || "",
      plate: driver.plate || account.driverProfile?.plate || "",
      zone: driver.zone || account.driverProfile?.zone || "",
    };
    const patch = {
      role: "driver",
      loginMethod: "username_password",
      googleLoginEnabled: false,
      phone: driver.phone || account.phone || phone,
      phoneDigits: phone,
      name,
      driverId,
      driverProfile,
      active: true,
      status: account.status === "pending_profile" && hasPassword ? "active" : (account.status || "active"),
      authProvider: "password",
      passwordHash: account.passwordHash || account.pinHash,
      passwordSalt: account.passwordSalt || account.pinSalt,
      passwordHashVersion: account.passwordHashVersion || account.pinHashVersion || "sha256-v1",
      pinHash: FieldValue.delete(),
      pinSalt: FieldValue.delete(),
      pinHashVersion: FieldValue.delete(),
      updatedAt: now,
    };
    const batch = db.batch();
    batch.set(db.collection("users_by_phone").doc(phone), patch, { merge: true });
    batch.set(db.collection("drivers").doc(driverId), {
      phoneDigits: phone,
      name,
      driverId,
      loginMethod: "username_password",
      userPhoneKey: phone,
      updatedAt: now,
    }, { merge: true });
    if (account.uidLast || account.uid) {
      batch.set(db.collection("users").doc(account.uidLast || account.uid), {
        ...patch,
        uid: account.uidLast || account.uid,
        uidLast: account.uidLast || account.uid,
      }, { merge: true });
    }
    await batch.commit();
    linked += 1;
  }

  rows.push({ driverId, name, phone: maskedPhone(phone), hasPassword, state });
}

console.table(rows);
const activeLocks = loginLimitsSnap.docs.filter((doc) => Number(doc.data()?.lockedUntilMs || 0) > Date.now());
if (process.argv.includes("--clear-locks")) {
  for (const doc of loginLimitsSnap.docs) await doc.ref.delete();
}
console.log(JSON.stringify({ mode: apply ? "apply" : "audit", activeDrivers: activeDrivers.length, linked, missingPhone, missingAccount, missingPassword, activeLocks: activeLocks.length, clearedLocks: process.argv.includes("--clear-locks") ? loginLimitsSnap.size : 0 }, null, 2));

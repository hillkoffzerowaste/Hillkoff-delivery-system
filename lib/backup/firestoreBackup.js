import { DocumentReference, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../firebaseAdmin.js";

const SUBCOLLECTION_IDS = ["activity", "history"];

function encodeValue(value) {
  if (value instanceof Timestamp) {
    return { __firestoreType: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __firestoreType: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { __firestoreType: "reference", path: value.path };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { __firestoreType: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return { __firestoreType: "number", value: String(value) };
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeValue(child)]));
  }
  return value;
}

function decodeValue(value, db) {
  if (Array.isArray(value)) return value.map((child) => decodeValue(child, db));
  if (!value || typeof value !== "object") return value;
  if (value.__firestoreType === "timestamp") return new Timestamp(Number(value.seconds), Number(value.nanoseconds));
  if (value.__firestoreType === "geopoint") return new GeoPoint(Number(value.latitude), Number(value.longitude));
  if (value.__firestoreType === "reference") return db.doc(String(value.path));
  if (value.__firestoreType === "bytes") return Buffer.from(String(value.base64 || ""), "base64");
  if (value.__firestoreType === "number") {
    if (value.value === "NaN") return Number.NaN;
    return value.value === "Infinity" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decodeValue(child, db)]));
}

async function collectCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  return snapshot.docs.map((doc) => ({ path: doc.ref.path, data: encodeValue(doc.data()) }));
}

async function listAuthUsers() {
  const auth = getAdminAuth();
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map((user) => ({
      uid: user.uid,
      email: user.email || "",
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName || "",
      phoneNumber: user.phoneNumber || "",
      photoURL: user.photoURL || "",
      disabled: Boolean(user.disabled),
      customClaims: user.customClaims || {},
      providerData: user.providerData.map((provider) => ({
        uid: provider.uid,
        displayName: provider.displayName || "",
        email: provider.email || "",
        phoneNumber: provider.phoneNumber || "",
        photoURL: provider.photoURL || "",
        providerId: provider.providerId
      })),
      metadata: {
        creationTime: user.metadata.creationTime || "",
        lastSignInTime: user.metadata.lastSignInTime || "",
        lastRefreshTime: user.metadata.lastRefreshTime || ""
      }
    })));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export async function fetchAllData() {
  const db = getAdminDb();
  const roots = await db.listCollections();
  const result = {};
  for (const collection of roots.sort((a, b) => a.id.localeCompare(b.id))) {
    result[collection.id] = await collectCollection(collection);
  }
  for (const collectionId of SUBCOLLECTION_IDS) {
    const snapshot = await db.collectionGroup(collectionId).get();
    for (const doc of snapshot.docs) {
      const segments = doc.ref.path.split("/");
      if (segments.length <= 2) continue;
      const root = segments[0];
      if (!result[root]) result[root] = [];
      result[root].push({ path: doc.ref.path, data: encodeValue(doc.data()) });
    }
  }
  result.auth_users = await listAuthUsers();
  return result;
}

export function getTableStats(data) {
  return Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]));
}

export async function restoreFirestoreBackup(backupData, collections, { replace = false } = {}) {
  const db = getAdminDb();
  const selected = collections.filter((name) => name !== "auth_users");
  if (replace) {
    for (const collectionName of selected) await db.recursiveDelete(db.collection(collectionName));
  }

  let restored = 0;
  let batch = db.batch();
  let batchSize = 0;
  for (const collectionName of selected) {
    const rows = Array.isArray(backupData[collectionName]) ? backupData[collectionName] : [];
    for (const row of rows) {
      const path = String(row?.path || "");
      if (!path || path.split("/")[0] !== collectionName || path.split("/").length % 2 !== 0) {
        throw new Error(`Invalid Firestore document path in ${collectionName}`);
      }
      batch.set(db.doc(path), decodeValue(row.data || {}, db), { merge: !replace });
      batchSize++;
      restored++;
      if (batchSize >= 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }
  }
  if (batchSize) await batch.commit();
  return { success: true, restored, collections: selected, authUsersRestored: false };
}

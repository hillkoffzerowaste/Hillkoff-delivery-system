import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    // normalize escaped newlines if user pasted with \n
    if (typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    if (!json.project_id || !json.client_email || !json.private_key) {
      throw new Error("Service account JSON is missing required fields");
    }
    return json;
  } catch (error) {
    const reason = error instanceof SyntaxError ? "must be valid JSON" : error?.message || "invalid value";
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON (${reason})`);
  }
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0];

  const sa = parseServiceAccount();
  if (sa) {
    return initializeApp({
      credential: cert(sa),
      projectId: sa.project_id,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined
    });
  }
  // fallback for local/dev environments that use GOOGLE_APPLICATION_CREDENTIALS
  return initializeApp({ credential: applicationDefault() });
}

export function getAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}

export function getAdminMessaging() {
  return getMessaging(getFirebaseAdminApp());
}

export function getAdminStorage() {
  return getStorage(getFirebaseAdminApp());
}


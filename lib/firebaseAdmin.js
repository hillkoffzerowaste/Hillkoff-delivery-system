import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    // normalize escaped newlines if user pasted with \n
    if (typeof json.private_key === "string") {
      json.private_key = json.private_key.replace(/\\n/g, "\n");
    }
    return json;
  } catch (e) {
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON (must be JSON)");
  }
}

export function getFirebaseAdminApp() {
  if (getApps().length) return getApps()[0];

  const sa = parseServiceAccount();
  if (sa) {
    return initializeApp({ credential: cert(sa) });
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


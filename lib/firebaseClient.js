import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut as fbSignOut
} from "firebase/auth";
import {
  getFirestore,
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from "firebase/firestore";

function requiredEnv(name) {
  if (!name) throw new Error("Missing env var name");
  throw new Error(`Missing env var: ${name}`);
}

export function getFirebaseApp() {
  if (getApps().length) return getApps()[0];
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey) requiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!authDomain) requiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!projectId) requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!appId) requiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID");

  return initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined
  });
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirestoreDb() {
  return getFirestore(getFirebaseApp());
}

export const fb = {
  serverTimestamp,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
};

export async function ensureRecaptcha(containerId = "recaptcha-container") {
  const auth = getFirebaseAuth();
  if (typeof window === "undefined") throw new Error("recaptcha requires browser");
  if (!document.getElementById(containerId)) throw new Error(`Missing element #${containerId}`);
  if (window.__hillkoffRecaptchaVerifier) return window.__hillkoffRecaptchaVerifier;
  const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  window.__hillkoffRecaptchaVerifier = verifier;
  try { await verifier.render(); } catch {}
  return verifier;
}

export async function startPhoneSignInE164(phoneE164) {
  const auth = getFirebaseAuth();
  const verifier = await ensureRecaptcha();
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

export async function fbLogout() {
  const auth = getFirebaseAuth();
  await fbSignOut(auth);
}

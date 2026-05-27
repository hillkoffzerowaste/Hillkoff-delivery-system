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
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export function getFirebaseApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    apiKey: requiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: requiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
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

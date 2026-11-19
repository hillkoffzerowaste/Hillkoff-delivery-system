// Shared server helpers for the store claim / production record routes (firebase-admin db passed in).
import { STORE_SETTINGS_COLLECTION, STORE_SETTINGS_DOC_ID, normalizeStoreSettings } from "./storeSettings.js";
import { RECORD_RANGE_MAX_DAYS, RECORD_READ_LIMIT, isDateKey } from "./storeClaimsProduction.js";
import { customRange } from "./storeOverview.js";
import { bangkokDateOf } from "./storeDailyReport.js";

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export async function readBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("bad");
    return body;
  } catch {
    throw fail("ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
}

// Ids this module creates: kind_<encoded number> or <requestId>_<index>; anything else is a 404.
export function validDocId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9%._-]{0,299}$/.test(value) && !/^__.*__$/.test(value);
}

export async function readSettings(db) {
  const snap = await db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID).get();
  return normalizeStoreSettings(snap.exists ? snap.data() : undefined);
}

// ?from&to (default: this month so far), at most RECORD_RANGE_MAX_DAYS days.
export function requestRange(params) {
  const today = bangkokDateOf(new Date().toISOString());
  const from = params.get("from") || `${today.slice(0, 7)}-01`;
  const to = params.get("to") || today;
  const range = isDateKey(from) && isDateKey(to) ? customRange(from, to) : null;
  if (!range || range.dates.length > RECORD_RANGE_MAX_DAYS) throw fail(`ช่วงวันที่ไม่ถูกต้อง หรือเกิน ${RECORD_RANGE_MAX_DAYS} วัน`);
  return range;
}

// Live rows of one collection by serviceDate (single-field range query, no composite index).
export async function readRange(db, collection, { from, to }, cap = RECORD_READ_LIMIT) {
  const snap = await db.collection(collection).where("serviceDate", ">=", from).where("serviceDate", "<=", to).orderBy("serviceDate").limit(cap + 1).get();
  if (snap.docs.length > cap) throw fail("ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง", 422);
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id })).filter((row) => !row.deletedAt);
}

export function publicRecord(row) {
  const { history, ...rest } = row;
  return { ...rest, historyCount: Array.isArray(history) ? history.length : 0 };
}

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";

// แคชผลค้นหาลูกค้าสองชั้น: ชั้นในหน่วยความจำของ instance (ฟรีแต่ไม่แชร์กัน)
// และชั้น Firestore ที่ทุก instance เห็นร่วมกัน (1 read ต่อครั้ง แทนการกวาด
// customer_search ใหม่ทั้งชุด) บน serverless ชั้นแรกมี hit rate ต่ำเพราะแต่ละ
// คำขออาจตกคนละ instance ชั้นที่สองจึงเป็นตัวที่ตัดยอด read จริง
export const CUSTOMER_SEARCH_CACHE_COLLECTION = "customer_search_cache";
export const CUSTOMER_SEARCH_CACHE_TTL_MS = 15 * 60_000;
export const CUSTOMER_SEARCH_VERSION_DOC = "__index_version__";

// แคชอายุ 15 นาทีที่แชร์กันทุก instance แปลว่าลูกค้าที่เพิ่งเพิ่มจะหาไม่เจอนานเกินรับได้
// จึงผูก cache key ไว้กับเลขเวอร์ชันของดัชนี ทุกครั้งที่ customer_search ถูกแก้เลขนี้จะเดินหน้า
// ทำให้ key เดิมเข้าไม่ถึงทันทีและเอกสารเก่าถูก TTL เก็บกวาดเอง
// เลขเวอร์ชันถูกแคชในหน่วยความจำสั้นๆ เพื่อไม่ให้ทุกคำค้นต้องอ่านเอกสารนี้ใหม่
const VERSION_CACHE_TTL_MS = 30_000;

// เอกสาร Firestore จำกัดที่ 1MB เผื่อพื้นที่ให้ metadata และ overhead ของการเข้ารหัส
const MAX_CACHE_PAYLOAD_BYTES = 600_000;
const MEMORY_CACHE_MAX_ENTRIES = 100;

const memoryCache = new Map();
let versionCache = null;

export function customerSearchCacheDocId(cacheKey) {
  return createHash("sha1").update(String(cacheKey)).digest("hex");
}

export async function customerSearchIndexVersion(db, now = Date.now()) {
  if (versionCache && now - versionCache.at < VERSION_CACHE_TTL_MS) return versionCache.value;
  try {
    const snap = await db.collection(CUSTOMER_SEARCH_CACHE_COLLECTION).doc(CUSTOMER_SEARCH_VERSION_DOC).get();
    const value = Number(snap.exists ? snap.data()?.value : 0) || 0;
    versionCache = { at: now, value };
    return value;
  } catch {
    // อ่านเวอร์ชันไม่ได้ให้ถือว่าแคชใช้ไม่ได้ ดีกว่าเสิร์ฟข้อมูลเก่าโดยไม่รู้ตัว
    return null;
  }
}

// เรียกหลังแก้ไข customer_search เพื่อให้แคชทุก instance หมดอายุพร้อมกันทันที
export async function bumpCustomerSearchIndexVersion(db) {
  versionCache = null;
  try {
    await db.collection(CUSTOMER_SEARCH_CACHE_COLLECTION).doc(CUSTOMER_SEARCH_VERSION_DOC).set(
      { value: FieldValue.increment(1), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}

function readMemoryCache(cacheKey, now) {
  const entry = memoryCache.get(cacheKey);
  if (!entry) return null;
  if (now - entry.at >= CUSTOMER_SEARCH_CACHE_TTL_MS) {
    memoryCache.delete(cacheKey);
    return null;
  }
  return entry.data;
}

function writeMemoryCache(cacheKey, data, now) {
  memoryCache.set(cacheKey, { at: now, data });
  if (memoryCache.size > MEMORY_CACHE_MAX_ENTRIES) memoryCache.delete(memoryCache.keys().next().value);
}

export function cacheEntryIsFresh(entry, now = Date.now()) {
  if (!entry || !Array.isArray(entry.data)) return false;
  const expiresAt = entry.expiresAt?.toMillis ? entry.expiresAt.toMillis() : Date.parse(entry.expiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function cachePayloadFits(data) {
  try {
    return Buffer.byteLength(JSON.stringify(data), "utf8") <= MAX_CACHE_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

// การอ่านแคชล้มเหลวต้องไม่ทำให้การค้นหาล้มเหลว ทุก path จึงกลืน error แล้วตกไปยิง query จริง
export function versionedCacheKey(version, cacheKey) {
  return `v${version}:${cacheKey}`;
}

export async function readCustomerSearchCache(db, cacheKey, now = Date.now()) {
  const version = await customerSearchIndexVersion(db, now);
  if (version === null) return null;
  const key = versionedCacheKey(version, cacheKey);
  const local = readMemoryCache(key, now);
  if (local) return local;
  try {
    const snap = await db.collection(CUSTOMER_SEARCH_CACHE_COLLECTION).doc(customerSearchCacheDocId(key)).get();
    if (!snap.exists) return null;
    const entry = snap.data() || {};
    if (!cacheEntryIsFresh(entry, now)) return null;
    writeMemoryCache(key, entry.data, now);
    return entry.data;
  } catch {
    return null;
  }
}

export async function writeCustomerSearchCache(db, cacheKey, data, now = Date.now()) {
  const version = await customerSearchIndexVersion(db, now);
  if (version === null) return false;
  const key = versionedCacheKey(version, cacheKey);
  writeMemoryCache(key, data, now);
  if (!cachePayloadFits(data)) return false;
  try {
    await db.collection(CUSTOMER_SEARCH_CACHE_COLLECTION).doc(customerSearchCacheDocId(key)).set({
      key: key.slice(0, 500),
      data,
      at: new Date(now).toISOString(),
      expiresAt: new Date(now + CUSTOMER_SEARCH_CACHE_TTL_MS)
    });
    return true;
  } catch {
    return false;
  }
}

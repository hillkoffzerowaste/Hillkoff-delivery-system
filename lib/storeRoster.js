// Server-side store roster: active store accounts plus the named staff kept in store settings.
import { normalizeStoreSettings } from "./storeSettings.js";
import { rolesById } from "./storeDuty.js";

export const ROSTER_LIMIT = 100;
const OVER_LIMIT_MESSAGE = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";

export async function readStoreRoster(db) {
  const [snap, settingsSnap] = await Promise.all([
    db.collection("users").where("role", "==", "store").limit(ROSTER_LIMIT + 1).get(),
    db.collection("store_settings").doc("default").get()
  ]);
  if (snap.docs.length > ROSTER_LIMIT) throw Object.assign(new Error(OVER_LIMIT_MESSAGE), { status: 422 });
  const label = (data) => String(data.name || data.username || String(data.email || "").split("@")[0] || "").trim();
  return snap.docs
    .map((doc) => ({ uid: doc.id, data: doc.data() }))
    .filter(({ data }) => data.active !== false && !["disabled", "rejected"].includes(String(data.status || "")))
    .map(({ uid, data }) => ({ uid, name: label(data) || uid }))
    .concat(normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() : undefined).staff.filter((person) => person.active).map((person) => ({ uid: person.id, name: person.name })))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

// Standing positions per roster uid ({ [uid]: { position, area } }); small collection, read whole.
export async function readStaffRoles(db) {
  const snap = await db.collection("store_staff_roles").limit(ROSTER_LIMIT * 2).get();
  return rolesById(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

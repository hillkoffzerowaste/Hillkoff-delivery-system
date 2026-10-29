import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { normalizeStoreSettings } from "../../../../lib/storeSettings";

export const runtime = "nodejs";

const STAFF_LIMIT = 100;

function displayName(user) {
  return String(user.name || user.username || String(user.email || "").split("@")[0] || "").trim();
}

// Only uid + display name leave this route: it feeds the preparer dropdown, nothing else.
export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const [snap, settingsSnap] = await Promise.all([
      db.collection("users").where("role", "==", "store").limit(STAFF_LIMIT + 1).get(),
      db.collection("store_settings").doc("default").get()
    ]);
    if (snap.docs.length > STAFF_LIMIT) return Response.json({ ok: false, error: "รายชื่อพนักงานสโตร์มากเกินขีดจำกัด" }, { status: 422 });
    const staff = snap.docs
      .map((doc) => ({ uid: doc.id, user: doc.data() || {} }))
      .filter(({ user }) => user.active !== false && !["disabled", "rejected"].includes(String(user.status || "")))
      .map(({ uid, user }) => ({ uid, name: displayName(user) }))
      .filter((person) => person.name)
      .concat(normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() : undefined).staff.filter((person) => person.active).map((person) => ({ uid: person.id, name: person.name })))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    return Response.json({ ok: true, data: staff });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { getActiveStoreStaff, normalizeStoreSettings } from "../../../../lib/storeSettings";

export const runtime = "nodejs";

// Only the named staff from store_settings/default leave this route. Store
// employees used by store documents must come from the Store Settings page.
export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const settingsSnap = await db.collection("store_settings").doc("default").get();
    const staff = getActiveStoreStaff(normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() : undefined));
    return Response.json({ ok: true, data: staff });
  } catch (error) {
    return errorResponse(error);
  }
}

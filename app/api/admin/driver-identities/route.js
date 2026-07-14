import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { driverIdentityPatch } from "../../../../lib/driverIdentity";

export const runtime = "nodejs";

async function loadDrivers(db) {
  const snap = await db.collection("users_by_phone").where("role", "==", "driver").limit(500).get();
  return snap.docs.map((doc) => ({ doc, data: doc.data() || {} }));
}

function summary(rows) {
  const drivers = rows.map(({ doc, data }) => ({
    phoneDigits: String(data.phoneDigits || doc.id || ""),
    driverId: String(data.driverId || `driver_${data.phoneDigits || doc.id}`),
    name: String(data.name || ""),
    hasCurrentUid: Boolean(data.uidLast || data.uid),
    legacyUidCount: Array.isArray(data.legacyUids) ? data.legacyUids.length : 0,
    migrated: data.identityVersion === 2 && data.migrationStatus === "identity_migrated"
  }));
  return {
    total: drivers.length,
    migrated: drivers.filter((driver) => driver.migrated).length,
    pending: drivers.filter((driver) => !driver.migrated).length,
    missingCurrentUid: drivers.filter((driver) => !driver.hasCurrentUid).length,
    drivers
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    return Response.json({ ok: true, data: summary(await loadDrivers(db)) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    const rows = await loadDrivers(db);
    if (body?.dryRun !== false) return Response.json({ ok: true, dryRun: true, data: summary(rows) });

    const batch = db.batch();
    let migrated = 0;
    let skipped = 0;
    for (const { doc, data } of rows) {
      const uid = String(data.uidLast || data.uid || "").trim();
      if (!uid) { skipped += 1; continue; }
      batch.set(doc.ref, { ...driverIdentityPatch(data, uid), identityMigratedBy: profile.email || profile.uid }, { merge: true });
      migrated += 1;
    }
    if (migrated) await batch.commit();
    await db.collection("audit_logs").add({ action: "driver_identity_migration", migrated, skipped, byUid: profile.uid, createdAt: new Date().toISOString() });
    return Response.json({ ok: true, data: { migrated, skipped, summary: summary(await loadDrivers(db)) } });
  } catch (error) { return errorResponse(error); }
}

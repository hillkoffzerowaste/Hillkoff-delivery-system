import { getAdminDb } from "../lib/firebaseAdmin.js";
import { HILLKOFF_VEHICLES } from "../lib/vehicleMaster.js";

const apply = process.argv.includes("--apply");
console.log(JSON.stringify({ collection: "vehicle_master", proposed: HILLKOFF_VEHICLES.length, apply }, null, 2));

if (apply) {
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date().toISOString();
  const actor = "migration:seed-vehicle-master";
  const existingSnap = await db.collection("vehicle_master").get();
  const existingById = new Map(existingSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
  for (const vehicle of HILLKOFF_VEHICLES) {
    const existing = existingById.get(vehicle.id) || {};
    batch.set(db.collection("vehicle_master").doc(vehicle.id), {
      ...vehicle,
      active: true,
      createdAt: existing.createdAt || now,
      createdBy: existing.createdBy || actor,
      updatedAt: now,
      updatedBy: actor,
      seededAt: existing.seededAt || now
    }, { merge: true });
  }
  batch.set(db.collection("audit_logs").doc(), {
    action: "vehicle_master_seeded",
    collection: "vehicle_master",
    proposed: HILLKOFF_VEHICLES.length,
    existingBefore: existingSnap.size,
    mergeOnly: true,
    deleted: 0,
    actor,
    createdAt: now
  });
  await batch.commit();
  console.log(`Merged ${HILLKOFF_VEHICLES.length} vehicle records; deleted 0.`);
} else {
  console.log("Dry run only. Pass --apply after backup and authorization.");
}

import { getAdminDb } from "../lib/firebaseAdmin.js";
import { HILLKOFF_VEHICLES } from "../lib/vehicleMaster.js";

const apply = process.argv.includes("--apply");
console.log(JSON.stringify({ collection: "vehicle_master", proposed: HILLKOFF_VEHICLES.length, apply }, null, 2));

if (apply) {
  const db = getAdminDb();
  const batch = db.batch();
  const now = new Date().toISOString();
  for (const vehicle of HILLKOFF_VEHICLES) {
    batch.set(db.collection("vehicle_master").doc(vehicle.id), {
      ...vehicle,
      active: true,
      updatedAt: now,
      seededAt: now
    }, { merge: true });
  }
  await batch.commit();
  console.log(`Merged ${HILLKOFF_VEHICLES.length} vehicle records; deleted 0.`);
} else {
  console.log("Dry run only. Pass --apply after backup and authorization.");
}

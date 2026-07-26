import { findVehicleById, HILLKOFF_VEHICLES } from "./vehicleMaster.js";

function normalizeVehicle(id, data = {}) {
  return { ...data, id: String(data.id || data.assetCode || id), assetCode: String(data.assetCode || id), active: data.active !== false };
}

export async function listVehicles(db, { includeInactive = false } = {}) {
  try {
    const snap = await db.collection("vehicle_master").get();
    if (!snap.empty) {
      return snap.docs
        .map((doc) => normalizeVehicle(doc.id, doc.data() || {}))
        .filter((vehicle) => includeInactive || vehicle.active)
        .sort((a, b) => String(a.plate || a.assetCode).localeCompare(String(b.plate || b.assetCode), "th"));
    }
  } catch (error) {
    console.warn("vehicle_master unavailable; using static fallback", error?.message || error);
  }
  return HILLKOFF_VEHICLES.filter((vehicle) => includeInactive || vehicle.active !== false).map((vehicle) => ({ ...vehicle }));
}

export async function resolveVehicle(db, vehicleId, { includeInactive = false } = {}) {
  const id = String(vehicleId || "").trim();
  if (!id) return null;
  try {
    const snap = await db.collection("vehicle_master").doc(id).get();
    if (snap.exists) {
      const vehicle = normalizeVehicle(snap.id, snap.data() || {});
      return includeInactive || vehicle.active ? vehicle : null;
    }
  } catch (error) {
    console.warn("vehicle_master lookup unavailable; using static fallback", error?.message || error);
  }
  const fallback = findVehicleById(id);
  return fallback && (includeInactive || fallback.active !== false) ? { ...fallback } : null;
}

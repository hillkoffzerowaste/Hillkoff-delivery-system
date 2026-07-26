export const APPROVED_ODOMETER_ACCOUNTING_EMAIL = "acc.ap@hillkoff.com";

export function canCorrectVehicleOdometer(profile = {}) {
  const role = String(profile.role || "");
  const email = String(profile.email || "").trim().toLowerCase();
  return role === "admin"
    || (role === "accounting" && email === APPROVED_ODOMETER_ACCOUNTING_EMAIL);
}

export function buildOdometerCorrection({
  event = {},
  odometer,
  minimumOdometer = 0,
  maximumOdometer = 0,
  reason,
  actor = {},
  now = new Date().toISOString()
} = {}) {
  const eventId = String(event.id || "").trim();
  if (!eventId) throw new Error("Event is required");
  const nextOdometer = Number(odometer);
  if (!Number.isFinite(nextOdometer) || nextOdometer <= 0 || nextOdometer > 10_000_000) {
    throw new Error("Invalid odometer");
  }
  const minimum = Number(minimumOdometer || 0);
  if (String(event.eventType || "") === "end" && Number.isFinite(minimum) && minimum > 0 && nextOdometer < minimum) {
    throw new Error("End odometer must not be less than start odometer");
  }
  const maximum = Number(maximumOdometer || 0);
  if (String(event.eventType || "") === "start" && Number.isFinite(maximum) && maximum > 0 && nextOdometer > maximum) {
    throw new Error("Start odometer must not be greater than end odometer");
  }
  const correctionReason = String(reason || "").trim().slice(0, 1000);
  if (!correctionReason) throw new Error("Correction reason is required");
  const correctedByEmail = String(actor.email || "").trim().toLowerCase();
  const previousOdometer = Number(event.odometer);
  const eventPatch = {
    odometer: nextOdometer,
    odometerCorrectedAt: now,
    odometerCorrectedBy: correctedByEmail || String(actor.uid || ""),
    odometerCorrectionReason: correctionReason,
    updatedAt: now
  };
  const auditRecord = {
    eventId,
    serviceDate: String(event.serviceDate || ""),
    vehicleId: String(event.vehicleId || ""),
    driverId: String(event.driverId || ""),
    eventType: String(event.eventType || ""),
    previousOdometer: Number.isFinite(previousOdometer) ? previousOdometer : null,
    nextOdometer,
    reason: correctionReason,
    correctedByUid: String(actor.uid || ""),
    correctedByEmail,
    correctedByRole: String(actor.role || ""),
    createdAt: now
  };
  return { eventPatch, auditRecord };
}

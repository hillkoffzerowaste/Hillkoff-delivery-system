/**
 * Backfill vehicle_usage_events to Google Sheets via Apps Script.
 *
 * Usage:
 *   node scripts/backfillVehicleUsageToSheet.cjs
 *   node scripts/backfillVehicleUsageToSheet.cjs --dry-run
 *   node scripts/backfillVehicleUsageToSheet.cjs --limit 10
 */

require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const webAppUrl = process.env.GOOGLE_MILEAGE_WEB_APP_URL || process.env.GOOGLE_SHEETS_WEB_APP_URL;
const sharedSecret = String(process.env.GOOGLE_SHEETS_SHARED_SECRET || "").trim();
const dryRun = process.argv.includes("--dry-run");
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex !== -1 ? Number.parseInt(process.argv[limitIndex + 1], 10) : Infinity;

if (!serviceAccountJson) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in env");
  process.exit(1);
}
if (!dryRun && !webAppUrl) {
  console.error("Missing GOOGLE_MILEAGE_WEB_APP_URL or GOOGLE_SHEETS_WEB_APP_URL in env");
  process.exit(1);
}
if (!dryRun && !sharedSecret) {
  console.error("Missing GOOGLE_SHEETS_SHARED_SECRET in env");
  process.exit(1);
}

if (!Number.isFinite(limit) && limit !== Infinity) {
  console.error("Invalid --limit value");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
  if (typeof serviceAccount.private_key === "string") {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
} catch (error) {
  console.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${error?.message || error}`);
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

function shouldProcess(data = {}) {
  const status = String(data.googleSyncStatus || "").trim().toLowerCase();
  return !status || status === "pending" || status === "failed" || status === "skipped";
}

function valueOrBlank(value) {
  return value === undefined || value === null ? "" : value;
}

function buildPayload(doc) {
  const data = doc.data() || {};
  return {
    action: "appendUsageSegment",
    sharedSecret,
    id: doc.id,
    serviceDate: valueOrBlank(data.serviceDate),
    eventType: valueOrBlank(data.eventType),
    driverId: valueOrBlank(data.driverId),
    driverName: valueOrBlank(data.driverName),
    driverPhone: valueOrBlank(data.driverPhone),
    vehicleId: valueOrBlank(data.vehicleId),
    assetCode: valueOrBlank(data.assetCode),
    plate: valueOrBlank(data.plate),
    vehicleName: valueOrBlank(data.vehicleName),
    odometer: Number(data.odometer) || 0,
    odometerStart: Number(data.odometerStart) || 0,
    usageType: valueOrBlank(data.usageType),
    detail: valueOrBlank(data.detail),
    note: valueOrBlank(data.note)
  };
}

async function postToSheet(payload) {
  const response = await fetch(webAppUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON Apps Script response: ${text.slice(0, 200)}`);
  }
}

async function main() {
  console.log(`Starting vehicle usage backfill${dryRun ? " (dry run)" : ""}`);
  const snapshot = await db.collection("vehicle_usage_events").get();
  let alreadySynced = 0;
  let processed = 0;
  let synced = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    if (!shouldProcess(data)) {
      alreadySynced++;
      continue;
    }
    if (processed >= limit) break;

    processed++;
    const currentStatus = String(data.googleSyncStatus || "missing");
    const payload = buildPayload(doc);

    if (dryRun) {
      console.log(`[dry] ${doc.id} status=${currentStatus} eventType=${payload.eventType} serviceDate=${payload.serviceDate}`);
      continue;
    }

    try {
      const result = await postToSheet(payload);
      if (result?.ok !== true) throw new Error(result?.error || "Apps Script returned ok=false");
      await doc.ref.update({
        googleSyncStatus: "synced",
        googleSyncError: "",
        googleSyncedAt: FieldValue.serverTimestamp()
      });
      synced++;
      console.log(`[synced] ${doc.id} action=${result?.data?.action || "appendUsageSegment"}`);
    } catch (error) {
      failed++;
      const message = String(error?.message || error).slice(0, 500);
      await doc.ref.update({
        googleSyncStatus: "failed",
        googleSyncError: message,
        googleSyncedAt: FieldValue.serverTimestamp()
      });
      console.error(`[failed] ${doc.id}: ${message}`);
    }
  }

  console.log("Summary:");
  console.log(`  total docs: ${snapshot.size}`);
  console.log(`  already synced: ${alreadySynced}`);
  console.log(`  processed: ${processed}`);
  console.log(`  synced: ${synced}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`Backfill failed: ${error?.message || error}`);
  process.exit(1);
});

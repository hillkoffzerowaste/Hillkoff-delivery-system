import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokRangeIso } from "../../../../lib/storeFormat.js";
import { DAILY_REPORT_LIMITS, bangkokDateOf } from "../../../../lib/storeDailyReport.js";
import { customRange } from "../../../../lib/storeOverview.js";
import { readStoreRoster } from "../../../../lib/storeRoster.js";
import { readStoreCases } from "../../../../lib/storeCasesStore.js";
import { normalizeStoreSettings } from "../../../../lib/storeSettings.js";
import { WAREHOUSE_MAX_DAYS, buildWarehouseDashboard } from "../../../../lib/storeWarehouseDashboard.js";
import { STORE_CLAIMS_COLLECTION, STORE_PRODUCTION_COLLECTION, storeMainBranches } from "../../../../lib/storeClaimsProduction.js";

export const runtime = "nodejs";

const WORK_LOG_LIMIT = 3000;
// Ranges longer than two months (the "3 เดือน" preset) need the same higher caps as the overview report.
const LONG_RANGE_DAYS = 62;
const LONG_CAPS = { reports: 18000, transfers: 9000, audits: 9000 };
const RECORD_CAP = 3000;
const CLAIM_FIELDS = ["kind", "documentNumber", "serviceDate", "branchCode", "reason", "requester", "supplier", "items", "totalQty", "totalAmount", "deletedAt"];
const PRODUCTION_FIELDS = ["serviceDate", "branchCode", "items", "deletedAt"];
const TOO_MANY = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";
const REPORT_FIELDS = ["type", "status", "packStatus", "packUpdatedAt", "caseStatus", "caseUpdatedAt", "packAutoConfirmed", "createdAt", "deletedAt", "serviceDate", "confirmedAt", "storeCheckerName"];

// Every query is single-field (range + orderBy on the same field) so no composite index is needed.
async function readCapped(query, cap) {
  const snap = await query.limit(cap + 1).get();
  if (snap.docs.length > cap) throw Object.assign(new Error(TOO_MANY), { status: 422 });
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

const between = (db, collection, field, from, to, exclusive = false) => db.collection(collection).where(field, ">=", from).where(field, exclusive ? "<" : "<=", to).orderBy(field);

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const today = bangkokDateOf(new Date().toISOString());
    const range = customRange(params.get("from") || `${today.slice(0, 7)}-01`, params.get("to") || today);
    if (!range || range.dates.length > WAREHOUSE_MAX_DAYS) return Response.json({ ok: false, error: `ช่วงวันที่ไม่ถูกต้อง หรือเกิน ${WAREHOUSE_MAX_DAYS} วัน` }, { status: 400 });
    const { from, to } = range;
    const bounds = bangkokRangeIso(from, to);
    const long = range.dates.length > LONG_RANGE_DAYS;
    const cap = long ? LONG_CAPS.reports : DAILY_REPORT_LIMITS.monthReports;
    const [roster, settingsSnap, byCreated, byService, transfers, audits, workLogs, cases, claims, production] = await Promise.all([
      readStoreRoster(db),
      db.collection("store_settings").doc("default").get(),
      readCapped(between(db, "store_reports", "createdAt", bounds.start, bounds.endExclusive, true).select(...REPORT_FIELDS), cap),
      readCapped(between(db, "store_reports", "serviceDate", from, to).select(...REPORT_FIELDS), cap),
      readCapped(between(db, "store_transfers", "serviceDate", from, to), long ? LONG_CAPS.transfers : DAILY_REPORT_LIMITS.monthTransfers),
      readCapped(between(db, "store_audits", "serviceDate", from, to), long ? LONG_CAPS.audits : DAILY_REPORT_LIMITS.monthAudits),
      readCapped(between(db, "store_work_logs", "date", from, to), WORK_LOG_LIMIT),
      readStoreCases(db),
      readCapped(between(db, STORE_CLAIMS_COLLECTION, "serviceDate", from, to).select(...CLAIM_FIELDS), RECORD_CAP),
      readCapped(between(db, STORE_PRODUCTION_COLLECTION, "serviceDate", from, to).select(...PRODUCTION_FIELDS), RECORD_CAP)
    ]);
    const reports = [...new Map([...byCreated, ...byService].map((row) => [row.id, row])).values()];
    if (reports.length > cap) throw Object.assign(new Error(TOO_MANY), { status: 422 });
    const settings = normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() : undefined);
    // Cards and chips cover the store's main branches only (CP / HQ / MHD).
    const branchList = storeMainBranches(settings.branches).map((branch) => ({ code: branch.code, name: branch.name }));
    const branchNames = Object.fromEntries(settings.branches.map((branch) => [branch.code, branch.name]));
    const data = buildWarehouseDashboard({ from, to, today, branchList, branchNames, roster, reports, transfers, audits, cases, workLogs, claims, production });
    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

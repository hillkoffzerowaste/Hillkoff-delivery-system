import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { addDaysToDateKey, bangkokDayRange, bangkokMonthRange, bangkokRangeIso } from "../../../../lib/storeFormat";
import { DAILY_REPORT_LIMITS, bangkokDateOf, buildDailyReport, buildMonthReport } from "../../../../lib/storeDailyReport";
import { readStaffRoles, readStoreRoster } from "../../../../lib/storeRoster";
import { readStoreReportsByDate } from "../../../../lib/storeReportRead.js";
import { cachedRead } from "../../../../lib/serverCache.js";
// Store staff watching the same day/month share one read for two minutes; fresh=1 (refresh, after a save) re-reads.
const CACHE_MS = 120_000;
// Month totals only count who confirmed what and when; the day view also needs details for its timeline.
const MONTH_REPORT_FIELDS = ["type", "status", "serviceDate", "createdAt", "deletedAt", "confirmedAt", "storeCheckerName"];

export const runtime = "nodejs";

const WORK_LOG_LIMIT = 2000;
const OVER_LIMIT_MESSAGE = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";
const ORDER_FIELDS = ["workflowHistory", "customerName", "storeStatus"];

const fail = (message, status) => Response.json({ ok: false, error: message }, { status });

// Every query is single-field (equality, or a range plus orderBy on the same field) so no composite index is needed.
async function readCapped(query, cap) {
  const snap = await query.limit(cap + 1).get();
  if (snap.docs.length > cap) throw Object.assign(new Error(OVER_LIMIT_MESSAGE), { status: 422 });
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

async function readOptional(query, cap) {
  const snap = await query.limit(cap + 1).get();
  return { capped: snap.docs.length > cap, rows: snap.docs.slice(0, cap).map((doc) => ({ ...doc.data(), id: doc.id })) };
}

function rangeQuery(db, collection, field, from, to, { exclusiveEnd = false } = {}) {
  return db.collection(collection).where(field, ">=", from).where(field, exclusiveEnd ? "<" : "<=", to).orderBy(field);
}

async function readReports(db, from, to, cap, fields = null) {
  return readStoreReportsByDate(db, { from, to, cap, fields });
}

async function readDay(db, date) {
  const weekFrom = addDaysToDateKey(date, -6);
  const day = bangkokDayRange(date);
  const [roster, weekReports, weekTransfers, transfersResolved, openTransfers, weekAudits, orders, workLogs, staffRoles, duties] = await Promise.all([
    readStoreRoster(db),
    readReports(db, weekFrom, date, DAILY_REPORT_LIMITS.reports),
    readCapped(rangeQuery(db, "store_transfers", "serviceDate", weekFrom, date), DAILY_REPORT_LIMITS.transfers),
    readCapped(rangeQuery(db, "store_transfers", "resolvedServiceDate", weekFrom, date), DAILY_REPORT_LIMITS.transfers),
    readOptional(db.collection("store_transfers").where("issueState", "==", "open"), DAILY_REPORT_LIMITS.openIssues),
    readCapped(rangeQuery(db, "store_audits", "serviceDate", weekFrom, date), DAILY_REPORT_LIMITS.audits),
    readOptional(rangeQuery(db, "orders", "updatedAt", day.start, bangkokRangeIso(date, date).endExclusive, { exclusiveEnd: true }).select(...ORDER_FIELDS), DAILY_REPORT_LIMITS.orders),
    readCapped(rangeQuery(db, "store_work_logs", "date", weekFrom, date), WORK_LOG_LIMIT),
    readStaffRoles(db),
    readCapped(db.collection("store_duties").where("date", "==", date), WORK_LOG_LIMIT)
  ]);
  const report = buildDailyReport({
    date,
    today: bangkokDateOf(new Date().toISOString()),
    roster,
    reports: weekReports,
    orders: orders.capped ? [] : orders.rows,
    transfersCreated: weekTransfers,
    transfersResolved,
    openTransfers: openTransfers.rows,
    audits: weekAudits,
    weekReports,
    weekTransfers,
    weekAudits,
    workLogs,
    staffRoles,
    duties
  });
  return { ...report, ordersCapped: orders.capped, openIssuesCapped: openTransfers.capped };
}

async function readMonth(db, month) {
  const range = bangkokMonthRange(month);
  const today = bangkokDateOf(new Date().toISOString());
  const endDay = today.startsWith(`${month}-`) ? Number(today.slice(8, 10)) : Number(range.to.slice(8, 10));
  const [roster, reports, transfers, audits, workLogs] = await Promise.all([
    readStoreRoster(db),
    readReports(db, range.from, range.to, DAILY_REPORT_LIMITS.monthReports, MONTH_REPORT_FIELDS),
    readCapped(rangeQuery(db, "store_transfers", "serviceDate", range.from, range.to), DAILY_REPORT_LIMITS.monthTransfers),
    readCapped(rangeQuery(db, "store_audits", "serviceDate", range.from, range.to), DAILY_REPORT_LIMITS.monthAudits),
    readCapped(rangeQuery(db, "store_work_logs", "date", range.from, range.to), WORK_LOG_LIMIT)
  ]);
  return buildMonthReport({ month, endDay, roster, reports, transfers, audits, workLogs });
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const fresh = params.get("fresh") === "1";
    if (params.has("month")) {
      const month = params.get("month");
      if (!bangkokMonthRange(month)) return fail("เดือนไม่ถูกต้อง", 400);
      const data = await cachedRead(`daily-report:month:${month}`, CACHE_MS, async () => {
        const { month: key, rangeLabel, people, unattributed } = await readMonth(db, month);
        return { month: key, rangeLabel, people, unattributed, generatedAt: new Date().toISOString() };
      }, { fresh });
      return Response.json({ ok: true, data });
    }
    const date = params.get("date");
    if (!bangkokDayRange(date)) return fail("วันที่ไม่ถูกต้อง", 400);
    const data = await cachedRead(`daily-report:date:${date}:${bangkokDateOf(new Date().toISOString())}`, CACHE_MS, async () => ({ ...(await readDay(db, date)), generatedAt: new Date().toISOString() }), { fresh });
    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

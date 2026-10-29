import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokRangeIso } from "../../../../lib/storeFormat.js";
import { DAILY_CHART_MAX_DAYS, MAX_RANGE_DAYS, OVERVIEW_PERIODS, bangkokDateOf, buildStoreOverview, overviewRange } from "../../../../lib/storeOverview.js";
import { readStoreRoster } from "../../../../lib/storeRoster.js";

export const runtime = "nodejs";

// ทุก query เป็น single-field (range + orderBy field เดียวกัน หรือ == อย่างเดียว) จึงไม่ต้องเพิ่ม composite index
const LIMITS = { reports: 6000, transfers: 3000, audits: 3000, workLogs: 3000, openTransfers: 500 };
// ช่วงหลายเดือน/ทั้งปีอ่านเอกสารมากขึ้นตามจำนวนวัน
const LONG_LIMITS = { ...LIMITS, reports: 24000, transfers: 12000, audits: 12000, workLogs: 12000 };
const TOO_MANY = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";
const REPORT_FIELDS = ["type", "status", "packStatus", "createdAt", "deletedAt", "workflowHistory", "bookingNumber", "detail", "note", "returnReason", "serviceDate", "confirmedAt", "storeCheckerName"];

function tooMany() {
  return Object.assign(new Error(TOO_MANY), { status: 422 });
}

async function readCapped(query, cap) {
  const snap = await query.limit(cap + 1).get();
  if (snap.docs.length > cap) throw tooMany();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function readOptional(query, cap) {
  const snap = await query.limit(cap + 1).get();
  return { capped: snap.docs.length > cap, rows: snap.docs.slice(0, cap).map((doc) => ({ id: doc.id, ...doc.data() })) };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const period = params.get("period") || "7d";
    if (period !== "custom" && !OVERVIEW_PERIODS.includes(period)) return Response.json({ ok: false, error: "ช่วงเวลาไม่ถูกต้อง" }, { status: 400 });
    const anchorDate = params.get("date") || bangkokDateOf(new Date().toISOString());
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const range = overviewRange({ period, anchorDate, from, to });
    if (!range) return Response.json({ ok: false, error: period === "custom" ? `ช่วงวันที่ไม่ถูกต้อง หรือเกิน ${MAX_RANGE_DAYS} วัน` : "วันที่ไม่ถูกต้อง" }, { status: 400 });
    const iso = bangkokRangeIso(range.from, range.to);
    const limits = range.dates.length > DAILY_CHART_MAX_DAYS ? LONG_LIMITS : LIMITS;

    const [transfers, audits, reports, openTransfers, roster, workLogs] = await Promise.all([
      readCapped(db.collection("store_transfers").where("serviceDate", ">=", range.from).where("serviceDate", "<=", range.to).orderBy("serviceDate"), limits.transfers),
      readCapped(db.collection("store_audits").where("serviceDate", ">=", range.from).where("serviceDate", "<=", range.to).orderBy("serviceDate"), limits.audits),
      readCapped(db.collection("store_reports").where("createdAt", ">=", iso.start).where("createdAt", "<", iso.endExclusive).orderBy("createdAt", "desc").select(...REPORT_FIELDS), limits.reports),
      readOptional(db.collection("store_transfers").where("issueState", "==", "open"), limits.openTransfers),
      readStoreRoster(db),
      readCapped(db.collection("store_work_logs").where("date", ">=", range.from).where("date", "<=", range.to).orderBy("date"), limits.workLogs)
    ]);

    const overview = buildStoreOverview({ period, anchorDate, from, to, transfers, audits, reports, openTransfers: openTransfers.rows, roster, workLogs });
    return Response.json({ ok: true, data: { ...overview, openTransfersCapped: openTransfers.capped } });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokRangeIso } from "../../../../lib/storeFormat.js";
import { OVERVIEW_PERIODS, bangkokDateOf, buildStoreOverview, periodRange } from "../../../../lib/storeOverview.js";

export const runtime = "nodejs";

// ทุก query เป็น single-field (range + orderBy field เดียวกัน หรือ == อย่างเดียว) จึงไม่ต้องเพิ่ม composite index
const LIMITS = { reports: 6000, transfers: 3000, audits: 3000, openTransfers: 500 };
const TOO_MANY = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";
const REPORT_FIELDS = ["type", "status", "packStatus", "createdAt", "deletedAt", "workflowHistory", "bookingNumber", "detail", "note", "returnReason"];

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
    if (!OVERVIEW_PERIODS.includes(period)) return Response.json({ ok: false, error: "ช่วงเวลาไม่ถูกต้อง" }, { status: 400 });
    const anchorDate = params.get("date") || bangkokDateOf(new Date().toISOString());
    const range = periodRange(period, anchorDate);
    if (!range) return Response.json({ ok: false, error: "วันที่ไม่ถูกต้อง" }, { status: 400 });
    const iso = bangkokRangeIso(range.from, range.to);

    const [transfers, audits, reports, openTransfers] = await Promise.all([
      readCapped(db.collection("store_transfers").where("serviceDate", ">=", range.from).where("serviceDate", "<=", range.to).orderBy("serviceDate"), LIMITS.transfers),
      readCapped(db.collection("store_audits").where("serviceDate", ">=", range.from).where("serviceDate", "<=", range.to).orderBy("serviceDate"), LIMITS.audits),
      readCapped(db.collection("store_reports").where("createdAt", ">=", iso.start).where("createdAt", "<", iso.endExclusive).orderBy("createdAt", "desc").select(...REPORT_FIELDS), LIMITS.reports),
      readOptional(db.collection("store_transfers").where("issueState", "==", "open"), LIMITS.openTransfers)
    ]);

    return Response.json({ ok: true, data: { ...buildStoreOverview({ period, anchorDate, transfers, audits, reports, openTransfers: openTransfers.rows }), openTransfersCapped: openTransfers.capped } });
  } catch (error) {
    return errorResponse(error);
  }
}

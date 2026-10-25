import { errorResponse, requireProfile } from "../../../lib/workflowAuth";
import { resolveKpiPeriod } from "../../../lib/operationsKpiPeriod";
import { isStoreReportVisibleToRole } from "../../../lib/preparationWorkflow";

export const runtime = "nodejs";
const MAX_ROWS = 50000;
const PAGE_SIZE = 1000;
const FIELDS = ["serviceDate", "createdAt", "updatedAt", "workflowType", "storeStatus", "packStatus", "queueStatus", "bookingNumber", "customerName", "workflowHistory", "activity", "returnedToStoreAt", "returnReason", "storePackerName", "storeCheckerName", "packCheckerName", "orderEntrySource", "type", "status", "deletedAt", "confirmedAt"];

export async function GET(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store", "pack", "admin"]);
    const params = new URL(request.url).searchParams;
    const period = resolveKpiPeriod({ mode: "range", from: params.get("from"), to: params.get("to") });
    if (!period) return Response.json({ ok: false, error: "กรุณาเลือกวันที่ที่ถูกต้อง วันเริ่มต้นไม่เกินวันสิ้นสุด และช่วงไม่เกิน 366 วัน" }, { status: 400 });
    const start = new Date(`${period.from}T00:00:00+07:00`).toISOString();
    const end = new Date(Date.parse(`${period.to}T00:00:00+07:00`) + 86400000).toISOString();
    const readCollection = async (collection) => {
      // Read by work date and event update date so older jobs with activity in the period remain visible.
      const rows = new Map();
      await Promise.all(["serviceDate", "createdAt", "updatedAt"].map(async (field) => {
        const dateField = field === "serviceDate";
        const query = db.collection(collection).where(field, ">=", dateField ? period.from : start)
          .where(field, dateField ? "<=" : "<", dateField ? period.to : end)
          .select(...FIELDS).orderBy(field).limit(PAGE_SIZE);
        let cursor = null;
        while (true) {
          const snap = await (cursor ? query.startAfter(cursor) : query).get();
          snap.docs.forEach((doc) => rows.set(doc.id, { ...doc.data(), id: doc.id }));
          if (snap.size > MAX_ROWS || rows.size > MAX_ROWS) throw Object.assign(new Error("ข้อมูลมากเกิน 50,000 รายการ กรุณาเลือกช่วงวันที่ให้สั้นลง"), { status: 422 });
          if (snap.size < PAGE_SIZE) break;
          cursor = snap.docs[snap.docs.length - 1];
        }
      }));
      return [...rows.values()];
    };
    const [orders, reports] = await Promise.all([readCollection("orders"), readCollection("store_reports")]);
    return Response.json({ ok: true, orders, reports: reports.filter((row) => ["booking", "online"].includes(row.type) && isStoreReportVisibleToRole(row, profile.role, true)) });
  } catch (error) { return errorResponse(error); }
}

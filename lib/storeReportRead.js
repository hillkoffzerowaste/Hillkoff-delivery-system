// Server-side read of store booking/online reports (store_reports) for a Bangkok date range.
// Every report written since 2026-07-15 carries serviceDate, so one serviceDate range query covers a
// range. Only a range reaching back before SERVICE_DATE_SINCE also reads by createdAt, for the few
// reports from the first days of the system that may lack serviceDate. This halves the reads of the
// store dashboard and the daily / monthly reports compared with always reading both fields.
import { bangkokRangeIso } from "./storeFormat.js";

export const SERVICE_DATE_SINCE = "2026-07-16";
const TOO_MANY = "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง";

async function readCapped(query, cap) {
  const snap = await query.limit(cap + 1).get();
  if (snap.docs.length > cap) throw Object.assign(new Error(TOO_MANY), { status: 422 });
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

// fields: optional projection (select) so only what the report uses is transferred.
export async function readStoreReportsByDate(db, { from, to, cap, fields = null }) {
  const project = (query) => (fields ? query.select(...fields) : query);
  const byService = project(db.collection("store_reports").where("serviceDate", ">=", from).where("serviceDate", "<=", to).orderBy("serviceDate"));
  const reads = [readCapped(byService, cap)];
  if (from < SERVICE_DATE_SINCE) {
    const bounds = bangkokRangeIso(from, to);
    reads.push(readCapped(project(db.collection("store_reports").where("createdAt", ">=", bounds.start).where("createdAt", "<", bounds.endExclusive).orderBy("createdAt")), cap));
  }
  const rows = [...new Map((await Promise.all(reads)).flat().map((row) => [row.id, row])).values()];
  if (rows.length > cap) throw Object.assign(new Error(TOO_MANY), { status: 422 });
  return rows;
}

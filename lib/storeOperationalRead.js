import { DAILY_REPORT_LIMITS } from "./storeDailyReport.js";
import { bangkokRangeIso } from "./storeFormat.js";
import { readStoreRoster } from "./storeRoster.js";
import { readStoreCases } from "./storeCasesStore.js";
import { buildOperationalDashboard } from "./storeDashboard.js";

const overLimit = () => Object.assign(new Error("ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง"), { status: 422 });
async function read(query, cap) {
  const snapshot = await query.limit(cap + 1).get();
  if (snapshot.docs.length > cap) throw overLimit();
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}
function range(db, collection, field, from, to, exclusive = false) {
  return db.collection(collection).where(field, ">=", from).where(field, exclusive ? "<" : "<=", to).orderBy(field);
}

export async function readOperationalDashboard(db, { from, to }) {
  const bounds = bangkokRangeIso(from, to);
  const [roster, byCreated, byService, transfers, audits, cases] = await Promise.all([
    readStoreRoster(db),
    read(range(db, "store_reports", "createdAt", bounds.start, bounds.endExclusive, true), DAILY_REPORT_LIMITS.monthReports),
    read(range(db, "store_reports", "serviceDate", from, to), DAILY_REPORT_LIMITS.monthReports),
    read(range(db, "store_transfers", "serviceDate", from, to), DAILY_REPORT_LIMITS.monthTransfers),
    read(range(db, "store_audits", "serviceDate", from, to), DAILY_REPORT_LIMITS.monthAudits),
    readStoreCases(db)
  ]);
  const reports = [...new Map([...byCreated, ...byService].map((row) => [row.id, row])).values()];
  if (reports.length > DAILY_REPORT_LIMITS.monthReports) throw overLimit();
  return buildOperationalDashboard({ from, to, roster, reports, transfers, audits, cases });
}

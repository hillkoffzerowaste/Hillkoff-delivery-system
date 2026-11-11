import { CASE_COLLECTION, CASE_READ_LIMIT, mergeStoreCases } from "./storeCases.js";
const fail = () => Object.assign(new Error("ข้อมูลเคสเกินขีดจำกัด ไม่สามารถแสดงยอดครบทั้งหมด กรุณาติดต่อผู้ดูแล"), { status: 422 });
export async function readStoreCases(db) {
  const read = async (query) => {
    const snap = await query.limit(CASE_READ_LIMIT + 1).get();
    if (snap.docs.length > CASE_READ_LIMIT) throw fail();
    return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  };
  const [cases, transfers, byStatus, byPack, audits] = await Promise.all([
    read(db.collection(CASE_COLLECTION)),
    read(db.collection("store_transfers").where("receipt", "==", "incomplete")),
    read(db.collection("store_reports").where("status", "in", ["waiting", "partial"])),
    read(db.collection("store_reports").where("packStatus", "in", ["waiting", "partial", "returned"])),
    read(db.collection("store_audits").where("mismatch", ">", 0))
  ]);
  const reports = [...new Map([...byStatus, ...byPack].map((row) => [row.id, row])).values()];
  if (reports.length > CASE_READ_LIMIT) throw fail();
  return mergeStoreCases({ cases, transfers, reports, audits });
}

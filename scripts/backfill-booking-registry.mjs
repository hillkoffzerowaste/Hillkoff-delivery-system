// ซ่อมการจองเลขใบสั่งจองที่ค้างอยู่ใน booking_month_registry จากบัคสองตัว:
//   1) orders/workflow เคยเขียน source เป็น "order" เอกพจน์ ตัวอ่านจึงมองไม่เห็น เลยไม่ปล่อยคืนตอนลบออเดอร์
//   2) store_reports ไม่เคยลบการจองเลย ลบรายงาน/แก้เลขแล้วการจองค้างถาวร
//
// สคริปต์นี้ยังสร้าง sharedWithOrderIds ย้อนหลังจากข้อมูลจริงด้วย (ดูว่าออเดอร์ไหนยืมการจอง
// ของรายงานสโตร์อยู่) ทำให้เรกคอร์ดเก่าที่เดิม "พิสูจน์ไม่ได้ว่าไม่มีใครยืม" กลับปล่อยคืนได้ตามปกติ
//
// dry-run เป็นค่าเริ่มต้น ต้องใส่ --apply เองถึงจะเขียนจริง
import dotenv from "dotenv";
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { isOrderRegistrySource, normalizeBookingNumber } from "../lib/bookingRegistry.js";

dotenv.config({ path: ".env.local" });

const applyChanges = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");
const db = getAdminDb();

const counters = {
  registryScanned: 0,
  sourceNormalized: 0,
  sharedLinksReconstructed: 0,
  orphanDeletedOrderMissing: 0,
  orphanDeletedOrderDroppedNumber: 0,
  orphanDeletedReportMissing: 0,
  orphanDeletedReportDeleted: 0,
  orphanDeletedReportChangedNumber: 0,
  keptBecauseBorrowed: 0,
  keptUnknownSource: 0
};
const actions = [];

let pending = [];
function queue(kind, ref, patch) {
  pending.push({ kind, ref, patch });
  if (pending.length >= 400) return flush();
  return Promise.resolve();
}
async function flush() {
  if (!pending.length || !applyChanges) { pending = []; return; }
  const batch = db.batch();
  for (const write of pending) {
    if (write.kind === "delete") batch.delete(write.ref);
    else batch.set(write.ref, write.patch, { merge: true });
  }
  await batch.commit();
  pending = [];
}

function orderBookingNumbers(order) {
  const raw = Array.isArray(order.bookingNumbers) ? order.bookingNumbers : [order.bookingNumber];
  return new Set(raw.map(normalizeBookingNumber).filter(Boolean));
}

const [registrySnap, ordersSnap, reportsSnap] = await Promise.all([
  db.collection("booking_month_registry").get(),
  db.collection("orders").get(),
  db.collection("store_reports").get()
]);

const orders = new Map(ordersSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
const reports = new Map(reportsSnap.docs.map((doc) => [doc.id, doc.data() || {}]));

// ออเดอร์ไหนยืมการจองของรายงานสโตร์อยู่ คีย์เป็น `${reportId}__${BOOKING_NUMBER}`
const borrowers = new Map();
for (const [orderId, order] of orders) {
  const links = Array.isArray(order.storeBookingRegistryLinks) ? order.storeBookingRegistryLinks : [];
  for (const link of links) {
    const reportId = String(link?.reportId || "");
    const bookingNumber = normalizeBookingNumber(link?.bookingNumber);
    if (!reportId || !bookingNumber) continue;
    const key = `${reportId}__${bookingNumber}`;
    if (!borrowers.has(key)) borrowers.set(key, new Set());
    borrowers.get(key).add(orderId);
  }
}

for (const doc of registrySnap.docs) {
  counters.registryScanned += 1;
  const registry = doc.data() || {};
  const bookingNumber = normalizeBookingNumber(registry.bookingNumber);
  const sourceId = String(registry.sourceId || "");
  const rawSource = String(registry.source || "");

  if (isOrderRegistrySource(rawSource)) {
    const order = orders.get(sourceId);
    if (rawSource !== "orders") {
      await queue("set", doc.ref, { source: "orders" });
      counters.sourceNormalized += 1;
      actions.push({ id: doc.id, action: "normalize_source", from: rawSource });
    }
    if (!order) {
      await queue("delete", doc.ref, null);
      counters.orphanDeletedOrderMissing += 1;
      actions.push({ id: doc.id, action: "delete", reason: "owning order no longer exists", bookingNumber, sourceId });
      continue;
    }
    if (bookingNumber && !orderBookingNumbers(order).has(bookingNumber)) {
      await queue("delete", doc.ref, null);
      counters.orphanDeletedOrderDroppedNumber += 1;
      actions.push({ id: doc.id, action: "delete", reason: "owning order no longer lists this booking number", bookingNumber, sourceId });
    }
    continue;
  }

  if (rawSource === "store_reports") {
    const borrowedBy = [...(borrowers.get(`${sourceId}__${bookingNumber}`) || [])].sort();
    const existingShared = Array.isArray(registry.sharedWithOrderIds) ? [...registry.sharedWithOrderIds].map(String).sort() : null;
    const sharedChanged = !existingShared || existingShared.join("|") !== borrowedBy.join("|");
    if (sharedChanged) {
      await queue("set", doc.ref, { sharedWithOrderIds: borrowedBy });
      counters.sharedLinksReconstructed += 1;
      actions.push({ id: doc.id, action: "set_shared_with_order_ids", value: borrowedBy });
    }
    if (borrowedBy.length) {
      counters.keptBecauseBorrowed += 1;
      continue;
    }
    const report = reports.get(sourceId);
    if (!report) {
      await queue("delete", doc.ref, null);
      counters.orphanDeletedReportMissing += 1;
      actions.push({ id: doc.id, action: "delete", reason: "owning store report no longer exists", bookingNumber, sourceId });
      continue;
    }
    if (report.deletedAt) {
      await queue("delete", doc.ref, null);
      counters.orphanDeletedReportDeleted += 1;
      actions.push({ id: doc.id, action: "delete", reason: "owning store report was deleted", bookingNumber, sourceId });
      continue;
    }
    if (bookingNumber && normalizeBookingNumber(report.bookingNumber) !== bookingNumber) {
      await queue("delete", doc.ref, null);
      counters.orphanDeletedReportChangedNumber += 1;
      actions.push({ id: doc.id, action: "delete", reason: "owning store report now uses a different booking number", bookingNumber, sourceId });
    }
    continue;
  }

  counters.keptUnknownSource += 1;
  actions.push({ id: doc.id, action: "skip", reason: `unrecognised source "${rawSource}"`, bookingNumber, sourceId });
}

await flush();

const deletions = actions.filter((action) => action.action === "delete");
console.log(JSON.stringify({ mode: applyChanges ? "applied" : "dry-run", ...counters, totalDeletions: deletions.length }, null, 2));
if (verbose) console.log(JSON.stringify(actions, null, 2));
else if (deletions.length) console.log(`\nจะปล่อยเลขคืน ${deletions.length} รายการ (ใส่ --verbose เพื่อดูรายละเอียดทั้งหมด)`);
if (!applyChanges) console.log("\nนี่คือ dry-run ยังไม่มีการเขียนใดๆ ใส่ --apply เมื่อตรวจรายการข้างบนแล้ว");

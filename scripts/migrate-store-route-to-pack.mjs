// ย้ายออเดอร์ที่ค้างในคิวสโตร์ (workflowType "store_route") เข้าห้องแพ็คโดยตรง (direct_pack)
// เพราะสโตร์เลิกรับงานจัดเตรียมแล้ว: storeStatus -> "skipped", packStatus -> pending (หรือคง working/waiting)
// ออเดอร์ที่สโตร์ตรวจเสร็จแล้ว (checked/partial), เข้าคิวคนขับ/ส่งแล้ว, หรือห้องแพ็คตรวจเสร็จแล้วจะไม่ถูกแตะ
// ไม่ sync Google Sheet (ชีตอัปเดตเมื่อห้องแพ็คอัปเดตออเดอร์ครั้งถัดไป)
//
// ใช้: node scripts/migrate-store-route-to-pack.mjs [--apply] [--verbose] [--ids=A,B]
// dry-run เป็นค่าเริ่มต้น ต้องรัน dry-run ตรวจรายการก่อน แล้วใส่ --apply เองถึงจะเขียนจริง
import dotenv from "dotenv";
import { getAdminDb } from "../lib/firebaseAdmin.js";
import {
  buildStoreRouteToPackPatch,
  classifyStoreRouteOrderForMigration,
  diffPatch
} from "../lib/storeRouteMigration.js";

dotenv.config({ path: ".env.local" });

const applyChanges = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");
const idsArg = process.argv.find((arg) => arg.startsWith("--ids="));
const onlyIds = idsArg ? new Set(idsArg.slice("--ids=".length).split(",").map((id) => id.trim()).filter(Boolean)) : null;
const db = getAdminDb();

// query เดียวแบบ equality ใช้ automatic index ไม่ต้องมี composite index ที่เหลือกรองใน memory
const snap = await db.collection("orders").where("workflowType", "==", "store_route").get();
const docs = snap.docs.filter((doc) => !onlyIds || onlyIds.has(doc.id));

const eligible = [];
const skippedByReason = {};
const skipped = [];
for (const doc of docs) {
  const order = doc.data() || {};
  const { eligible: ok, reason } = classifyStoreRouteOrderForMigration(order);
  if (ok) eligible.push({ doc, order });
  else {
    skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
    skipped.push({ id: doc.id, reason });
  }
}

const counters = { applied: 0, skippedRace: 0, failed: 0 };
const failures = [];
const now = new Date().toISOString();

for (const { doc, order } of eligible) {
  const { patch, history } = buildStoreRouteToPackPatch(order, { now });
  console.log(JSON.stringify({
    id: doc.id,
    customerName: order.customerName || "",
    deliveryMethod: order.deliveryMethod || "",
    storeStatus: order.storeStatus || "pending",
    packStatus: order.packStatus || "",
    queueStatus: order.queueStatus || "",
    changes: diffPatch(order, patch)
  }));
  if (verbose) console.log(JSON.stringify({ id: doc.id, patch, history }, null, 2));
  if (!applyChanges) continue;

  try {
    const outcome = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists) return "race";
      const freshOrder = fresh.data() || {};
      // classify ซ้ำบนข้อมูลสด กันออเดอร์ที่เพิ่งเปลี่ยนสถานะระหว่างรันสคริปต์
      if (!classifyStoreRouteOrderForMigration(freshOrder).eligible) return "race";
      const freshPlan = buildStoreRouteToPackPatch(freshOrder, { now });
      tx.update(doc.ref, freshPlan.patch);
      tx.set(doc.ref.collection("activity").doc(), freshPlan.history);
      return "applied";
    });
    if (outcome === "applied") counters.applied += 1;
    else counters.skippedRace += 1;
  } catch (error) {
    counters.failed += 1;
    failures.push({ id: doc.id, error: error?.message || String(error) });
  }
}

console.log(JSON.stringify({
  mode: applyChanges ? "applied" : "dry-run",
  scanned: docs.length,
  eligible: eligible.length,
  skippedByReason,
  ...counters
}, null, 2));
if (skipped.length) console.log(`\nข้าม ${skipped.length} รายการ:\n${skipped.map((item) => `  ${item.id}  ${item.reason}`).join("\n")}`);
if (failures.length) console.error(JSON.stringify(failures, null, 2));
if (!applyChanges) console.log("\nนี่คือ dry-run ยังไม่มีการเขียนใดๆ ใส่ --apply เมื่อตรวจรายการข้างบนแล้ว");
if (counters.failed > 0) process.exitCode = 1;

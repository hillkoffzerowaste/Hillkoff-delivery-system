// สร้างสรุปรายวันของใบสั่งจอง/ใบขายออนไลน์ (store_report_daily_stats) ย้อนหลัง
// เพื่อให้แดชบอร์ดช่วงหลายเดือน/ทั้งปีอ่านสรุปวันละ 1 เอกสาร แทนการอ่านใบทุกใบ
// ถ้าไม่รันสคริปต์นี้ ระบบก็สร้างให้เองตอนมีคนเปิดช่วงยาวครั้งแรก แต่ครั้งแรกจะช้า
//
// dry-run เป็นค่าเริ่มต้น ต้องใส่ --apply เองถึงจะเขียนจริง
// ใช้: node scripts/backfill-store-report-stats.mjs [--from=2026-07-01] [--apply]
import dotenv from "dotenv";
import { getAdminDb } from "../lib/firebaseAdmin.js";
import { addDaysToDateKey, bangkokRangeIso } from "../lib/storeFormat.js";
import { bangkokDateOfReport } from "../lib/storeReportStats.js";
import { REPORT_STATS_COLLECTION, liveWindowStart, readReportDayStats } from "../lib/storeReportStatsStore.js";

dotenv.config({ path: ".env.local" });

const applyChanges = process.argv.includes("--apply");
const fromArg = process.argv.find((arg) => arg.startsWith("--from="))?.slice(7);
const db = getAdminDb();

const today = bangkokDateOfReport(new Date().toISOString());
const liveStart = liveWindowStart(today);
const to = addDaysToDateKey(liveStart, -1);
const first = await db.collection("store_reports").orderBy("createdAt").select("createdAt").limit(1).get();
const from = fromArg || bangkokDateOfReport(first.docs[0]?.data().createdAt);

if (!from || from > to) {
  console.log("ไม่มีวันที่เก่ากว่าช่วงข้อมูลสด ไม่ต้องสร้างสรุป");
  process.exit(0);
}

const existing = await db.collection(REPORT_STATS_COLLECTION).where("date", ">=", from).where("date", "<=", to).get();
const bounds = bangkokRangeIso(from, to);
const reportCount = (await db.collection("store_reports").where("createdAt", ">=", bounds.start).where("createdAt", "<", bounds.endExclusive).count().get()).data().count;
console.log(`ช่วง ${from} ถึง ${to} · ใบในช่วง ${reportCount} ใบ · มีสรุปอยู่แล้ว ${existing.size} วัน · ช่วงข้อมูลสดเริ่ม ${liveStart}`);

if (!applyChanges) {
  console.log("dry-run: ยังไม่ได้เขียนข้อมูล ใส่ --apply เพื่อสร้างสรุปจริง");
  process.exit(0);
}

const days = await readReportDayStats(db, from, to, { liveStart });
const totals = days.reduce((sum, day) => ({ booking: sum.booking + day.booking, online: sum.online + day.online }), { booking: 0, online: 0 });
console.log(`สร้าง/ตรวจสรุปแล้ว ${days.length} วัน · ใบสั่งจอง ${totals.booking} · ใบขายออนไลน์ ${totals.online}`);

// Server-side store for per-day report summaries (store_report_daily_stats/{YYYY-MM-DD}).
// Days inside the live window are always computed from reports; only older days are stored.
// Freshness: every report write stamps updatedAt, so each read looks for reports changed since the
// last check (_meta.checkedThrough) and recomputes their days before answering.
import { addDaysToDateKey, bangkokRangeIso } from "./storeFormat.js";
import { REPORT_STATS_LIVE_DAYS, bangkokDateOfReport, fromStoredDay, summarizeReportDays, toStoredDay } from "./storeReportStats.js";

export const REPORT_STATS_COLLECTION = "store_report_daily_stats";
const META_ID = "_meta";
const CHANGE_LIMIT = 5000;
const REBUILD_LIMIT = 30000;
const BATCH_SIZE = 400;
export const REPORT_STATS_FIELDS = ["type", "status", "packStatus", "createdAt", "deletedAt", "workflowHistory", "confirmedAt", "storeCheckerName"];

export const liveWindowStart = (today) => addDaysToDateKey(today, -(REPORT_STATS_LIVE_DAYS - 1));

function datesBetween(from, to) {
  const dates = [];
  for (let date = from; date && date <= to; date = addDaysToDateKey(date, 1)) dates.push(date);
  return dates;
}

async function writeAll(db, writes) {
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

// Summaries for every date in [from, to]; the range must end before the live window (liveStart).
export async function readReportDayStats(db, from, to, { liveStart, now = new Date() } = {}) {
  if (!from || !to || from > to) return [];
  const startedAt = now.toISOString();
  const stats = db.collection(REPORT_STATS_COLLECTION);
  const metaRef = stats.doc(META_ID);
  const [metaSnap, storedSnap] = await Promise.all([
    metaRef.get(),
    stats.where("date", ">=", from).where("date", "<=", to).orderBy("date").get()
  ]);
  const meta = metaSnap.exists ? metaSnap.data() || {} : {};
  let validFrom = String(meta.validFrom || "");
  const stored = new Map(storedSnap.docs.map((doc) => doc.data()).filter((doc) => doc.date && !doc.stale).map((doc) => [doc.date, doc]));

  const changedDates = new Set();
  if (meta.checkedThrough) {
    const changed = await db.collection("store_reports").where("updatedAt", ">", String(meta.checkedThrough)).orderBy("updatedAt").select("createdAt").limit(CHANGE_LIMIT + 1).get();
    // Too many edits to track one by one: treat every stored day as stale from now on.
    if (changed.docs.length > CHANGE_LIMIT) validFrom = startedAt;
    else changed.docs.forEach((doc) => { const date = bangkokDateOfReport(doc.data().createdAt); if (date && (!liveStart || date < liveStart)) changedDates.add(date); });
  }

  const dates = datesBetween(from, to);
  const fresh = (date) => stored.has(date) && !changedDates.has(date) && String(stored.get(date).computedAt || "") >= validFrom;
  const missing = dates.filter((date) => !fresh(date));
  const writes = [];
  if (missing.length) {
    const bounds = bangkokRangeIso(missing[0], missing[missing.length - 1]);
    const snap = await db.collection("store_reports").where("createdAt", ">=", bounds.start).where("createdAt", "<", bounds.endExclusive).orderBy("createdAt").select(...REPORT_STATS_FIELDS).limit(REBUILD_LIMIT + 1).get();
    if (snap.docs.length > REBUILD_LIMIT) throw Object.assign(new Error("ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง"), { status: 422 });
    summarizeReportDays(snap.docs.map((doc) => doc.data()), missing).forEach((day) => {
      const data = { ...toStoredDay(day), computedAt: startedAt, stale: false };
      stored.set(day.date, data);
      writes.push({ ref: stats.doc(day.date), data });
    });
  }
  // Days outside this range that changed are flagged so whichever request needs them next rebuilds them.
  changedDates.forEach((date) => { if (date < from || date > to) writes.push({ ref: stats.doc(date), data: { stale: true } }); });
  writes.push({ ref: metaRef, data: { checkedThrough: startedAt, validFrom } });
  await writeAll(db, writes);
  return dates.map((date) => fromStoredDay(stored.get(date)));
}

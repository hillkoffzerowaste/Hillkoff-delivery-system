// Pure builders for the store daily report (per-person attribution + LINE text). No Firebase imports.
import { addDaysToDateKey, bangkokTimeHHmm, fmt, pct, thaiDateLabel, thaiMonthLabel } from "./storeFormat.js";
import { publicWorkLog, sortWorkLogs, workLogAt, workLogBody, workLogLine } from "./storeWorkLog.js";
import { dutyText, resolveDuty } from "./storeDuty.js";

export const DAILY_REPORT_LIMITS = {
  reports: 1500,
  orders: 800,
  transfers: 1000,
  audits: 1000,
  monthReports: 6000,
  monthTransfers: 3000,
  monthAudits: 3000,
  openIssues: 200
};

// UI maps these names to CSS classes; colours live in the component stylesheet only.
export const TIMELINE_TAGS = {
  booking: "ใบสั่งจอง",
  online: "ใบขายออนไลน์",
  transfer: "ใบโอน",
  transferIncomplete: "ใบโอนไม่ครบ",
  audit: "Audit",
  resolved: "แก้ไขปัญหา",
  orderCheck: "ตรวจออเดอร์",
  log: "บันทึกงาน"
};

const ORDER_CHECK_ACTIONS = ["store_update", "store_booking_update"];
const ORDER_STATUS_LABELS = {
  pending: "รอรับงาน",
  blocked: "รอสโตร์ตรวจ",
  working: "กำลังดำเนินการ",
  waiting: "รอสินค้า",
  partial: "สินค้าไม่ครบ",
  returned: "ส่งกลับตรวจสอบ",
  checked: "ตรวจครบแล้ว",
  skipped: "ไม่ผ่านขั้นตอนนี้"
};
const OPEN_ISSUES_LIMIT = 20;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export const jobsOf = (p) => p.booking + p.online + p.transfer + p.auditDocs;
export const hoursOf = (p) => (p.start ? p.start + "–" + p.end + " น." : "ไม่มีงาน");

export function sumDay(rows) {
  return rows.reduce((a, p) => ({
    booking: a.booking + p.booking,
    online: a.online + p.online,
    transfer: a.transfer + p.transfer,
    issues: a.issues + p.issues,
    resolved: a.resolved + p.resolved,
    openIssues: a.openIssues + p.openIssues,
    auditDocs: a.auditDocs + p.auditDocs,
    auditItems: a.auditItems + p.auditItems,
    mismatch: a.mismatch + p.mismatch,
    people: a.people + (jobsOf(p) > 0 || p.logCount > 0 ? 1 : 0)
  }), { booking: 0, online: 0, transfer: 0, issues: 0, resolved: 0, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, people: 0 });
}

const text = (value) => String(value ?? "").trim();
const count = (value) => Math.max(0, Number(value) || 0);
const millis = (iso) => Date.parse(iso);

export function bangkokDateOf(iso) {
  const ms = millis(iso);
  return Number.isFinite(ms) ? new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 10) : "";
}

const reportDate = (report) => text(report.serviceDate) || bangkokDateOf(report.createdAt);
const resolvedDate = (transfer) => text(transfer.resolvedServiceDate) || bangkokDateOf(transfer.resolution?.at);
const isCountedReport = (report) => !report.deletedAt && Boolean(report.confirmedAt) && ["booking", "online"].includes(report.type);
const isLive = (doc) => doc && !doc.deletedAt;

function uniqueDocs(...lists) {
  const seen = new Map();
  lists.forEach((list) => (list || []).forEach((doc) => {
    if (!doc) return;
    const key = doc.id ?? doc;
    if (!seen.has(key)) seen.set(key, doc);
  }));
  return [...seen.values()];
}

export function groupReportRuns(rows, { gapMinutes = 30 } = {}) {
  const gapMs = gapMinutes * 60000;
  const sorted = (rows || []).filter((row) => Number.isFinite(millis(row.createdAt))).sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
  const runs = [];
  const open = new Map();
  sorted.forEach((row) => {
    const ms = millis(row.createdAt);
    const number = text(row.bookingNumber);
    const current = open.get(row.type);
    if (current && ms - current.lastMs <= gapMs) {
      current.run.count += 1;
      if (number) current.run.numbers.push(number);
      current.lastMs = ms;
      return;
    }
    const run = { type: row.type, at: row.createdAt, count: 1, numbers: number ? [number] : [] };
    runs.push(run);
    open.set(row.type, { run, lastMs: ms });
  });
  return runs;
}

function runText(run) {
  const { numbers } = run;
  const range = numbers.length > 1 ? ` (${numbers[0]} ถึง ${numbers[numbers.length - 1]})` : numbers.length === 1 ? ` (${numbers[0]})` : "";
  return `บันทึก ${run.count} ใบ${range}`;
}

function newBucket(uid) {
  return { uid, name: "", reports: [], transfers: [], resolved: [], audits: [], orderChecks: [], logs: [] };
}

const genericName = (name) => !text(name) || text(name).toLowerCase() === "store";
const realRoster = (roster) => (roster || []).filter((member) => !genericName(member.name));

// Store checker names were first recorded on 18 Jul 2569 (b63ca92); reports confirmed before that only carry the shared "store" account.
const CHECKER_NAME_SINCE = "2026-07-18";
const isLegacyUnnamed = (report) => genericName(report.storeCheckerName) && reportDate(report) <= CHECKER_NAME_SINCE;
const legacyCounts = (reports) => ({
  legacyBooking: reports.filter((r) => r.type === "booking" && isLegacyUnnamed(r)).length,
  legacyOnline: reports.filter((r) => r.type === "online" && isLegacyUnnamed(r)).length
});

function identityResolver(roster) {
  const members = realRoster(roster);
  return {
    byName(name) {
      const value = text(name);
      if (genericName(value)) return null;
      const matches = members.filter((member) => text(member.name) === value);
      if (matches.length > 1) return null;
      return matches.length ? { uid: matches[0].uid, name: matches[0].name } : { uid: `name:${value}`, name: value };
    },
    byActor(uid, name) {
      const member = members.find((person) => person.uid === text(uid));
      if (member) return { uid: member.uid, name: member.name };
      return genericName(name) ? null : { uid: text(uid) || `name:${text(name)}`, name: text(name) };
    }
  };
}

function collectDay(date, { reports, transfers, resolved, audits, orders, workLogs = [] }, roster) {
  const buckets = new Map();
  const identity = identityResolver(roster);
  const bucket = (who) => {
    const key = who?.uid || "";
    if (!buckets.has(key)) buckets.set(key, newBucket(key));
    const item = buckets.get(key);
    if (!item.name && text(who?.name)) item.name = text(who.name);
    return item;
  };
  reports.filter((r) => isCountedReport(r) && reportDate(r) === date).forEach((r) => bucket(identity.byName(r.storeCheckerName)).reports.push(r));
  transfers.filter((t) => isLive(t) && text(t.serviceDate) === date).forEach((t) => bucket(identity.byActor(t.preparerUid, t.preparerName)).transfers.push(t));
  resolved.filter((t) => isLive(t) && t.resolution && resolvedDate(t) === date).forEach((t) => bucket(identity.byActor(t.resolution.byUid, t.resolution.byName)).resolved.push(t));
  audits.filter((a) => isLive(a) && text(a.serviceDate) === date).forEach((a) => bucket(a.checkerName ? identity.byName(a.checkerName) : identity.byActor(a.createdByUid, a.createdBy)).audits.push(a));
  orders.forEach((order) => (Array.isArray(order.workflowHistory) ? order.workflowHistory : []).forEach((event) => {
    if (event?.role !== "store" || !ORDER_CHECK_ACTIONS.includes(event.action) || bangkokDateOf(event.at) !== date) return;
    const checker = event.storeCheckerName || event.checkerName;
    bucket(checker ? identity.byName(checker) : identity.byActor(event.uid, event.name)).orderChecks.push({ at: event.at, order });
  }));
  workLogs.filter((log) => isLive(log) && text(log.date) === date).forEach((log) => bucket(identity.byActor(log.staffId, log.staffName)).logs.push(log));
  return buckets;
}

function transferRoute(t) {
  return `${text(t.transferNumber)} ${text(t.fromBranchName)} → ${text(t.toBranchName)}`;
}

function buildTimeline(b) {
  const events = [];
  groupReportRuns(b.reports).forEach((run) => events.push({ at: run.at, tag: run.type === "online" ? TIMELINE_TAGS.online : TIMELINE_TAGS.booking, text: runText(run) }));
  b.transfers.forEach((t) => {
    if (t.receipt === "incomplete") {
      const resolver = t.issueState === "resolved" && t.resolution ? ` (${text(t.resolution.byName)} แก้ไขแล้ว)` : "";
      events.push({ at: t.createdAt, tag: TIMELINE_TAGS.transferIncomplete, text: `${transferRoute(t)} · ${text(t.note)}${resolver}` });
    } else {
      events.push({ at: t.createdAt, tag: TIMELINE_TAGS.transfer, text: `${transferRoute(t)} · สินค้าครบ` });
    }
  });
  b.resolved.forEach((t) => events.push({ at: t.resolution.at, tag: TIMELINE_TAGS.resolved, text: `${text(t.transferNumber)} ${text(t.resolution.text)}` }));
  b.audits.forEach((a) => {
    const zone = text(a.zone) ? ` ${text(a.zone)}` : "";
    const mismatch = count(a.mismatch);
    events.push({ at: a.createdAt, tag: TIMELINE_TAGS.audit, text: `${text(a.documentNumber)} ${text(a.branchName)}${zone} · ตรวจนับ ${count(a.total)} รายการ · ${mismatch ? `ไม่ตรง ${mismatch}` : "ตรงทั้งหมด"}` });
  });
  b.orderChecks.forEach(({ at, order }) => {
    const status = ORDER_STATUS_LABELS[order.storeStatus] || text(order.storeStatus) || "ยังไม่ระบุ";
    events.push({ at, tag: TIMELINE_TAGS.orderCheck, text: `${text(order.customerName) || order.id} · ${status}` });
  });
  b.logs.forEach((log) => events.push({ at: workLogAt(log), tag: TIMELINE_TAGS.log, text: workLogBody(log) }));
  return events
    .map((event, index) => ({ ...event, index, ms: millis(event.at) }))
    .filter((event) => Number.isFinite(event.ms))
    .sort((a, b) => a.ms - b.ms || a.index - b.index)
    .map((event) => [bangkokTimeHHmm(event.at), event.tag, event.text]);
}

function workTimes(b) {
  const times = [
    ...b.reports.map((r) => r.createdAt),
    ...b.transfers.map((t) => t.createdAt),
    ...b.resolved.map((t) => t.resolution.at),
    ...b.audits.map((a) => a.createdAt),
    ...b.orderChecks.map((o) => o.at)
  ].map(millis).filter(Number.isFinite);
  if (!times.length) return { start: "", end: "" };
  return { start: bangkokTimeHHmm(new Date(Math.min(...times)).toISOString()), end: bangkokTimeHHmm(new Date(Math.max(...times)).toISOString()) };
}

function personDayFrom(b, name) {
  const items = b.audits.reduce((sum, a) => sum + count(a.total), 0);
  const mismatch = b.audits.reduce((sum, a) => sum + count(a.mismatch), 0);
  return {
    uid: b.uid,
    name: name || b.name || b.uid,
    booking: b.reports.filter((r) => r.type === "booking").length,
    online: b.reports.filter((r) => r.type === "online").length,
    transfer: b.transfers.length,
    issues: b.transfers.filter((t) => t.receipt === "incomplete").length,
    resolved: b.resolved.length,
    openIssues: b.transfers.filter((t) => t.issueState === "open").length,
    auditDocs: b.audits.length,
    auditItems: items,
    mismatch,
    orderChecks: b.orderChecks.length,
    logCount: b.logs.length,
    logs: sortWorkLogs(b.logs).map(publicWorkLog),
    ...workTimes(b),
    timeline: buildTimeline(b)
  };
}

const hasWork = (b) => b.reports.length || b.transfers.length || b.resolved.length || b.audits.length || b.orderChecks.length || b.logs.length;

function peopleForDay(date, roster, source) {
  const members = realRoster(roster);
  const buckets = collectDay(date, source, roster);
  const people = members.map((member) => personDayFrom(buckets.get(member.uid) || newBucket(member.uid), member.name));
  const known = new Set(members.map((member) => member.uid));
  buckets.forEach((b, uid) => { if (uid && !known.has(uid) && hasWork(b)) people.push(personDayFrom(b)); });
  const unknown = buckets.get("") || newBucket("");
  return { people, unattributed: { ...personDayFrom(unknown), ...legacyCounts(unknown.reports) } };
}

function listOpenIssues(openTransfers, date) {
  return (openTransfers || [])
    .filter((t) => isLive(t) && t.issueState === "open" && text(t.serviceDate) <= date)
    .map((t) => ({ t, ms: millis(t.createdAt) }))
    .sort((a, b) => text(a.t.serviceDate).localeCompare(text(b.t.serviceDate)) || (a.ms - b.ms) || 0)
    .slice(0, OPEN_ISSUES_LIMIT)
    .map(({ t }) => ({ no: text(t.transferNumber), note: text(t.note), owner: text(t.preparerName) }));
}

export function buildDailyReport({ date, today, roster, reports, orders, transfersCreated, transfersResolved, openTransfers, audits, weekReports, weekTransfers, weekAudits, workLogs, staffRoles, duties }) {
  const source = {
    reports: uniqueDocs(reports, weekReports),
    transfers: uniqueDocs(transfersCreated, weekTransfers),
    resolved: uniqueDocs(transfersResolved, weekTransfers, transfersCreated),
    audits: uniqueDocs(audits, weekAudits),
    orders: orders || [],
    workLogs: workLogs || []
  };
  const day = peopleForDay(date, roster, source);
  const people = day.people.map((p) => ({ ...p, duty: resolveDuty(p.uid, staffRoles, (duties || []).filter((item) => item.date === date)) }));
  const { unattributed } = day;
  const weekSource = { ...source, orders: [] };
  const week = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(date, index - 6)).map((day) => {
    const byUid = {};
    peopleForDay(day, roster, weekSource).people.filter((p) => jobsOf(p) || p.resolved || p.logCount).forEach((p) => {
      byUid[p.uid] = { booking: p.booking, online: p.online, transfer: p.transfer, auditItems: p.auditItems, jobs: jobsOf(p), logs: p.logCount, start: p.start, end: p.end };
    });
    return { date: day, byUid };
  });
  const team = sumDay([...people, unattributed]);
  team.people = sumDay(people).people;
  return { date, isToday: date === today, people, team, unattributed, openIssues: listOpenIssues(openTransfers, date), week };
}

export function buildMonthReport({ month, endDay, roster, reports, transfers, audits, workLogs }) {
  const lastDate = endDay ? `${month}-${String(endDay).padStart(2, "0")}` : `${month}-31`;
  const { people, unattributed } = buildRangeReport({ from: `${month}-01`, to: lastDate, roster, reports, transfers, audits, workLogs });
  return { month, endDay: endDay || null, rangeLabel: thaiMonthLabel(month, { endDay }), people, unattributed };
}

// Per-person totals over any date range (month report, multi-month dashboard). Dates are Bangkok date keys, inclusive.
export function buildRangeReport({ from, to, roster, reports, transfers, audits, workLogs }) {
  const inRange = (date) => Boolean(date) && date >= from && date <= to;
  const totals = new Map();
  const identity = identityResolver(roster);
  const total = (who) => {
    const key = who?.uid || "";
    if (!totals.has(key)) totals.set(key, { uid: key, name: "", booking: 0, online: 0, transfer: 0, issues: 0, resolved: 0, auditDocs: 0, auditItems: 0, mismatch: 0, logs: 0, dates: new Set() });
    const item = totals.get(key);
    if (!item.name && text(who?.name)) item.name = text(who.name);
    return item;
  };
  const rangeReports = (reports || []).filter((r) => isCountedReport(r) && inRange(reportDate(r)));
  rangeReports.forEach((r) => {
    const item = total(identity.byName(r.storeCheckerName));
    item[r.type] += 1;
    item.dates.add(reportDate(r));
  });
  (transfers || []).filter((t) => isLive(t) && inRange(text(t.serviceDate))).forEach((t) => {
    const item = total(identity.byActor(t.preparerUid, t.preparerName));
    item.transfer += 1;
    if (t.receipt === "incomplete") {
      item.issues += 1;
      if (t.issueState === "resolved") item.resolved += 1;
    }
    item.dates.add(text(t.serviceDate));
  });
  (audits || []).filter((a) => isLive(a) && inRange(text(a.serviceDate))).forEach((a) => {
    const item = total(a.checkerName ? identity.byName(a.checkerName) : identity.byActor(a.createdByUid, a.createdBy));
    item.auditDocs += 1;
    item.auditItems += count(a.total);
    item.mismatch += count(a.mismatch);
    item.dates.add(text(a.serviceDate));
  });
  (workLogs || []).filter((log) => isLive(log) && inRange(text(log.date))).forEach((log) => {
    const item = total(identity.byActor(log.staffId, log.staffName));
    item.logs += 1;
    item.dates.add(text(log.date));
  });
  const toRow = (item, name) => ({
    uid: item.uid, name: name || item.name || item.uid, days: item.dates.size, booking: item.booking, online: item.online, transfer: item.transfer,
    issues: item.issues, resolved: item.resolved, auditDocs: item.auditDocs, auditItems: item.auditItems, mismatch: item.mismatch, logs: item.logs
  });
  const members = realRoster(roster);
  const known = new Set(members.map((member) => member.uid));
  const people = members.map((member) => toRow(totals.get(member.uid) || total(member), member.name));
  totals.forEach((item, uid) => { if (uid && !known.has(uid) && item.dates.size) people.push(toRow(item)); });
  const unattributed = { ...toRow(totals.get("") || total(null)), ...legacyCounts(rangeReports.filter((r) => !identity.byName(r.storeCheckerName))) };
  return { people, unattributed };
}

export function unattributedText(item) {
  if (!item) return "";
  const labels = [["booking", "ใบสั่งจอง"], ["online", "ใบขายออนไลน์"], ["transfer", "ใบโอน"], ["auditDocs", "Audit"], ["resolved", "แก้ไขปัญหา"], ["orderChecks", "ตรวจออเดอร์"]];
  const partsOf = (source) => labels.filter(([key]) => source[key]).map(([key, label]) => `${label} ${fmt(source[key])}`);
  const legacy = { booking: Math.min(count(item.legacyBooking), count(item.booking)), online: Math.min(count(item.legacyOnline), count(item.online)) };
  const rest = { ...item, booking: count(item.booking) - legacy.booking, online: count(item.online) - legacy.online };
  const notes = [];
  if (partsOf(legacy).length) notes.push(`หมายเหตุ: ${partsOf(legacy).join(" · ")} ไม่มีชื่อผู้ตรวจ เพราะระบบเดิมก่อนอัปเกรด 18 ก.ค. 2569 บันทึกด้วยบัญชีกลาง store และยังไม่มีให้เลือกชื่อ จึงแยกรายบุคคลไม่ได้ · ปัจจุบันแก้ไขแล้ว ต้องเลือกชื่อผู้ตรวจทุกครั้งก่อนยืนยัน`);
  if (partsOf(rest).length) notes.push(`หมายเหตุ: ไม่ระบุชื่อหรือชื่อซ้ำจนแยกบุคคลไม่ได้ · ${partsOf(rest).join(" · ")}`);
  return notes.join("\n");
}

export function teamText({ dateKey, rows, openIssues = [], unattributed, storeLabel = "สโตร์ WH" }) {
  const t = sumDay(unattributed ? [...rows, unattributed] : rows);
  t.people = sumDay(rows).people;
  const lines = ["📋 รายงานการขับเคลื่อนประจำวัน · " + storeLabel, "วันที่ " + thaiDateLabel(dateKey), ""];
  if (!t.people && !jobsOf(t) && !t.resolved && !unattributed?.orderChecks) return lines.concat(["วันหยุด · ไม่มีการบันทึกงาน"]).join("\n");
  lines.push(
    "ภาพรวมทีม",
    "• งานรวม " + fmt(jobsOf(t)) + " รายการ จาก " + t.people + " คน",
    "• ใบสั่งจอง " + t.booking + " ใบ · ใบขายออนไลน์ " + t.online + " ใบ",
    "• ใบโอนสินค้า " + t.transfer + " ใบ (ไม่ครบ " + t.issues + " · แก้ไขแล้ว " + t.resolved + " · ค้าง " + t.openIssues + ")",
    "• Internal Audit " + t.auditDocs + " เอกสาร · ตรวจนับ " + fmt(t.auditItems) + " รายการ · ตรง " + pct(t.auditItems - t.mismatch, t.auditItems),
    "",
    "รายบุคคล"
  );
  rows.forEach((p, i) => {
    lines.push((i + 1) + ") " + p.name + (dutyText(p.duty) ? " (" + dutyText(p.duty) + ")" : "") + " · " + jobsOf(p) + " งาน · " + hoursOf(p));
    lines.push("   ใบสั่งจอง " + p.booking + " · ออนไลน์ " + p.online + " · ใบโอน " + p.transfer + " · Audit " + p.auditDocs + " (" + fmt(p.auditItems) + " รายการ)");
    (p.logs || []).forEach((log) => lines.push("   • " + workLogLine(log)));
  });
  if (unattributedText(unattributed)) lines.push("", unattributedText(unattributed));
  lines.push("", "งานค้างติดตาม");
  if (!openIssues.length) lines.push("• ไม่มี");
  openIssues.forEach((o) => lines.push("• " + o.no + " " + o.note + " (" + o.owner + ")"));
  return lines.join("\n");
}

export function personText({ dateKey, person, storeLabel = "สโตร์ WH" }) {
  const p = person;
  const lines = ["📋 รายงานประจำวันรายบุคคล · " + storeLabel, p.name + " · " + thaiDateLabel(dateKey)];
  if (dutyText(p.duty)) lines.push((p.duty.today ? "หน้าที่วันนี้ " : "ตำแหน่ง ") + dutyText(p.duty));
  lines.push("");
  if (!jobsOf(p) && !p.resolved && !p.logCount) return lines.concat(["ไม่มีการบันทึกงาน"]).join("\n");
  lines.push(
    "ช่วงเวลาเอกสารในระบบ " + hoursOf(p),
    "• งานรวม " + jobsOf(p) + " รายการ",
    "• ใบสั่งจอง " + p.booking + " · ใบขายออนไลน์ " + p.online,
    "• ใบโอนที่จัด " + p.transfer + " (ไม่ครบ " + p.issues + " · ค้าง " + p.openIssues + ") · แก้ไขปัญหา " + p.resolved + " ครั้ง",
    "• Audit " + p.auditDocs + " เอกสาร · " + fmt(p.auditItems) + " รายการ · ตรง " + pct(p.auditItems - p.mismatch, p.auditItems)
  );
  if (p.logCount) lines.push("• บันทึกงานประจำวัน " + p.logCount + " รายการ (ทำอะไร ที่ไหน อย่างไร อยู่ในไทม์ไลน์)");
  // Store-side order checks stay in the on-screen timeline only (plan Q1).
  const timeline = p.timeline.filter(([, tag]) => tag !== TIMELINE_TAGS.orderCheck);
  if (timeline.length) {
    lines.push("", "ไทม์ไลน์");
    timeline.forEach(([time, tag, body]) => lines.push(time + " " + tag + " · " + body));
  }
  return lines.join("\n");
}

export function monthText({ rangeLabel, rows, unattributed, storeLabel = "สโตร์ WH" }) {
  const lines = ["📋 สรุปผลรายเดือน · " + storeLabel, rangeLabel, ""];
  rows.forEach((m, i) => {
    const jobs = jobsOf(m);
    const average = m.days === 0 ? "0.0" : (jobs / m.days).toFixed(1);
    lines.push((i + 1) + ") " + m.name + " · " + m.days + " วัน · งานรวม " + fmt(jobs) + " (เฉลี่ย " + average + "/วัน)");
    lines.push("   ใบสั่งจอง " + m.booking + " · ออนไลน์ " + m.online + " · ใบโอน " + m.transfer + " · Audit " + m.auditDocs + (m.logs ? " · บันทึกงาน " + m.logs : ""));
    lines.push("   ใบโอนครบ " + pct(m.transfer - m.issues, m.transfer) + " · ปิดปัญหา " + m.resolved + "/" + m.issues + " · ตรวจนับตรง " + pct(m.auditItems - m.mismatch, m.auditItems));
  });
  if (unattributedText(unattributed)) lines.push("", unattributedText(unattributed));
  return lines.join("\n");
}

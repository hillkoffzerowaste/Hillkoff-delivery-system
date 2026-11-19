// Pure aggregation for the store warehouse dashboard (หน้ารายงานแดชบอร์ดสโตร์แบบใหม่).
// Turns live store data (transfers, audits, booking/online reports, case register, staff) into
// per-branch figures. No firebase here so the route, the panel and tests share one set of rules.
import { bangkokDateOf, buildRangeReport } from "./storeDailyReport.js";
import { isOpenCase, remainingOf } from "./storeCases.js";
import { isClosedByStore } from "./storeReportStats.js";
import { customRange } from "./storeOverview.js";
import { BRANCH_CODE_ALIASES } from "./storeClaimsProduction.js";

// Audit KPI passes when at least this share of counted items matched (percent).
export const AUDIT_PASS_PERCENT = 95;
// Transfer error rate above this (percent) is shown as a warning.
export const TRANSFER_WARN_PERCENT = 2;
export const UNKNOWN_BRANCH = "ไม่ระบุ";
// Longest range the dashboard reads in one go (about one quarter); longer ranges belong to the overview report.
export const WAREHOUSE_MAX_DAYS = 92;
// Booking/online documents have no branch: their cases are store-level, like the work itself.
const STORE_LEVEL_SOURCES = ["booking", "online"];

const text = (value) => String(value ?? "").trim();
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const live = (row) => Boolean(row) && !row.deletedAt;
const reportDate = (row) => text(row.serviceDate) || bangkokDateOf(row.createdAt);

export function percent(part, whole, digits = 1) {
  if (!(whole > 0)) return null;
  return Number(((part / whole) * 100).toFixed(digits));
}

function daysBetween(fromKey, toKey) {
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
}

function emptyBranch(code) {
  return {
    code,
    transfers: { total: 0, items: 0, incomplete: 0, open: 0, resolved: 0, daily: [], dailyIncomplete: [], errors: [], staff: [], received: 0, receivedIncomplete: 0 },
    audits: { rows: [], docs: 0, total: 0, match: 0, mismatch: 0, accuracy: null, pass: false },
    cases: { open: 0, shortageLines: 0 },
    claims: { docs: 0, qty: 0, amount: 0, rows: [] },
    production: { records: 0, sku: 0, qty: 0, sold: 0, soldKnown: false, items: [] }
  };
}

function summarizeTransfers(transfers, dates, branchOf) {
  const index = new Map(dates.map((date, i) => [date, i]));
  const staff = new Map();
  transfers.filter(live).forEach((row) => {
    const i = index.get(text(row.serviceDate));
    if (i === undefined) return;
    const source = branchOf(row.fromBranchCode);
    const t = source.transfers;
    t.total += 1;
    t.items += num(row.itemCount);
    t.daily[i] += 1;
    const destination = branchOf(row.toBranchCode);
    destination.transfers.received += 1;
    if (row.receipt !== "incomplete") return;
    t.incomplete += 1;
    t.dailyIncomplete[i] += 1;
    destination.transfers.receivedIncomplete += 1;
    if (row.issueState === "resolved") t.resolved += 1; else t.open += 1;
    t.errors.push({
      id: row.id || "",
      date: text(row.serviceDate),
      number: text(row.transferNumber),
      to: destination.code,
      toName: text(row.toBranchName),
      items: row.itemCount == null ? null : num(row.itemCount),
      preparer: text(row.preparerName) || text(row.createdBy) || "ไม่ทราบผู้จัด",
      note: text(row.note),
      state: row.issueState === "resolved" ? "resolved" : "open",
      resolution: text(row.resolution?.text)
    });
    const key = `${source.code}::${row.preparerUid || row.preparerName || ""}`;
    const person = staff.get(key) || { key, branch: source.code, name: text(row.preparerName) || text(row.createdBy) || "ไม่ทราบผู้จัด", docs: 0, items: 0 };
    person.docs += 1;
    person.items += num(row.itemCount);
    staff.set(key, person);
  });
  staff.forEach((person) => branchOf(person.branch).transfers.staff.push({ key: person.key, name: person.name, docs: person.docs, items: person.items }));
}

function summarizeAudits(audits, dates, branchOf) {
  const dateSet = new Set(dates);
  audits.filter((row) => live(row) && dateSet.has(text(row.serviceDate))).forEach((row) => {
    const a = branchOf(row.branchCode).audits;
    const total = num(row.total);
    const mismatch = num(row.mismatch);
    a.rows.push({ id: row.id || "", date: text(row.serviceDate), doc: text(row.documentNumber), zone: text(row.zone) || "ไม่ระบุโซน", total, match: total - mismatch, mismatch, note: text(row.note), checker: text(row.checkerName) || text(row.createdBy) });
    a.docs += 1;
    a.total += total;
    a.mismatch += mismatch;
  });
}

const STATUS_ROWS = [
  ["pending", "รอห้องแพ็คตรวจ"],
  ["checked", "ตรวจครบ / ยืนยันแล้ว"],
  ["shortage", "ของไม่ครบ / รอของ"],
  ["returned", "ห้องแพ็คส่งกลับสโตร์"],
  ["wrong", "ห้องแพ็คแจ้งจัดสินค้าผิด"],
  ["autoChecked", "ครบอัตโนมัติ (ผ่านวัน ห้องแพ็คไม่ได้ตรวจ)"],
  ["closedByStore", "สโตร์ปิดเคสแล้ว (จบ)"],
  ["other", "สถานะอื่น"]
];

// Pack returns also set status "waiting" (reports route), so packStatus is checked first.
function reportBucket(row) {
  if (isClosedByStore(row)) return "closedByStore";
  if (row.packStatus === "wrong") return "wrong";
  if (row.packStatus === "returned") return "returned";
  if (row.packStatus === "checked" && row.packAutoConfirmed) return "autoChecked";
  if (["waiting", "partial"].includes(row.status) || row.packStatus === "partial") return "shortage";
  if (row.packStatus === "checked") return "checked";
  if (row.packStatus === "pending") return "pending";
  return "other";
}

function summarizeReports(reports, dates) {
  const index = new Map(dates.map((date, i) => [date, i]));
  const daily = dates.map((date) => ({ date, booking: 0, online: 0 }));
  const counts = Object.fromEntries(STATUS_ROWS.map(([id]) => [id, 0]));
  const checkers = new Map();
  let booking = 0;
  let online = 0;
  let removed = 0;
  (reports || []).forEach((row) => {
    if (!row || !["booking", "online"].includes(row.type) || row.status === "draft") return;
    if (row.deletedAt) {
      if (index.has(reportDate(row))) removed += 1;
      return;
    }
    const i = index.get(reportDate(row));
    if (i === undefined) return;
    daily[i][row.type] += 1;
    if (row.type === "booking") booking += 1; else online += 1;
    counts[reportBucket(row)] += 1;
    const name = text(row.storeCheckerName) || "ไม่ระบุผู้ตรวจ";
    const person = checkers.get(name) || { name, booking: 0, online: 0 };
    person[row.type] += 1;
    checkers.set(name, person);
  });
  const total = booking + online;
  const activeDays = daily.filter((day) => day.booking + day.online > 0).length;
  return {
    total,
    booking,
    online,
    removed,
    activeDays,
    perDay: activeDays ? Math.round(total / activeDays) : 0,
    statuses: STATUS_ROWS.map(([id, label]) => ({ id, label, count: counts[id] })).filter((row) => row.id !== "other" || row.count > 0),
    daily,
    checkers: [...checkers.values()].sort((a, b) => b.booking + b.online - (a.booking + a.online) || a.name.localeCompare(b.name, "th"))
  };
}

const sumBy = (rows, key) => Math.round(rows.reduce((total, row) => total + num(row[key]), 0) * 100) / 100;
const itemKey = (item) => `${text(item.code)}|${text(item.name)}`;

// Claim documents in range: unclaimable ones per branch; claimable ones (branch optional) store-wide.
function summarizeClaims(claims, dates, branchOf) {
  const dateSet = new Set(dates);
  const rows = (claims || []).filter((row) => live(row) && dateSet.has(text(row.serviceDate)) && Array.isArray(row.items));
  const doc = (row) => ({ id: row.id || "", date: text(row.serviceDate), doc: text(row.documentNumber), branchCode: text(row.branchCode) ? branchOf(row.branchCode).code : "", reason: text(row.reason), requester: text(row.requester), supplier: text(row.supplier), items: row.items.map((item) => ({ code: text(item.code), name: text(item.name), qty: num(item.qty), unitPrice: num(item.unitPrice), amount: num(item.amount) })), qty: num(row.totalQty), amount: num(row.totalAmount) });
  const unclaimable = rows.filter((row) => row.kind === "unclaimable").map(doc);
  unclaimable.forEach((row) => {
    const c = branchOf(row.branchCode).claims;
    c.docs += 1;
    c.rows.push(row);
  });
  const claimable = rows.filter((row) => row.kind === "claimable").map(doc).sort((a, b) => a.date.localeCompare(b.date) || a.doc.localeCompare(b.doc));
  const reasons = new Map();
  unclaimable.forEach((row) => { const key = row.reason || "ไม่ระบุสาเหตุ"; const r = reasons.get(key) || { reason: key, docs: 0, amount: 0 }; r.docs += 1; r.amount += row.amount; reasons.set(key, r); });
  const items = new Map();
  claimable.forEach((row) => row.items.forEach((item) => { const key = itemKey(item); const e = items.get(key) || { code: item.code, name: item.name, qty: 0, amount: 0 }; e.qty += item.qty; e.amount += item.amount; items.set(key, e); }));
  return {
    claimable: { docs: claimable, qty: sumBy(claimable, "qty"), amount: sumBy(claimable, "amount"), topItems: [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 8) },
    unclaimable: { docs: unclaimable.length, qty: sumBy(unclaimable, "qty"), amount: sumBy(unclaimable, "amount"), reasons: [...reasons.values()].sort((a, b) => b.amount - a.amount) }
  };
}

// Production records in range, merged per branch and product.
function summarizeProduction(production, dates, branchOf) {
  const dateSet = new Set(dates);
  const merged = new Map();
  (production || []).filter((row) => live(row) && dateSet.has(text(row.serviceDate)) && Array.isArray(row.items)).forEach((row) => {
    const branch = branchOf(row.branchCode);
    const p = branch.production;
    p.records += 1;
    row.items.forEach((item) => {
      const key = JSON.stringify([branch.code, text(item.code), text(item.name), text(item.unit)]);
      const entry = merged.get(key) || { branch, code: text(item.code), name: text(item.name), unit: text(item.unit), qty: 0, sold: 0, soldKnown: false, soldKnownLines: 0, soldMissingLines: 0 };
      entry.qty += num(item.qty);
      if (item.sold !== null && item.sold !== undefined && item.sold !== "" && Number.isFinite(Number(item.sold))) { entry.sold += num(item.sold); entry.soldKnown = true; entry.soldKnownLines += 1; }
      else entry.soldMissingLines += 1;
      merged.set(key, entry);
    });
  });
  merged.forEach(({ branch, ...item }) => {
    const p = branch.production;
    p.items.push({ ...item, soldComplete: item.soldMissingLines === 0, qty: Math.round(item.qty * 100) / 100, sold: item.soldKnown ? Math.round(item.sold * 100) / 100 : null });
  });
}

function firstFilled(list, key) {
  return list.map((item) => text(item?.[key])).find(Boolean) || "";
}

function summarizeCases(cases, today, branchOf) {
  const open = (cases || []).filter((row) => live(row) && isOpenCase(row));
  const shortages = [];
  let storeOpen = 0;
  let storeLines = 0;
  open.forEach((row) => {
    const storeLevel = STORE_LEVEL_SOURCES.includes(row.sourceType);
    const branch = storeLevel ? null : branchOf(row.branchCode);
    if (branch) branch.cases.open += 1; else storeOpen += 1;
    const opened = bangkokDateOf(row.createdAt || row.sourceCreatedAt);
    (row.lines || []).forEach((line) => {
      const remaining = remainingOf(line);
      if (!(remaining > 0)) return;
      if (branch) branch.cases.shortageLines += 1; else storeLines += 1;
      const allocations = Array.isArray(line.allocations) ? line.allocations : [];
      const etas = allocations.map((a) => text(a.eta)).filter(Boolean).sort();
      shortages.push({
        key: `${row.id}:${line.id}`,
        caseId: row.id,
        sourceType: row.sourceType,
        sourceNumber: text(row.sourceNumber) || text(row.sourceId),
        branchCode: branch ? branch.code : "",
        storeLevel,
        sku: text(line.sku),
        name: text(line.name),
        unit: text(line.unit),
        required: num(line.required),
        received: num(line.received),
        remaining,
        category: line.category || row.category || "unknown",
        trackingStatus: line.trackingStatus || "waiting_purchase",
        po: firstFilled(allocations, "po"),
        supplier: firstFilled(allocations, "supplier"),
        owner: firstFilled(allocations, "owner") || text(row.responsibleName),
        eta: etas[0] || "",
        opened,
        days: opened ? daysBetween(opened, today) : null,
        overdue: etas.some((eta) => eta < today),
        note: text(row.cause) || text(row.note)
      });
    });
  });
  shortages.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (b.days ?? -1) - (a.days ?? -1));
  return {
    open: open.length,
    // Every open case once, for the problem-type summary (store-level cases carry no branch).
    openCases: open.map((row) => ({ branchCode: STORE_LEVEL_SOURCES.includes(row.sourceType) ? "" : branchOf(row.branchCode).code, storeLevel: STORE_LEVEL_SOURCES.includes(row.sourceType), category: row.category || "unknown", cause: text(row.cause) })),
    storeOpen,
    storeLines,
    withoutLines: open.filter((row) => !(row.lines || []).length).length,
    shortages
  };
}

// branchList: [{ code, name }] from store settings, kept in that order; unknown codes are appended.
// branchNames: { CODE: name } for every configured branch, active or not (inactive ones show only with data).
export function buildWarehouseDashboard({ from, to, today = bangkokDateOf(new Date().toISOString()), branchList = [], branchNames = {}, roster = [], reports = [], transfers = [], audits = [], cases = [], workLogs = [], claims = [], production = [] }) {
  const range = customRange(from, to);
  if (!range || range.dates.length > WAREHOUSE_MAX_DAYS) return null;
  const { dates } = range;
  const branches = new Map();
  const names = new Map((branchList || []).map((branch) => [text(branch.code).toUpperCase(), text(branch.name)]));
  const allNames = new Map([...Object.entries(branchNames || {}).map(([code, name]) => [text(code).toUpperCase(), text(name)]), ...names]);
  const branchOf = (rawCode) => {
    const raw = text(rawCode).toUpperCase();
    const code = (allNames.has(raw) ? raw : (BRANCH_CODE_ALIASES[raw] || []).find((alias) => allNames.has(alias))) || raw || UNKNOWN_BRANCH;
    if (!branches.has(code)) {
      const branch = emptyBranch(code);
      branch.transfers.daily = dates.map(() => 0);
      branch.transfers.dailyIncomplete = dates.map(() => 0);
      branches.set(code, branch);
    }
    return branches.get(code);
  };
  (branchList || []).forEach((branch) => branchOf(branch.code));

  summarizeTransfers(transfers || [], dates, branchOf);
  summarizeAudits(audits || [], dates, branchOf);
  const caseSummary = summarizeCases(cases, today, branchOf);
  const reportSummary = summarizeReports(reports, dates);
  const claimSummary = summarizeClaims(claims, dates, branchOf);
  summarizeProduction(production, dates, branchOf);

  const list = [...branches.values()].map((branch) => {
    const a = branch.audits;
    a.match = a.total - a.mismatch;
    a.accuracy = percent(a.match, a.total);
    // KPI judged on the unrounded share so 94.96% never shows as a pass.
    a.pass = a.total > 0 && (a.match / a.total) * 100 >= AUDIT_PASS_PERCENT;
    a.rows.sort((x, y) => x.date.localeCompare(y.date) || x.doc.localeCompare(y.doc));
    branch.transfers.errors.sort((x, y) => x.date.localeCompare(y.date));
    branch.transfers.staff.sort((x, y) => y.docs - x.docs || x.name.localeCompare(y.name, "th"));
    const c = branch.claims;
    c.rows.sort((x, y) => x.date.localeCompare(y.date) || x.doc.localeCompare(y.doc));
    c.qty = sumBy(c.rows, "qty");
    c.amount = sumBy(c.rows, "amount");
    const p = branch.production;
    p.items.sort((x, y) => y.qty - x.qty || x.name.localeCompare(y.name, "th"));
    p.sku = p.items.length;
    p.qty = sumBy(p.items, "qty");
    p.soldKnown = p.items.some((item) => item.sold !== null);
    p.sold = sumBy(p.items, "sold");
    p.soldKnownLines = sumBy(p.items, "soldKnownLines");
    p.soldMissingLines = sumBy(p.items, "soldMissingLines");
    p.soldComplete = p.soldKnownLines > 0 && p.soldMissingLines === 0;
    const units = [...new Set(p.items.map((item) => item.unit))];
    p.totalsPerUnit = units.map((unit) => {
      const items = p.items.filter((item) => item.unit === unit);
      const soldKnownLines = sumBy(items, "soldKnownLines");
      const soldMissingLines = sumBy(items, "soldMissingLines");
      return { unit, qty: sumBy(items, "qty"), sold: soldKnownLines ? sumBy(items, "sold") : null, soldKnown: soldKnownLines > 0, soldKnownLines, soldMissingLines, soldComplete: soldMissingLines === 0 };
    });
    return { ...branch, name: allNames.get(branch.code) || (branch.code === UNKNOWN_BRANCH ? "ไม่ระบุสาขา" : branch.code) };
  });
  // Other branches get a card only when they hold store work of their own (outgoing transfers,
  // audits, cases); a branch that merely receives transfers stays a destination.
  const hasData = (b) => b.transfers.total || b.audits.docs || b.cases.open || b.claims.docs || b.production.records;
  const visible = list.filter((b) => names.has(b.code) || hasData(b));

  const staffReport = buildRangeReport({ from: range.from, to: range.to, roster, reports, transfers, audits, workLogs });
  const staff = [...staffReport.people, { ...staffReport.unattributed, name: "ไม่ทราบผู้ทำ", uid: "unknown" }]
    .map((row) => ({ uid: row.uid, name: row.name, days: row.days, booking: row.booking, online: row.online, transfer: row.transfer, issues: row.issues, resolved: row.resolved, auditDocs: row.auditDocs, auditItems: row.auditItems, mismatch: row.mismatch, logs: row.logs }))
    .filter((row) => row.uid !== "unknown" || row.booking + row.online + row.transfer + row.auditDocs > 0);

  return {
    from: range.from,
    to: range.to,
    today,
    dates,
    days: dates.length,
    branches: visible,
    reports: reportSummary,
    cases: caseSummary,
    claims: claimSummary,
    staff,
    auditPassPercent: AUDIT_PASS_PERCENT,
    transferWarnPercent: TRANSFER_WARN_PERCENT,
    generatedAt: new Date().toISOString()
  };
}

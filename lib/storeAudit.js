// Internal Audit (stock count) helpers. Pure and client-safe: no firebase / Node built-ins.
import { findBranch, getActiveBranches, validateDocumentNumber } from "./storeSettings.js";

export const STORE_AUDITS_COLLECTION = "store_audits";

const MAX_SEQUENCE_ATTEMPTS = 20;
const ZONE_MAX = 100;
const CHECKER_MAX = 160;
const NOTE_MAX = 1000;

const clean = (value, max) => String(value ?? "").trim().slice(0, max);

// Accepts a JS number or a numeric string; anything else (decimal, negative, "1e3", "") is NaN.
function toCount(value) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
  if (typeof value === "string" && /^\d{1,9}$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

// accuracy is a percentage (0-100, unrounded) or null when nothing was counted.
export function computeAuditCounts({ total, match }) {
  const mismatch = Number(total) - Number(match);
  return { mismatch, accuracy: Number(total) > 0 ? (Number(match) / Number(total)) * 100 : null };
}

function fieldConfig(settings, id) {
  const found = settings?.documents?.audit?.fields?.find((item) => item.id === id);
  return found || { id, label: id, show: true, required: false };
}

// The server never trusts a client-sent mismatch: it is always total - match.
export function validateAuditInput(input, { settings, profile } = {}) {
  const fail = (error) => ({ ok: false, error, status: 400 });
  const raw = input && typeof input === "object" ? input : {};
  const cfg = settings?.documents?.audit;
  if (!cfg) return fail("ไม่พบการตั้งค่าเอกสารตรวจนับ");
  const activeBranches = getActiveBranches(settings);

  let documentNumber = "";
  if (clean(raw.documentNumber, 100)) {
    const checked = validateDocumentNumber(raw.documentNumber, cfg, { branchCodes: activeBranches.map((branch) => branch.code) });
    if (!checked.ok) return fail(checked.error);
    documentNumber = checked.number;
  }

  const branchCode = clean(raw.branchCode, 20).toUpperCase();
  if (!branchCode) return fail("กรุณาเลือกสาขา / คลัง");
  const branch = findBranch(settings, branchCode);
  if (!branch || branch.active === false) return fail("สาขาไม่ถูกต้องหรือถูกปิดใช้งาน");

  const checkerField = fieldConfig(settings, "checker");
  const checkerName = checkerField.show ? clean(raw.checkerName, CHECKER_MAX) : "";
  const resolvedChecker = checkerName || clean(profile?.name, CHECKER_MAX);
  if (checkerField.show && checkerField.required && !checkerName) return fail("กรุณาระบุผู้ตรวจนับ");

  const total = toCount(raw.total);
  if (!Number.isInteger(total) || total <= 0) return fail("จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0");
  const match = toCount(raw.match);
  if (!Number.isInteger(match)) return fail("จำนวนสินค้าตรงต้องเป็นจำนวนเต็มตั้งแต่ 0");
  if (match > total) return fail("สินค้าตรงมากกว่าจำนวนตรวจนับทั้งหมดไม่ได้");
  const { mismatch } = computeAuditCounts({ total, match });

  const zoneField = fieldConfig(settings, "zone");
  const zone = zoneField.show ? clean(raw.zone, ZONE_MAX) : "";
  if (zoneField.show && zoneField.required && !zone) return fail(`กรุณาระบุ${zoneField.label}`);

  // A hidden note field cannot be filled in, so it can never be demanded.
  const noteField = fieldConfig(settings, "note");
  const note = noteField.show ? clean(raw.note, NOTE_MAX) : "";
  if (noteField.show && !note && (mismatch > 0 || noteField.required)) {
    return fail(mismatch > 0 ? "มีสินค้าไม่ตรง กรุณาระบุรายการที่ไม่ตรง" : `กรุณาระบุ${noteField.label}`);
  }

  return {
    ok: true,
    value: { documentNumber, branchCode: branch.code, branchName: branch.name, zone, checkerName: resolvedChecker, total, match, mismatch, note }
  };
}

const liveAudits = (audits) => (Array.isArray(audits) ? audits : []).filter((audit) => audit && !audit.deletedAt);

export function summarizeAuditDay(audits) {
  const rows = liveAudits(audits);
  const total = rows.reduce((sum, audit) => sum + (Number(audit.total) || 0), 0);
  const match = rows.reduce((sum, audit) => sum + (Number(audit.match) || 0), 0);
  return { docs: rows.length, total, match, mismatch: total - match, accuracy: computeAuditCounts({ total, match }).accuracy };
}

// mode "active": divide by days that had counts (min 1); "calendar": divide by every day in `dates`.
export function buildAuditDaily({ audits, dates, mode = "active" }) {
  const list = Array.isArray(dates) ? dates : [];
  const rows = liveAudits(audits);
  const days = list.map((date) => {
    const summary = summarizeAuditDay(rows.filter((audit) => audit.serviceDate === date));
    return { date, ...summary, active: summary.total > 0 };
  });
  const sum = days.reduce(
    (acc, day) => ({ docs: acc.docs + day.docs, total: acc.total + day.total, match: acc.match + day.match }),
    { docs: 0, total: 0, match: 0 }
  );
  const totals = { ...sum, mismatch: sum.total - sum.match, accuracy: computeAuditCounts(sum).accuracy };
  const activeDays = days.filter((day) => day.active).length;
  const basis = mode === "calendar" ? Math.max(list.length, 1) : Math.max(activeDays, 1);
  return {
    days,
    totals,
    activeDays,
    basis,
    avg: { docs: totals.docs / basis, total: totals.total / basis, match: totals.match / basis, mismatch: totals.mismatch / basis }
  };
}

// First sequence after `counterLast` that is not in `taken` (Set of numbers); null after 20 tries.
export function nextAuditSequence(counterLast, taken = new Set()) {
  const start = Math.max(0, Math.floor(Number(counterLast) || 0));
  for (let step = 1; step <= MAX_SEQUENCE_ATTEMPTS; step += 1) {
    if (!taken.has(start + step)) return start + step;
  }
  return null;
}

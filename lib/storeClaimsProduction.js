// Store claim records (เคลมได้ / เคลมไม่ได้) and production records (การผลิตสินค้า).
// Pure and client-safe: validation, ERP paste import and helpers shared by routes, panels and the dashboard.

export const STORE_CLAIMS_COLLECTION = "store_claims";
export const STORE_PRODUCTION_COLLECTION = "store_production";
export const RECORD_RANGE_MAX_DAYS = 92;
export const RECORD_READ_LIMIT = 3000;
export const IMPORT_DOCUMENT_MAX = 50;
export const ITEM_MAX = 200;

export const CLAIM_KINDS = {
  claimable: {
    label: "เคลมได้",
    detail: "ใบส่งคืน / ลดหนี้จากผู้ขาย",
    priceLabel: "ราคา/หน่วย",
    columns: ["วันที่", "เลขที่เอกสาร", "รหัสสินค้า", "ชื่อสินค้า", "จำนวน", "ราคา/หน่วย", "มูลค่า (ไม่ใส่ก็ได้)"]
  },
  unclaimable: {
    label: "เคลมไม่ได้",
    detail: "เบิกออก / ตัดจ่าย (หมดอายุ ชำรุด แถม ฯลฯ)",
    priceLabel: "ต้นทุน/หน่วย",
    columns: ["วันที่", "เลขที่เอกสาร", "สาเหตุ", "รหัสสินค้า", "ชื่อสินค้า", "ผู้เบิก", "สาขา", "จำนวน", "ต้นทุน/หน่วย", "มูลค่า (ไม่ใส่ก็ได้)"]
  }
};
export const PRODUCTION_COLUMNS = ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "จำนวนผลิต", "ยอดขาย (ไม่ใส่ก็ได้)"];

const DOC_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,59}$/;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const text = (value, max = 500) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const round2 = (value) => Math.round(value * 100) / 100;

export function isDateKey(value) {
  const match = DATE_KEY.exec(String(value || ""));
  if (!match) return false;
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return date.getUTCFullYear() === +match[1] && date.getUTCMonth() === +match[2] - 1 && date.getUTCDate() === +match[3];
}

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;
export const RECORD_PAST_DAYS = 730;
export const bangkokToday = () => new Date(Date.now() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
const shiftDays = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// Document dates must fall within the last two years and not after tomorrow (catches mistyped years).
export function recordDateWindow(today = bangkokToday()) {
  return { min: shiftDays(today, -RECORD_PAST_DAYS), max: shiftDays(today, 1) };
}

// "01/09/2569" (ERP, Buddhist year), "1/9/2026", "1/9/69" or "1/9/26", "2026-09-01" → "2026-09-01".
// A two-digit year may be Buddhist (69) or Christian (26): the reading inside the date window wins.
export function parseRecordDate(value, today = bangkokToday()) {
  const raw = text(value, 40);
  if (isDateKey(raw)) return raw;
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(raw);
  if (!match) return "";
  const year = Number(match[3]);
  const key = (y) => `${y}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
  if (year >= 100) {
    const candidate = key(year > 2400 ? year - 543 : year);
    return isDateKey(candidate) ? candidate : "";
  }
  const { min, max } = recordDateWindow(today);
  const fits = [key(2500 + year - 543), key(2000 + year)].filter((candidate) => isDateKey(candidate) && candidate >= min && candidate <= max);
  return fits.length === 1 ? fits[0] : "";
}

// "1,234.50" → 1234.5; blank → null; accounting "-" → 0; anything else → NaN.
export function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const raw = String(value ?? "").replace(/[,\s฿]/g, "");
  if (!raw) return null;
  if (raw === "-") return 0;
  return /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN;
}

export function normalizeDocNumber(value) {
  return text(value, 60).toUpperCase().replace(/\s+/g, "");
}

// Known spellings of the same branch in ERP exports and store settings. Add pairs here, never guess by prefix.
export const BRANCH_CODE_ALIASES = { CP: ["HK1"], HK1: ["CP"], MHD: ["MH"], MH: ["MHD"] };

// Exact code, then a listed alias, then exact name, then one branch whose name contains the text.
export function resolveBranch(branches, value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const list = Array.isArray(branches) ? branches : [];
  const upper = raw.toUpperCase();
  const exact = list.find((b) => b.code === upper);
  if (exact) return exact;
  const alias = (BRANCH_CODE_ALIASES[upper] || []).map((code) => list.find((b) => b.code === code)).find(Boolean);
  if (alias) return alias;
  const named = list.find((b) => text(b.name) === raw);
  if (named) return named;
  if (raw.length < 3) return null;
  const byName = list.filter((b) => text(b.name).includes(raw));
  return byName.length === 1 ? byName[0] : null;
}

export const claimDocId = (kind, number) => `${kind}_${encodeURIComponent(number)}`;

// The store runs three main branches. Settings may spell them differently (e.g. MH for MHD),
// so each code is matched with resolveBranch; with no match at all every active branch is used.
export const STORE_MAIN_BRANCH_CODES = ["CP", "HQ", "MHD"];
export function storeMainBranches(branches) {
  const active = (Array.isArray(branches) ? branches : []).filter((b) => b && b.active !== false);
  const picked = [];
  STORE_MAIN_BRANCH_CODES.forEach((code) => {
    const branch = resolveBranch(active, code);
    if (branch && !picked.includes(branch)) picked.push(branch);
  });
  return picked.length ? picked : active;
}

function pasteRows(textValue) {
  return String(textValue || "").split(/\r?\n/).map((line, index) => ({ line: index + 1, cells: line.split("\t").map((cell) => cell.trim()) })).filter((row) => row.cells.some(Boolean));
}

// Rows pasted from Excel (tab separated) in the column order of CLAIM_KINDS[kind].columns.
// Recognizable header rows are skipped; rows are grouped by document number.
export function parseClaimPaste(kind, pasted, branches = [], today = bangkokToday()) {
  const unclaimable = kind === "unclaimable";
  const qtyAt = unclaimable ? 7 : 4;
  const errors = [];
  const documents = new Map();
  pasteRows(pasted).forEach(({ line, cells }) => {
    if (cells[0] === "วันที่" && /^(เลขที่|เลขที่เอกสาร)$/.test(cells[1]) && cells[qtyAt] === "จำนวน") return;
    const qty = parseAmount(cells[qtyAt]);
    if (qty === null || Number.isNaN(qty)) {
      errors.push({ line, message: line === 1 ? "จำนวนไม่ใช่ตัวเลข (ถ้าเป็นแถวหัวตาราง ให้ลบแถวนี้ก่อนวาง)" : "จำนวนไม่ใช่ตัวเลข" });
      return;
    }
    const [dateCell, docCell] = cells;
    const serviceDate = parseRecordDate(dateCell, today);
    const documentNumber = normalizeDocNumber(docCell);
    if (!dateCell && !documentNumber) { errors.push({ line, message: "แถวไม่มีวันที่และเลขที่เอกสาร (ถ้าเป็นแถวรวมท้ายตาราง ให้ลบออกก่อนวาง)" }); return; }
    if (!serviceDate) { errors.push({ line, message: `วันที่ "${dateCell || ""}" ไม่ถูกต้องหรืออยู่นอกช่วง 2 ปีล่าสุด` }); return; }
    if (!documentNumber) { errors.push({ line, message: "ไม่มีเลขที่เอกสาร" }); return; }
    const item = unclaimable
      ? { code: cells[3], name: cells[4], qty, unitPrice: parseAmount(cells[8]), amount: parseAmount(cells[9]) }
      : { code: cells[2], name: cells[3], qty, unitPrice: parseAmount(cells[5]), amount: parseAmount(cells[6]) };
    const doc = documents.get(documentNumber) || { kind, documentNumber, serviceDate, branchCode: "", reason: "", requester: "", items: [], lines: [] };
    if (doc.serviceDate !== serviceDate) { errors.push({ line, message: `เอกสาร ${documentNumber} มีหลายวันที่` }); return; }
    if (unclaimable) {
      if (!doc.reason) doc.reason = text(cells[2], 1000);
      if (!doc.requester) doc.requester = text(cells[5], 160);
      if (!doc.branchCode && cells[6]) {
        const branch = resolveBranch(storeMainBranches(branches), cells[6]);
        if (!branch) { errors.push({ line, message: `ไม่พบสาขา "${cells[6]}" ในตั้งค่าสโตร์` }); return; }
        doc.branchCode = branch.code;
      }
    }
    doc.items.push(item);
    doc.lines.push(line);
    documents.set(documentNumber, doc);
  });
  return { documents: [...documents.values()], errors };
}

// Production rows: code, name, unit, qty, sold (optional).
export function parseProductionPaste(pasted) {
  const errors = [];
  const items = [];
  pasteRows(pasted).forEach(({ line, cells }) => {
    if (/^(รหัส|รหัสสินค้า)$/.test(cells[0]) && /^(ชื่อ|ชื่อสินค้า)$/.test(cells[1]) && /^(ผลิต|จำนวนผลิต)$/.test(cells[3])) return;
    const qty = parseAmount(cells[3]);
    if (qty === null || Number.isNaN(qty)) {
      errors.push({ line, message: line === 1 ? "จำนวนผลิตไม่ใช่ตัวเลข (ถ้าเป็นแถวหัวตาราง ให้ลบแถวนี้ก่อนวาง)" : "จำนวนผลิตไม่ใช่ตัวเลข" });
      return;
    }
    const sold = parseAmount(cells[4]);
    if (Number.isNaN(sold)) { errors.push({ line, message: "ยอดขายไม่ใช่ตัวเลข" }); return; }
    items.push({ code: cells[0], name: cells[1], unit: cells[2], qty, sold });
  });
  return { items, errors };
}

function failure(error) {
  return { ok: false, error, status: 400 };
}

function documentDate(value, today) {
  const date = parseRecordDate(value, today);
  const { min, max } = recordDateWindow(today);
  return date && date >= min && date <= max ? date : "";
}

function validItems(raw, { priced }) {
  if (!Array.isArray(raw) || raw.length < 1) return { error: "กรุณาใส่รายการสินค้าอย่างน้อย 1 รายการ" };
  if (raw.length > ITEM_MAX) return { error: `ใส่รายการได้ไม่เกิน ${ITEM_MAX} รายการต่อเอกสาร` };
  const items = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i] && typeof raw[i] === "object" ? raw[i] : {};
    const at = `รายการที่ ${i + 1}`;
    const name = text(row.name, 200);
    if (!name) return { error: `${at}: กรุณาใส่ชื่อสินค้า` };
    const qty = parseAmount(row.qty);
    if (!(round2(qty) > 0) || qty > 1e7) return { error: `${at}: จำนวนต้องมากกว่า 0` };
    const item = { code: text(row.code, 60).toUpperCase(), name, unit: text(row.unit, 30), qty: round2(qty) };
    if (priced) {
      const unitPrice = parseAmount(row.unitPrice);
      if (Number.isNaN(unitPrice) || (unitPrice !== null && (unitPrice < 0 || unitPrice > 1e8))) return { error: `${at}: ราคา/ต้นทุนต่อหน่วยไม่ถูกต้อง` };
      const amount = parseAmount(row.amount);
      if (Number.isNaN(amount) || (amount !== null && (amount < 0 || amount > 1e10))) return { error: `${at}: มูลค่าไม่ถูกต้อง` };
      item.unitPrice = unitPrice === null ? 0 : round2(unitPrice);
      // A typed amount (ERP export) wins; otherwise quantity × unit price.
      item.amount = amount === null ? round2(item.qty * item.unitPrice) : round2(amount);
    } else {
      const sold = parseAmount(row.sold);
      if (Number.isNaN(sold) || (sold !== null && (sold < 0 || sold > 1e7))) return { error: `${at}: ยอดขายไม่ถูกต้อง` };
      item.sold = sold === null ? null : round2(sold);
    }
    items.push(item);
  }
  return { items };
}

function branchFor(settings, code, { required, keepCode }) {
  const raw = text(code, 20).toUpperCase();
  if (!raw) return required ? { error: "กรุณาเลือกสาขา" } : { branch: null };
  const allowed = storeMainBranches(settings?.branches);
  const branch = allowed.find((b) => b.code === raw) || (raw === keepCode ? (settings?.branches || []).find((b) => b.code === raw) : null);
  if (!branch) return { error: "เลือกได้เฉพาะสาขาหลักของสโตร์ (ช้างเผือก / สำนักงานใหญ่ / MHD)" };
  return { branch };
}

// `keep` = the stored document when editing: its number and kind cannot change.
export function validateClaimDocument(input, { settings, keep = null, today = bangkokToday() } = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const kind = keep?.kind || raw.kind;
  if (!CLAIM_KINDS[kind]) return failure("ประเภทเคลมไม่ถูกต้อง");
  const documentNumber = keep?.documentNumber || normalizeDocNumber(raw.documentNumber);
  if (!DOC_NUMBER_PATTERN.test(documentNumber)) return failure("กรุณาใส่เลขที่เอกสาร (ตัวอักษร ตัวเลข - / .)");
  const serviceDate = keep && raw.serviceDate === keep.serviceDate ? keep.serviceDate : documentDate(raw.serviceDate, today);
  if (!serviceDate) return failure("วันที่เอกสารไม่ถูกต้อง (ต้องอยู่ใน 2 ปีล่าสุด และไม่เกินวันนี้)");
  const unclaimable = kind === "unclaimable";
  const picked = branchFor(settings, raw.branchCode, { required: unclaimable, keepCode: keep?.branchCode });
  if (picked.error) return failure(picked.error);
  const reason = text(raw.reason, 1000);
  if (unclaimable && !reason) return failure("กรุณาระบุสาเหตุที่เคลมไม่ได้");
  const checked = validItems(raw.items, { priced: true });
  if (checked.error) return failure(checked.error);
  const { items } = checked;
  return {
    ok: true,
    value: {
      kind,
      documentNumber,
      serviceDate,
      branchCode: picked.branch?.code || "",
      branchName: picked.branch?.name || "",
      reason,
      requester: text(raw.requester, 160),
      supplier: text(raw.supplier, 160),
      note: text(raw.note, 1000),
      items,
      itemCount: items.length,
      totalQty: round2(items.reduce((sum, item) => sum + item.qty, 0)),
      totalAmount: round2(items.reduce((sum, item) => sum + item.amount, 0))
    }
  };
}

export function validateProductionRecord(input, { settings, keep = null, today = bangkokToday() } = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const serviceDate = keep && raw.serviceDate === keep.serviceDate ? keep.serviceDate : documentDate(raw.serviceDate, today);
  if (!serviceDate) return failure("วันที่ไม่ถูกต้อง (ต้องอยู่ใน 2 ปีล่าสุด และไม่เกินวันนี้)");
  const picked = branchFor(settings, raw.branchCode, { required: true, keepCode: keep?.branchCode });
  if (picked.error) return failure(picked.error);
  const documentNumber = normalizeDocNumber(raw.documentNumber);
  if (documentNumber && !DOC_NUMBER_PATTERN.test(documentNumber)) return failure("เลขที่เอกสารใช้ได้เฉพาะตัวอักษร ตัวเลข - / .");
  const checked = validItems(raw.items, { priced: false });
  if (checked.error) return failure(checked.error);
  const { items } = checked;
  const soldItems = items.filter((item) => item.sold !== null);
  return {
    ok: true,
    value: {
      serviceDate,
      branchCode: picked.branch.code,
      branchName: picked.branch.name,
      documentNumber,
      note: text(raw.note, 1000),
      items,
      itemCount: items.length,
      totalQty: round2(items.reduce((sum, item) => sum + item.qty, 0)),
      totalSold: soldItems.length ? round2(soldItems.reduce((sum, item) => sum + item.sold, 0)) : null
    }
  };
}

// True when a stored production record is the same save as `value` (idempotent retry).
export function sameProductionRecord(stored, value) {
  const lines = (items) => JSON.stringify((items || []).map((item) => [item.code, item.name, text(item.unit, 30), item.qty, item.sold ?? null]));
  return Boolean(stored) && stored.branchCode === value.branchCode && stored.serviceDate === value.serviceDate && text(stored.documentNumber, 60) === text(value.documentNumber, 60) && text(stored.note, 1000) === text(value.note, 1000) && lines(stored.items) === lines(value.items);
}

// Claim amount to show in an edit form: blank when it is just quantity × unit price (so it is recalculated).
export function typedAmount(item) {
  return round2(num0(item.qty) * num0(item.unitPrice)) === round2(num0(item.amount)) ? "" : String(item.amount);
}
const num0 = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function recordHistory(event, profile, now, reason = "") {
  return { event, at: now, by: profile?.name || profile?.email || "", byUid: profile?.uid || "", reason: text(reason, 1000) };
}

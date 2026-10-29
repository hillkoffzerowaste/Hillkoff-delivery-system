// Store module settings: defaults, normalize (tolerant read), validate (strict write) and
// document-number helpers. Client-safe: no Node built-ins here (PIN lives in storeSettingsPin.js).
import { thaiBuddhistYY } from "./storeFormat.js";

export const STORE_SETTINGS_COLLECTION = "store_settings";
export const STORE_SETTINGS_DOC_ID = "default";
export const STORE_DOCUMENT_REGISTRY_COLLECTION = "store_document_registry";
export const STORE_DOCUMENT_COUNTERS_COLLECTION = "store_document_counters";
export const STORE_SETTINGS_TAB_ID = "store-settings";

export const STORE_MODULE_IDS = [
  "store-booking",
  "store-online",
  "store-dashboard",
  "store-transfer",
  "store-audit",
  "store-overview"
];
export const ALWAYS_ENABLED_MODULE_IDS = ["store-booking", "store-online"];

const DEFAULT_MODULE_NAMES = {
  "store-booking": "ใบสั่งจอง",
  "store-online": "ใบขายออนไลน์",
  "store-dashboard": "รายงานประจำวัน",
  "store-transfer": "ใบโอนสินค้า",
  "store-audit": "Internal Audit",
  "store-overview": "รายงานแดชบอร์ด"
};

export const STORE_MODULE_GROUPS = [
  {
    id: "core",
    title: "โมดูลหลัก",
    hint: "ใบสั่งจอง / ใบขายออนไลน์ ผูกกับห้องแพ็ค ปิดไม่ได้ · เมนูอื่นปิดได้ตามงานของแต่ละสโตร์",
    moduleIds: ["store-booking", "store-online"]
  },
  {
    id: "addon",
    title: "โมดูลเสริม",
    hint: "เปิด/ปิดได้ · ปิดแล้วเมนูจะหายแต่ข้อมูลเดิมยังอยู่",
    moduleIds: ["store-transfer", "store-audit"]
  },
  {
    id: "report",
    title: "รายงาน",
    hint: "หน้ารายงานที่แยกจากหน้าบันทึกงาน",
    moduleIds: ["store-dashboard", "store-overview"]
  }
];

export const BRANCH_TYPES = ["คลังสินค้า", "สาขา", "หน้าร้าน"];
export const NUMBER_PATTERNS = ["dash", "yymm", "branch"];
export const RESET_MODES = ["none", "month", "year"];
export const DOCUMENT_KINDS = ["transfer", "audit"];
export const DOCUMENT_SIGNERS = {
  transfer: ["ผู้ส่งสินค้า", "ผู้รับสินค้า", "ผู้ตรวจสอบ"],
  audit: ["ผู้ตรวจนับ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"]
};

// locked = cannot be hidden; requiredLocked = "required" checkbox cannot change.
// defaultRequired is also the forced value for any locked/requiredLocked field.
const field = (id, defaultLabel, { locked = false, requiredLocked = false, defaultRequired = false } = {}) => ({
  id,
  defaultLabel,
  locked,
  requiredLocked: requiredLocked || locked,
  defaultRequired
});

export const FIELD_DEFINITIONS = {
  transfer: [
    field("no", "เลขที่ใบโอน", { locked: true, defaultRequired: true }),
    field("ref", "อ้างอิงใบขอโอน"),
    field("from", "ต้นทาง", { locked: true, defaultRequired: true }),
    field("to", "ปลายทาง", { locked: true, defaultRequired: true }),
    field("preparer", "ผู้จัดใบโอน", { defaultRequired: true }),
    field("receipt", "ผลรับสินค้า", { locked: true, defaultRequired: true }),
    field("note", "หมายเหตุสินค้าไม่ครบ")
  ],
  audit: [
    field("no", "เลขที่เอกสาร", { locked: true, defaultRequired: true }),
    // Server always requires a branch, so this field cannot be hidden.
    field("area", "สาขา / คลัง", { locked: true, defaultRequired: true }),
    field("zone", "หมวดรหัส"),
    field("checker", "ผู้ตรวจนับ", { defaultRequired: true }),
    field("total", "ตรวจนับทั้งหมด", { locked: true, defaultRequired: true }),
    field("match", "สินค้าตรง", { locked: true, defaultRequired: true }),
    field("mismatch", "สินค้าไม่ตรง", { locked: true, defaultRequired: false }),
    field("note", "รายการที่ไม่ตรง")
  ]
};

const DEFAULT_DOCUMENTS = {
  transfer: { title: "ใบโอนสินค้า", prefix: "TR" },
  audit: { title: "ใบตรวจนับสินค้า (Internal Audit)", prefix: "AU" }
};

const MODULE_NAME_MAX = 40;
const FIELD_LABEL_MAX = 40;
const BRANCH_NAME_MAX = 60;
const HEADER_TEXT_MAX = 200;
const DOCUMENT_TITLE_MAX = 200;
const BRANCH_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
const PREFIX_PATTERN = /^[A-Z]{1,6}$/;
const MAX_SEQUENCE_DIGITS = 8;

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

function defaultFields(kind) {
  return FIELD_DEFINITIONS[kind].map((def) => ({
    id: def.id,
    label: def.defaultLabel,
    show: true,
    required: def.defaultRequired
  }));
}

export function getDefaultStoreSettings() {
  return {
    version: 1,
    modules: STORE_MODULE_IDS.map((id, order) => ({
      id,
      name: DEFAULT_MODULE_NAMES[id],
      enabled: true,
      order
    })),
    branches: [
      { code: "CP", name: "สาขาช้างเผือก", type: "สาขา", active: true },
      { code: "HQ", name: "สาขาสำนักงานใหญ่", type: "สาขา", active: true },
      { code: "PP", name: "สาขาป่าแพ่ง", type: "สาขา", active: true },
      { code: "MH", name: "สาขามหิดล", type: "สาขา", active: true }
    ],
    staff: [],
    header: {
      company: "HILLKOFF",
      address: "",
      taxId: "",
      phone: "",
      showLogo: true,
      showAddress: true,
      showSign: true
    },
    documents: Object.fromEntries(
      DOCUMENT_KINDS.map((kind) => [
        kind,
        {
          title: DEFAULT_DOCUMENTS[kind].title,
          prefix: DEFAULT_DOCUMENTS[kind].prefix,
          pattern: "dash",
          digits: 4,
          reset: "none",
          fields: defaultFields(kind)
        }
      ])
    )
  };
}

// Applies the rules a client can never override: locked fields keep their forced show/required.
function enforceField(def, show, required) {
  const forcedShow = def.locked ? true : show;
  const forcedRequired = def.requiredLocked ? def.defaultRequired : required;
  return { show: forcedShow, required: forcedShow ? forcedRequired : false };
}

function normalizeModules(rawModules) {
  const defaults = getDefaultStoreSettings().modules;
  const seen = new Map();
  (Array.isArray(rawModules) ? rawModules : []).forEach((item, index) => {
    if (!isPlainObject(item) || !STORE_MODULE_IDS.includes(item.id) || seen.has(item.id)) return;
    const order = Number.isFinite(item.order) ? item.order : index;
    seen.set(item.id, { order, index, item });
  });
  const known = [...seen.entries()]
    .sort(([, a], [, b]) => a.order - b.order || a.index - b.index)
    .map(([id, { item }]) => {
      const name = cleanText(item.name).slice(0, MODULE_NAME_MAX);
      return {
        id,
        name: name || DEFAULT_MODULE_NAMES[id],
        enabled: ALWAYS_ENABLED_MODULE_IDS.includes(id) ? true : item.enabled !== false
      };
    });
  const missing = defaults.filter((module) => !seen.has(module.id)).map(({ id, name, enabled }) => ({ id, name, enabled }));
  return [...known, ...missing].map((module, order) => ({ ...module, order }));
}

function normalizeBranches(rawBranches) {
  const seen = new Set();
  const branches = [];
  for (const item of Array.isArray(rawBranches) ? rawBranches : []) {
    if (!isPlainObject(item)) continue;
    const code = cleanText(item.code).toUpperCase();
    const name = cleanText(item.name).slice(0, BRANCH_NAME_MAX);
    if (!BRANCH_CODE_PATTERN.test(code) || !name || seen.has(code)) continue;
    seen.add(code);
    const header = isPlainObject(item.header) ? Object.fromEntries(["company", "address", "taxId", "phone"].filter((key) => typeof item.header[key] === "string").map((key) => [key, item.header[key].trim().slice(0, HEADER_TEXT_MAX)])) : undefined;
    branches.push({
      code,
      name,
      type: BRANCH_TYPES.includes(item.type) ? item.type : BRANCH_TYPES[1],
      active: item.active !== false,
      ...(header ? { header } : {})
    });
  }
  return branches;
}

function normalizeHeader(rawHeader) {
  const defaults = getDefaultStoreSettings().header;
  const raw = isPlainObject(rawHeader) ? rawHeader : {};
  const text = (key) => (typeof raw[key] === "string" ? raw[key].trim().slice(0, HEADER_TEXT_MAX) : defaults[key]);
  const flag = (key) => (typeof raw[key] === "boolean" ? raw[key] : defaults[key]);
  return {
    company: text("company"),
    address: text("address"),
    taxId: text("taxId"),
    phone: text("phone"),
    showLogo: flag("showLogo"),
    showAddress: flag("showAddress"),
    showSign: flag("showSign")
  };
}

function normalizeDocument(kind, rawDocument) {
  const raw = isPlainObject(rawDocument) ? rawDocument : {};
  const defaults = DEFAULT_DOCUMENTS[kind];
  const prefix = cleanText(raw.prefix).toUpperCase();
  const rawFields = new Map((Array.isArray(raw.fields) ? raw.fields : []).filter(isPlainObject).map((f) => [f.id, f]));
  return {
    title: cleanText(raw.title).slice(0, DOCUMENT_TITLE_MAX) || defaults.title,
    prefix: PREFIX_PATTERN.test(prefix) ? prefix : defaults.prefix,
    pattern: NUMBER_PATTERNS.includes(raw.pattern) ? raw.pattern : "dash",
    digits: Number.isInteger(raw.digits) && raw.digits >= 3 && raw.digits <= 5 ? raw.digits : 4,
    reset: RESET_MODES.includes(raw.reset) ? raw.reset : "none",
    fields: FIELD_DEFINITIONS[kind].map((def) => {
      const item = rawFields.get(def.id) || {};
      const forced = enforceField(
        def,
        typeof item.show === "boolean" ? item.show : true,
        typeof item.required === "boolean" ? item.required : def.defaultRequired
      );
      return {
        id: def.id,
        label: cleanText(item.label).slice(0, FIELD_LABEL_MAX) || def.defaultLabel,
        ...forced
      };
    })
  };
}

export function normalizeStoreSettings(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const documents = isPlainObject(source.documents) ? source.documents : {};
  const settings = {
    version: 1,
    modules: normalizeModules(source.modules),
    branches: Array.isArray(source.branches) ? normalizeBranches(source.branches) : getDefaultStoreSettings().branches,
    staff: Array.isArray(source.staff) ? source.staff.filter((item) => isPlainObject(item) && /^staff_[a-zA-Z0-9-]{1,100}$/.test(item.id) && typeof item.name === "string" && item.name.trim()).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 160), active: item.active !== false })) : [],
    header: normalizeHeader(source.header),
    documents: {
      transfer: normalizeDocument("transfer", documents.transfer),
      audit: normalizeDocument("audit", documents.audit)
    }
  };
  for (const key of ["updatedAt", "updatedBy", "updatedByUid"]) {
    if (typeof source[key] === "string") settings[key] = source[key];
  }
  return settings;
}

export function validateStoreSettings(input) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, message });
  if (!isPlainObject(input)) return { ok: false, errors: [{ path: "", message: "ข้อมูลการตั้งค่าไม่ถูกต้อง" }] };

  // modules: exactly the known ids, once each
  const modules = [];
  const rawModules = Array.isArray(input.modules) ? input.modules : null;
  if (!rawModules) fail("modules", "ข้อมูลโมดูลไม่ถูกต้อง");
  else {
    const seen = new Set();
    rawModules.forEach((item, index) => {
      const path = `modules[${index}]`;
      if (!isPlainObject(item) || !STORE_MODULE_IDS.includes(item.id)) return fail(path, "โมดูลไม่ถูกต้อง");
      if (seen.has(item.id)) return fail(path, "โมดูลซ้ำกัน");
      seen.add(item.id);
      const name = cleanText(item.name);
      if (!name || name.length > MODULE_NAME_MAX) fail(`${path}.name`, "ชื่อโมดูลต้องมี 1–40 ตัวอักษร");
      modules.push({
        id: item.id,
        name,
        enabled: ALWAYS_ENABLED_MODULE_IDS.includes(item.id) ? true : item.enabled === true,
        order: modules.length
      });
    });
    if (STORE_MODULE_IDS.some((id) => !seen.has(id))) fail("modules", "ต้องมีโมดูลครบทุกรายการ");
  }

  // branches
  const branches = [];
  if (!Array.isArray(input.branches)) fail("branches", "ข้อมูลสาขาไม่ถูกต้อง");
  else {
    const seen = new Set();
    input.branches.forEach((item, index) => {
      const path = `branches[${index}]`;
      if (!isPlainObject(item)) return fail(path, "ข้อมูลสาขาไม่ถูกต้อง");
      const code = cleanText(item.code).toUpperCase();
      const name = cleanText(item.name);
      if (!BRANCH_CODE_PATTERN.test(code)) fail(`${path}.code`, "รหัสสาขาต้องเป็นอักษรอังกฤษหรือตัวเลข 2–6 ตัว");
      else if (seen.has(code)) fail(`${path}.code`, `รหัสสาขา ${code} มีอยู่แล้ว`);
      seen.add(code);
      if (!name) fail(`${path}.name`, "กรุณาระบุชื่อสาขา");
      else if (name.length > BRANCH_NAME_MAX) fail(`${path}.name`, "ชื่อสาขาต้องไม่เกิน 60 ตัวอักษร");
      if (!BRANCH_TYPES.includes(item.type)) fail(`${path}.type`, "ประเภทสาขาไม่ถูกต้อง");
      let header;
      if (item.header !== undefined) {
        if (!isPlainObject(item.header)) fail(`${path}.header`, "ข้อมูลหัวเอกสารสาขาไม่ถูกต้อง");
        else {
          header = {};
          for (const key of ["company", "address", "taxId", "phone"]) {
            if (item.header[key] === undefined) continue;
            if (typeof item.header[key] !== "string" || item.header[key].trim().length > HEADER_TEXT_MAX) fail(`${path}.header.${key}`, "ข้อความหัวเอกสารต้องไม่เกิน 200 ตัวอักษร");
            else header[key] = item.header[key].trim();
          }
        }
      }
      branches.push({ code, name, type: item.type, active: item.active !== false, ...(header ? { header } : {}) });
    });
  }

  const staff = [];
  if (input.staff !== undefined && (!Array.isArray(input.staff) || input.staff.length > 100)) fail("staff", "รายชื่อพนักงานไม่ถูกต้อง หรือเกิน 100 คน");
  else {
    const seen = new Set();
    (input.staff || []).forEach((person, index) => {
      if (!isPlainObject(person) || typeof person.id !== "string" || !/^staff_[a-zA-Z0-9-]{1,100}$/.test(person.id) || seen.has(person.id) || typeof person.name !== "string" || !person.name.trim() || person.name.trim().length > 160) { fail(`staff[${index}]`, "ชื่อหรือรหัสพนักงานไม่ถูกต้อง"); return; }
      if (person.active !== undefined && typeof person.active !== "boolean") { fail(`staff[${index}].active`, "สถานะพนักงานไม่ถูกต้อง"); return; }
      seen.add(person.id); staff.push({ id: person.id, name: person.name.trim(), active: person.active !== false });
    });
  }

  // header
  const rawHeader = isPlainObject(input.header) ? input.header : null;
  if (!rawHeader) fail("header", "ข้อมูลหัวเอกสารไม่ถูกต้อง");
  const header = { ...getDefaultStoreSettings().header };
  if (rawHeader) {
    for (const key of ["company", "address", "taxId", "phone"]) {
      const value = rawHeader[key] === undefined ? "" : rawHeader[key];
      if (typeof value !== "string" || value.trim().length > HEADER_TEXT_MAX) {
        fail(`header.${key}`, "ข้อความหัวเอกสารต้องไม่เกิน 200 ตัวอักษร");
      } else header[key] = value.trim();
    }
    for (const key of ["showLogo", "showAddress", "showSign"]) {
      if (typeof rawHeader[key] !== "boolean") fail(`header.${key}`, "ค่าหัวเอกสารไม่ถูกต้อง");
      else header[key] = rawHeader[key];
    }
  }

  // documents
  const documents = {};
  const rawDocuments = isPlainObject(input.documents) ? input.documents : null;
  if (!rawDocuments) fail("documents", "ข้อมูลเอกสารไม่ถูกต้อง");
  const usedPrefixes = new Map();
  for (const kind of DOCUMENT_KINDS) {
    const raw = rawDocuments && isPlainObject(rawDocuments[kind]) ? rawDocuments[kind] : null;
    const base = `documents.${kind}`;
    if (!raw) {
      if (rawDocuments) fail(base, "ข้อมูลเอกสารไม่ถูกต้อง");
      continue;
    }
    const title = cleanText(raw.title);
    if (!title || title.length > DOCUMENT_TITLE_MAX) fail(`${base}.title`, "ชื่อเอกสารต้องมี 1–200 ตัวอักษร");
    const prefix = cleanText(raw.prefix).toUpperCase();
    if (!PREFIX_PATTERN.test(prefix)) fail(`${base}.prefix`, "อักษรนำหน้าต้องเป็นภาษาอังกฤษ 1–6 ตัว");
    else if (usedPrefixes.has(prefix)) fail(`${base}.prefix`, `อักษรนำหน้า ${prefix} ถูกใช้แล้ว`);
    else usedPrefixes.set(prefix, kind);
    if (!NUMBER_PATTERNS.includes(raw.pattern)) fail(`${base}.pattern`, "รูปแบบเลขที่ไม่ถูกต้อง");
    if (!Number.isInteger(raw.digits) || raw.digits < 3 || raw.digits > 5) fail(`${base}.digits`, "จำนวนหลักต้องอยู่ระหว่าง 3–5");
    if (!RESET_MODES.includes(raw.reset)) fail(`${base}.reset`, "รูปแบบการรีเซ็ตเลขไม่ถูกต้อง");

    const fields = [];
    const rawFields = Array.isArray(raw.fields) ? raw.fields : null;
    if (!rawFields) fail(`${base}.fields`, "ข้อมูลช่องไม่ถูกต้อง");
    else {
      const byId = new Map();
      rawFields.forEach((item, index) => {
        const path = `${base}.fields[${index}]`;
        if (!isPlainObject(item) || !FIELD_DEFINITIONS[kind].some((def) => def.id === item.id)) return fail(path, "ช่องข้อมูลไม่ถูกต้อง");
        if (byId.has(item.id)) return fail(path, "ช่องข้อมูลซ้ำกัน");
        byId.set(item.id, item);
      });
      for (const def of FIELD_DEFINITIONS[kind]) {
        const item = byId.get(def.id) || {};
        const label = byId.has(def.id) ? cleanText(item.label) : def.defaultLabel;
        if (!label || label.length > FIELD_LABEL_MAX) fail(`${base}.fields.${def.id}.label`, "ชื่อช่องต้องมี 1–40 ตัวอักษร");
        const forced = enforceField(def, item.show !== false, item.required === true || (!byId.has(def.id) && def.defaultRequired));
        fields.push({ id: def.id, label, ...forced });
      }
    }
    documents[kind] = { title, prefix, pattern: raw.pattern, digits: raw.digits, reset: raw.reset, fields };
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { version: 1, modules, branches, staff, header, documents } };
}

export function getBranchHeader(settings, branchCode) {
  const branch = (settings?.branches || []).find((item) => item.code === branchCode);
  return { ...settings.header, ...branch?.header };
}

export function removedBranchCodes(previous, next) {
  const kept = new Set((next?.branches || []).map((branch) => branch.code));
  return (previous?.branches || []).map((branch) => branch.code).filter((code) => !kept.has(code));
}

export function getEnabledStoreModules(settings) {
  return normalizeModules(settings?.modules).filter((module) => module.enabled);
}

export function isStoreTabAllowed(settings, tabId) {
  return tabId === STORE_SETTINGS_TAB_ID || getEnabledStoreModules(settings).some((module) => module.id === tabId);
}

export function getFirstEnabledStoreTab(settings) {
  return getEnabledStoreModules(settings)[0]?.id || STORE_MODULE_IDS[0];
}

export function resolveStoreDisplayTab(tab, settings) {
  return isStoreTabAllowed(settings, tab) ? tab : getFirstEnabledStoreTab(settings);
}

export function getActiveBranches(settings) {
  return (settings?.branches || []).filter((branch) => branch.active !== false);
}

export function findBranch(settings, code) {
  const key = String(code || "").trim().toUpperCase();
  return (settings?.branches || []).find((branch) => branch.code === key) || null;
}

// ---- Document numbers -------------------------------------------------------------------

export function normalizeDocumentNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

function bangkokTodayKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatDocumentNumber({ prefix, pattern, digits, sequence, branchCode, serviceDate }) {
  const n = String(sequence).padStart(digits, "0");
  if (pattern === "yymm") {
    const key = serviceDate || bangkokTodayKey();
    return `${prefix}${thaiBuddhistYY(key)}${key.slice(5, 7)}-${n}`;
  }
  if (pattern === "branch") return `${prefix}-${normalizeDocumentNumber(branchCode)}-${n}`;
  return `${prefix}-${n}`;
}

export function sampleDocumentNumber(cfg, { sequence = 418, branchCode = "WH", serviceDate } = {}) {
  return formatDocumentNumber({
    prefix: cfg.prefix,
    pattern: cfg.pattern,
    digits: cfg.digits,
    sequence,
    branchCode,
    serviceDate: serviceDate || "2026-10-28"
  });
}

function documentNumberRegex(cfg) {
  const seq = `(\\d{${cfg.digits},${MAX_SEQUENCE_DIGITS}})`;
  if (cfg.pattern === "yymm") return new RegExp(`^${cfg.prefix}\\d{2}(?:0[1-9]|1[0-2])-${seq}$`);
  if (cfg.pattern === "branch") return new RegExp(`^${cfg.prefix}-([A-Z0-9]{2,6})-${seq}$`);
  return new RegExp(`^${cfg.prefix}-${seq}$`);
}

export function validateDocumentNumber(value, cfg, { branchCodes = [] } = {}) {
  const number = normalizeDocumentNumber(value);
  const failure = { ok: false, error: `เลขที่เอกสารต้องอยู่ในรูปแบบ ${sampleDocumentNumber(cfg)}` };
  const match = documentNumberRegex(cfg).exec(number);
  if (!match) return failure;
  if (cfg.pattern === "branch" && !branchCodes.map(normalizeDocumentNumber).includes(match[1])) return failure;
  return { ok: true, number };
}

export function parseDocumentSequence(value, cfg) {
  const match = documentNumberRegex(cfg).exec(normalizeDocumentNumber(value));
  if (!match) return null;
  return Number.parseInt(match[match.length - 1], 10);
}

export function documentPeriodKey(reset, serviceDate) {
  if (reset === "month") return String(serviceDate).slice(0, 7);
  if (reset === "year") return String(serviceDate).slice(0, 4);
  return "all";
}

export function documentRegistryId(kind, number, { reset, serviceDate, pattern }) {
  const period = pattern === "yymm" ? "all" : documentPeriodKey(reset, serviceDate);
  return `${kind}__${period}__${number}`;
}

export function documentCounterId(kind, { reset, serviceDate }) {
  return `${kind}__${documentPeriodKey(reset, serviceDate)}`;
}

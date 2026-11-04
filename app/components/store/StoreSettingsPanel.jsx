"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  ALWAYS_ENABLED_MODULE_IDS,
  BRANCH_TYPES,
  STORE_MODULE_GROUPS,
  validateStoreSettings
} from "../../../lib/storeSettings.js";
import StoreSettingsDocuments from "./StoreSettingsDocuments.jsx";
import "./StoreSettingsPanel.css";

const SETTINGS_URL = "/api/store/settings";
const MODULE_NAME_MAX = 40;
const BRANCH_CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
const META_KEYS = ["updatedAt", "updatedBy", "updatedByUid"];
// Every edit is written to Firestore on its own shortly after the last keystroke.
const AUTOSAVE_DELAY_MS = 800;

// Hard-coded in the UI on purpose: descriptions are not stored in Firestore.
const MODULE_DESCRIPTIONS = {
  "store-booking": "บันทึกเลขใบสั่งจอง ส่งห้องแพ็คตรวจ",
  "store-online": "บันทึกใบขายออนไลน์ ส่งห้องแพ็คตรวจ",
  "store-transfer": "ใบโอนระหว่างสาขา อ้างอิงใบขอโอน และติดตามสินค้าไม่ครบ",
  "store-audit": "ตรวจนับสต็อก สินค้าตรง / ไม่ตรง และเฉลี่ยต่อวัน",
  "store-overview": "แดชบอร์ดรวมทุกโมดูลสโตร์",
  "store-dashboard": "รายงานการขับเคลื่อนประจำวัน รายทีม/รายคน คัดลอกส่ง LINE และวัดผลรายเดือน (แทน KPI สโตร์เดิม)"
};

const TABS = [
  { id: "modules", label: "โมดูล" },
  { id: "branches", label: "สาขา" },
  { id: "staff", label: "พนักงานสโตร์" },
  { id: "docs", label: "หัวเอกสารและรูปแบบ" }
];

const EMPTY_BRANCH = { code: "", name: "", type: BRANCH_TYPES[1] };

const clone = (value) => JSON.parse(JSON.stringify(value));
const groupOf = (moduleId) => STORE_MODULE_GROUPS.find((group) => group.moduleIds.includes(moduleId))?.id;

// Moves a module one step up (-1) or down (+1) among the modules of its own group only,
// then renumbers `order` over the whole list.
export function moveModule(modules, id, direction) {
  const list = modules.slice();
  const from = list.findIndex((item) => item.id === id);
  if (from < 0) return modules;
  let to = from + direction;
  while (to >= 0 && to < list.length && groupOf(list[to].id) !== groupOf(list[from].id)) to += direction;
  if (to < 0 || to >= list.length) return modules;
  [list[from], list[to]] = [list[to], list[from]];
  return list.map((item, order) => ({ ...item, order }));
}

// Returns an error message for a new branch row, or "" when it can be added.
export function validateNewBranch(branches, draft) {
  const code = String(draft?.code ?? "").trim().toUpperCase();
  const name = String(draft?.name ?? "").trim();
  if (!BRANCH_CODE_PATTERN.test(code)) return "รหัสสาขาต้องเป็นอักษรอังกฤษหรือตัวเลข 2–6 ตัว";
  if (branches.some((branch) => branch.code === code)) return `รหัสสาขา ${code} มีอยู่แล้ว`;
  if (!name) return "กรุณาระบุชื่อสาขา";
  return "";
}

export function patchBranchAt(branches, index, patch) {
  return branches.map((item, row) => row === index ? { ...item, ...patch } : item);
}

export function validateBranchCodeChanges(branches, origins, originalBranches) {
  const originalCodes = new Set(originalBranches.map((branch) => branch.code));
  for (let index = 0; index < branches.length; index += 1) {
    const code = String(branches[index].code || "").trim().toUpperCase();
    if (code !== origins[index] && originalCodes.has(code)) return `รหัส ${code} เป็นของสาขาเดิม กรุณาใช้รหัสใหม่ที่ไม่ซ้ำ`;
  }
  return "";
}

async function request(apiFetch, init) {
  try {
    const response = await apiFetch(SETTINGS_URL, { ...init, headers: { "Content-Type": "application/json" } });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok && json.ok !== false, status: response.status, error: json.error || "", data: json.data };
  } catch {
    return { ok: false, status: 0, error: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่", data: undefined };
  }
}

export const unlockStoreSettings = (apiFetch, pin) =>
  request(apiFetch, { method: "POST", body: JSON.stringify({ pin }) });

const stripMeta = (settings) => {
  const body = { ...settings };
  META_KEYS.forEach((key) => delete body[key]);
  return body;
};

// What the server would store for these settings, or null when they cannot be saved yet.
// Equal keys mean there is nothing new to save (blank rows and spacing do not count).
export function settingsSaveKey(settings) {
  const result = validateStoreSettings(stripMeta(settings));
  return result.ok ? JSON.stringify(result.value) : null;
}

export const saveStoreSettings = (apiFetch, { pin, baseUpdatedAt, settings }) =>
  request(apiFetch, { method: "PUT", body: JSON.stringify({ pin, baseUpdatedAt: baseUpdatedAt || "", settings: stripMeta(settings) }) });

const loadStoreSettings = (apiFetch) => request(apiFetch, { method: "GET" });

function Switch({ on, label, disabled, onToggle }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`ss-panel-switch${on ? " is-on" : ""}`} onClick={onToggle}>
      <span className="ss-panel-switch-track" aria-hidden="true"><span className="ss-panel-switch-knob" /></span>
    </button>
  );
}

function WarehouseEditor({ branch, onChange }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const warehouses = branch.warehouses || [];
  const add = () => {
    const value = name.trim();
    if (!value || warehouses.some((item) => item.name.toLowerCase() === value.toLowerCase())) { setError("กรุณาใส่ชื่อคลังที่ไม่ซ้ำในสาขานี้"); return; }
    if (warehouses.length >= 50) { setError("เพิ่มคลังได้ไม่เกิน 50 แห่งต่อสาขา"); return; }
    onChange([...warehouses, { id: `wh_${crypto.randomUUID()}`, name: value, active: true }]);
    setName(""); setError("");
  };
  return <details className="ss-panel-warehouses">
    <summary>จัดการคลัง ({warehouses.filter((item) => item.active).length})</summary>
    {warehouses.map((warehouse) => <div className="ss-panel-warehouse-row" key={warehouse.id}>
      <input aria-label={`ชื่อคลัง ${warehouse.name} ใน ${branch.name}`} maxLength={60} value={warehouse.name} onChange={(event) => onChange(warehouses.map((item) => item.id === warehouse.id ? { ...item, name: event.target.value } : item))} />
      <button type="button" className="secondary" onClick={() => onChange(warehouses.map((item) => item.id === warehouse.id ? { ...item, active: !item.active } : item))}>{warehouse.active ? "ปิดใช้" : "เปิดใช้"}</button>
    </div>)}
    <div className="ss-panel-warehouse-row"><input aria-label={`ชื่อคลังใหม่ ${branch.name}`} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="ชื่อคลังใหม่" /><button type="button" className="secondary" onClick={add}>เพิ่มคลัง</button></div>
    {error && <p role="alert">{error}</p>}
  </details>;
}

function PinGate({ apiFetch, onPinChange }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event) => {
    event.preventDefault();
    const pin = value.trim();
    if (!pin || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const result = await unlockStoreSettings(apiFetch, pin);
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      setValue("");
      onPinChange(pin);
    } else {
      setValue("");
      setError(result.error || "รหัส PIN ไม่ถูกต้อง");
    }
  };

  return (
    <section className="panel ss-panel-lock">
      <h2>ตั้งค่าสโตร์ · ใส่รหัส PIN เพื่อเข้าใช้งาน</h2>
      <form className="ss-panel-lock-form" onSubmit={submit}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="รหัส PIN"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !value.trim()}>ปลดล็อก</button>
      </form>
      {error && <p className="ss-panel-message is-error" role="alert">{error}</p>}
    </section>
  );
}

export default function StoreSettingsPanel({ apiFetch, settings, updatedAt, pin, onPinChange, onSaved }) {
  if (!pin) return <PinGate apiFetch={apiFetch} onPinChange={onPinChange} />;
  return <SettingsEditor apiFetch={apiFetch} settings={settings} updatedAt={updatedAt} pin={pin} onPinChange={onPinChange} onSaved={onSaved} />;
}

function SettingsEditor({ apiFetch, settings, updatedAt, pin, onPinChange, onSaved }) {
  const settingsKey = JSON.stringify(settings);
  const savedKey = useMemo(() => settingsSaveKey(JSON.parse(settingsKey)), [settingsKey]);
  const [draft, setDraft] = useState(() => clone(settings));
  const [savedAt, setSavedAt] = useState("");
  const [blockedKey, setBlockedKey] = useState("");
  const [conflict, setConflict] = useState(false);
  const [tab, setTab] = useState("modules");
  const [newBranch, setNewBranch] = useState(EMPTY_BRANCH);
  const [newStaff, setNewStaff] = useState("");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const branchOrigins = useRef(settings.branches.map((branch) => branch.code));

  const branchError = validateBranchCodeChanges(draft.branches, branchOrigins.current, settings.branches);
  const draftCheck = useMemo(() => validateStoreSettings(stripMeta(draft)), [draft]);
  const pendingKey = draftCheck.ok && !branchError ? JSON.stringify(draftCheck.value) : null;
  const draftError = branchError || (draftCheck.ok ? "" : draftCheck.errors[0]?.message || "ข้อมูลยังไม่ครบ");
  const dirty = pendingKey === null || pendingKey !== savedKey;
  const latest = useRef({});
  latest.current = { draft, pendingKey, savedKey, blockedKey, pin, updatedAt, apiFetch, onSaved };
  const ownSaveKey = useRef("");

  // A fresh copy from outside (reload, someone else's save) replaces the draft. Our own save does not,
  // so typing that continued while it was in flight is kept.
  useEffect(() => {
    const next = JSON.parse(settingsKey);
    const key = settingsSaveKey(next);
    if (key && (key === ownSaveKey.current || key === latest.current.pendingKey)) return;
    branchOrigins.current = next.branches.map((branch) => branch.code);
    setDraft(next);
  }, [settingsKey]);

  // Opening the page always starts from what is in the database, not from the copy loaded at login.
  useEffect(() => {
    let cancelled = false;
    loadStoreSettings(latest.current.apiFetch).then((result) => {
      if (!cancelled && result.ok && result.data?.settings && result.data.updatedAt !== latest.current.updatedAt) latest.current.onSaved(result.data.settings, result.data.updatedAt);
    });
    return () => { cancelled = true; };
  }, []);
  const update = (change) => { setDraft((current) => change(current)); setToast(null); };
  const patchDraft = (patch) => update((current) => ({ ...current, ...patch }));
  const fail = (text) => setToast({ text, tone: "error" });

  const patchModule = (id, patch) => update((current) => ({ ...current, modules: current.modules.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const patchBranch = (index, patch) => update((current) => ({ ...current, branches: patchBranchAt(current.branches, index, patch) }));

  const addBranch = () => {
    const message = validateNewBranch(draft.branches, newBranch);
    if (message) return fail(message);
    branchOrigins.current = [...branchOrigins.current, null];
    update((current) => ({
      ...current,
      branches: [...current.branches, { code: newBranch.code.trim().toUpperCase(), name: newBranch.name.trim(), type: newBranch.type, active: true }]
    }));
    setNewBranch(EMPTY_BRANCH);
  };

  const discard = () => { const next = JSON.parse(settingsKey); branchOrigins.current = next.branches.map((branch) => branch.code); setDraft(next); setBlockedKey(""); setToast(null); };

  const save = async () => {
    if (inFlight.current) return;
    if (draft.modules.some((item) => !item.name.trim() || item.name.trim().length > MODULE_NAME_MAX)) return fail("ชื่อโมดูลต้องมี 1–40 ตัวอักษร");
    if (branchError) return fail(branchError);
    const sent = draft;
    const sentKey = pendingKey;
    inFlight.current = true;
    setBusy(true);
    const result = await saveStoreSettings(apiFetch, { pin, baseUpdatedAt: updatedAt, settings: sent });
    inFlight.current = false;
    setBusy(false);
    if (result.ok) {
      setToast(null);
      setBlockedKey("");
      setConflict(false);
      setSavedAt(result.data.updatedAt || new Date().toISOString());
      branchOrigins.current = sent.branches.map((branch) => String(branch.code || "").trim().toUpperCase());
      ownSaveKey.current = settingsSaveKey(result.data.settings) || "";
      onSaved(result.data.settings, result.data.updatedAt);
    } else if (result.status === 403) {
      onPinChange("");
    } else {
      // Do not retry the same content automatically; the next edit (or the button) tries again.
      setBlockedKey(sentKey || "");
      // 409 also covers a branch code that documents already use; only the stale-copy case needs a reload.
      const stale = result.status === 409 && String(result.error).startsWith("มีผู้อื่นบันทึก");
      setConflict(stale);
      fail(stale ? "มีผู้อื่นบันทึกการตั้งค่าไปก่อน · กด “โหลดข้อมูลล่าสุด” แล้วแก้อีกครั้ง" : result.error || "บันทึกการตั้งค่าไม่สำเร็จ");
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!pendingKey || pendingKey === savedKey || pendingKey === blockedKey || busy) return undefined;
    const timer = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pendingKey, savedKey, blockedKey, busy]);

  // Leaving the page (another tab of the app) still writes a pending change; closing the browser asks first.
  useEffect(() => {
    const warn = (event) => { if (latest.current.pendingKey === null || latest.current.pendingKey !== latest.current.savedKey) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      const { draft: last, pendingKey: key, savedKey: stored, blockedKey: blocked, pin: lastPin, updatedAt: base, apiFetch: fetcher, onSaved: done } = latest.current;
      if (!key || key === stored || key === blocked || inFlight.current) return;
      saveStoreSettings(fetcher, { pin: lastPin, baseUpdatedAt: base, settings: last }).then((result) => { if (result.ok) done(result.data.settings, result.data.updatedAt); });
    };
  }, []);

  const reload = async () => {
    const result = await loadStoreSettings(apiFetch);
    if (!result.ok || !result.data?.settings) return fail(result.error || "โหลดข้อมูลล่าสุดไม่สำเร็จ");
    ownSaveKey.current = "";
    setBlockedKey("");
    setConflict(false);
    setToast(null);
    const next = clone(result.data.settings);
    branchOrigins.current = next.branches.map((branch) => branch.code);
    setDraft(next);
    onSaved(result.data.settings, result.data.updatedAt);
  };

  const timeText = (iso) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const saveStatus = busy
    ? { tone: "busy", text: "กำลังบันทึกลงฐานข้อมูล…" }
    : pendingKey === null
      ? { tone: "error", text: `ยังไม่บันทึก: ${draftError}` }
      : pendingKey === blockedKey
        ? { tone: "error", text: "บันทึกไม่สำเร็จ" }
        : dirty
          ? { tone: "pending", text: "รอบันทึกอัตโนมัติ…" }
          : { tone: "ok", text: savedAt || updatedAt ? `บันทึกลงฐานข้อมูลแล้ว · ${timeText(savedAt || updatedAt)} น.` : "บันทึกลงฐานข้อมูลแล้ว" };

  return (
    <div className="ss-panel">
      <header className="store-report-header ss-panel-header">
        <div>
          <span className="store-report-eyebrow">STORE SETTINGS</span>
          <h2>ตั้งค่าสโตร์</h2>
          <p>จัดการโมดูล สาขา พนักงาน หัวเอกสาร และรูปแบบเลขที่เอกสาร</p>
        </div>
        <div className="ss-panel-actions">
          <span className={`ss-panel-save is-${saveStatus.tone}`} role="status">{saveStatus.text}</span>
          {conflict && <button className="secondary" type="button" onClick={reload} disabled={busy}>โหลดข้อมูลล่าสุด</button>}
          <button className="secondary" type="button" onClick={discard} disabled={busy || !dirty}>ยกเลิกการเปลี่ยนแปลง</button>
          <button className="primary" type="button" onClick={save} disabled={busy || !dirty || pendingKey === null}>บันทึกตอนนี้</button>
        </div>
      </header>

      {toast && <p className={`ss-panel-message ${toast.tone === "ok" ? "is-ok" : "is-error"}`} role={toast.tone === "ok" ? "status" : "alert"}>{toast.text}</p>}

      <div className="ss-panel-tabs" role="tablist" aria-label="หมวดการตั้งค่า">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`ss-panel-tab${tab === item.id ? " is-active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>

      {tab === "modules" && (
        <section className="ss-panel-section" aria-label="โมดูล">
          {STORE_MODULE_GROUPS.map((group) => {
            const items = draft.modules.filter((item) => group.moduleIds.includes(item.id));
            return (
              <div className="ss-panel-group" key={group.id}>
                <div>
                  <h3>{group.title}</h3>
                  <p className="ss-panel-hint">{group.hint}</p>
                </div>
                {items.map((item, index) => {
                  const locked = ALWAYS_ENABLED_MODULE_IDS.includes(item.id);
                  const on = locked || item.enabled;
                  return (
                    <div className={`ss-panel-module${on ? "" : " is-off"}`} key={item.id}>
                      <div className="ss-panel-move">
                        <button type="button" className="secondary" aria-label={`เลื่อน ${item.name} ขึ้น`} disabled={index === 0} onClick={() => update((current) => ({ ...current, modules: moveModule(current.modules, item.id, -1) }))}><ChevronUp size={18} aria-hidden="true" /></button>
                        <button type="button" className="secondary" aria-label={`เลื่อน ${item.name} ลง`} disabled={index === items.length - 1} onClick={() => update((current) => ({ ...current, modules: moveModule(current.modules, item.id, 1) }))}><ChevronDown size={18} aria-hidden="true" /></button>
                      </div>
                      <label className="ss-panel-field ss-panel-module-name">
                        ชื่อที่แสดงในเมนู
                        <input value={item.name} maxLength={MODULE_NAME_MAX} onChange={(event) => patchModule(item.id, { name: event.target.value })} />
                      </label>
                      <div className="ss-panel-module-info">
                        <span>{MODULE_DESCRIPTIONS[item.id]}</span>
                        <span className={`ss-panel-tag${locked ? " is-locked" : ""}`}>{locked ? "ผูกกับห้องแพ็ค · ปิดไม่ได้" : group.title}</span>
                      </div>
                      <div className="ss-panel-module-switch">
                        <span className={`ss-panel-state${on ? " is-on" : ""}`}>{locked ? "เปิดเสมอ" : on ? "เปิดใช้งาน" : "ปิดอยู่"}</span>
                        <Switch on={on} label={`เปิดใช้งาน ${item.name}`} disabled={locked} onToggle={() => patchModule(item.id, { enabled: !item.enabled })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      )}

      {tab === "branches" && (
        <section className="ss-panel-section" aria-label="สาขา">
          <div>
            <h3>สาขาและคลัง</h3>
            <p className="ss-panel-hint">แก้รหัส ชื่อ และประเภทสาขาได้ · สาขาที่มีใบโอนหรือ Audit อ้างอิงแล้วจะเปลี่ยนรหัสหรือลบไม่ได้ เพื่อรักษาข้อมูลเดิม</p>
          </div>
          <div className="store-report-table-wrap ss-panel-table-wrap">
            <table className="ss-panel-table" aria-label="รายการสาขา">
              <thead>
                <tr>
                  <th scope="col">รหัส</th>
                  <th scope="col">ชื่อสาขา</th>
                  <th scope="col">ประเภท</th>
                  <th scope="col">ใช้งาน</th>
                  <th scope="col">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {draft.branches.map((branch, index) => (
                  <tr key={index} className={branch.active ? "" : "is-off"}>
                    <td><input className="ss-panel-upper" aria-label={`รหัสสาขา ${branch.name}`} value={branch.code} maxLength={6} onChange={(event) => patchBranch(index, { code: event.target.value.toUpperCase() })} /></td>
                    <td><input aria-label={`ชื่อสาขา ${branch.code}`} value={branch.name} maxLength={60} onChange={(event) => patchBranch(index, { name: event.target.value })} /></td>
                    <td>
                      <select aria-label={`ประเภทสาขา ${branch.code}`} value={branch.type} onChange={(event) => patchBranch(index, { type: event.target.value })}>
                        {BRANCH_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </td>
                    <td><Switch on={branch.active} label={`เปิดใช้งานสาขา ${branch.code}`} onToggle={() => patchBranch(index, { active: !branch.active })} /></td>
                    <td><WarehouseEditor branch={branch} onChange={(warehouses) => patchBranch(index, { warehouses })} /><button type="button" className="secondary danger" onClick={() => { branchOrigins.current = branchOrigins.current.filter((_, row) => row !== index); update((current) => ({ ...current, branches: current.branches.filter((_, row) => row !== index) })); }}>ลบสาขา</button></td>
                  </tr>
                ))}
                {draft.branches.length === 0 && (
                  <tr><td colSpan={5} className="ss-panel-empty">ยังไม่มีสาขา · เพิ่มสาขาจากแบบฟอร์มด้านล่าง</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="ss-panel-add">
            <label className="ss-panel-field ss-panel-grow-1">
              รหัสสาขา *
              <input className="ss-panel-upper" value={newBranch.code} placeholder="เช่น BR04" maxLength={6} onChange={(event) => setNewBranch({ ...newBranch, code: event.target.value.toUpperCase() })} />
            </label>
            <label className="ss-panel-field ss-panel-grow-2">
              ชื่อสาขา *
              <input value={newBranch.name} placeholder="ชื่อที่จะแสดงในเอกสาร" maxLength={60} onChange={(event) => setNewBranch({ ...newBranch, name: event.target.value })} />
            </label>
            <label className="ss-panel-field ss-panel-grow-1">
              ประเภท
              <select value={newBranch.type} onChange={(event) => setNewBranch({ ...newBranch, type: event.target.value })}>
                {BRANCH_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <button className="primary" type="button" onClick={addBranch}>+ เพิ่มสาขา</button>
          </div>
        </section>
      )}

      {tab === "staff" && (
        <section className="ss-panel-section" aria-label="พนักงานสโตร์">
          <div><h3>รายชื่อพนักงานสโตร์</h3><p className="ss-panel-hint">ชื่อสำหรับเลือกผู้จัดใบโอนและรายงานรายบุคคล ไม่ใช่บัญชีเข้าสู่ระบบ · เมื่อเอาชื่อออก ระบบเก็บประวัติงานเดิมไว้</p></div>
          <div className="store-report-table-wrap ss-panel-table-wrap"><table className="ss-panel-table" aria-label="รายชื่อพนักงานสโตร์"><thead><tr><th>ชื่อ</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
            {(draft.staff || []).map((person) => <tr key={person.id} className={person.active ? "" : "is-off"}><td><input aria-label={`ชื่อพนักงาน ${person.name}`} maxLength={160} value={person.name} onChange={(event) => update((current) => ({ ...current, staff: current.staff.map((item) => item.id === person.id ? { ...item, name: event.target.value } : item) }))} /></td><td>{person.active ? "ใช้งาน" : "เอาออกแล้ว"}</td><td><button type="button" className="secondary" onClick={() => update((current) => ({ ...current, staff: current.staff.map((item) => item.id === person.id ? { ...item, active: !item.active } : item) }))}>{person.active ? "เอาชื่อออก" : "นำกลับมาใช้"}</button></td></tr>)}
            {!draft.staff?.length && <tr><td colSpan={3} className="ss-panel-empty">ยังไม่มีรายชื่อที่เพิ่ม</td></tr>}
          </tbody></table></div>
          <div className="ss-panel-add"><label className="ss-panel-field ss-panel-grow-2">ชื่อพนักงาน<input maxLength={160} value={newStaff} onChange={(event) => setNewStaff(event.target.value)} /></label><button type="button" className="primary" onClick={() => { const name = newStaff.trim(); if (!name) return fail("กรุณาระบุชื่อพนักงาน"); if ((draft.staff || []).length >= 100) return fail("รายชื่อพนักงานเกิน 100 คน"); update((current) => ({ ...current, staff: [...(current.staff || []), { id: `staff_${crypto.randomUUID()}`, name, active: true }] })); setNewStaff(""); }}>+ เพิ่มพนักงาน</button></div>
        </section>
      )}
      {tab === "docs" && <StoreSettingsDocuments draft={draft} onPatch={patchDraft} />}
    </div>
  );
}

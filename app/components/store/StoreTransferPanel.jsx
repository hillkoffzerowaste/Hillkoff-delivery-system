"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, TriangleAlert } from "lucide-react";
import { bangkokDateKey } from "../../../lib/operationsReporting.js";
import { bangkokTimeHHmm, thaiDateLabel } from "../../../lib/storeFormat.js";
import { getActiveBranches, sampleDocumentNumber } from "../../../lib/storeSettings.js";
import {
  REQUEST_REF_SAMPLE,
  filterTransfers,
  isBlankTransferRow,
  sortTransfersForDisplay,
  summarizeTransfers,
  transferStatus,
  validateTransferRow
} from "../../../lib/storeTransfers.js";
import "./StoreTransferPanel.css";

export const TRANSFER_DRAFT_KEY = "store-transfer-draft";
const MAX_ROWS = 50;
const NO_BRANCH_TEXT = "ยังไม่มีสาขา · ไปที่ตั้งค่าสโตร์ > สาขา เพื่อเพิ่ม";
const STATUS_LABELS = { complete: "สินค้าครบ", open: "ไม่ครบ · ยังไม่แก้ไข", resolved: "ไม่ครบ · แก้ไขแล้ว" };
const CHIPS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "open", label: "ยังไม่แก้ไข" },
  { key: "resolved", label: "แก้ไขแล้ว" },
  { key: "complete", label: "สินค้าครบ" }
];
// Locked fields that the preview shows without a required star.
const NO_STAR_FIELDS = ["from", "to", "receipt"];

let draftCounter = 0;
const newDraft = () => ({ key: `d${(draftCounter += 1)}`, transferNumber: "", requestRef: "", fromBranchCode: "", toBranchCode: "", preparerUid: "", receipt: "complete", note: "" });

function fieldMap(settings) {
  const fields = settings?.documents?.transfer?.fields || [];
  return Object.fromEntries(fields.map((item) => [item.id, item]));
}

function labelOf(fields, id, fallback) {
  const item = fields[id];
  const text = item?.label || fallback;
  return item?.required && !NO_STAR_FIELDS.includes(id) ? `${text} *` : text;
}

// Empty branch selections mean "first / second active branch", like the preview's defaults.
function effectiveRow(draft, branches, staff) {
  const preparer = staff.find((person) => person.uid === draft.preparerUid);
  return {
    transferNumber: draft.transferNumber,
    requestRef: draft.requestRef,
    fromBranchCode: draft.fromBranchCode || branches[0]?.code || "",
    toBranchCode: draft.toBranchCode || branches[1]?.code || "",
    preparerUid: preparer ? preparer.uid : "",
    preparerName: preparer ? preparer.name : "",
    receipt: draft.receipt,
    note: draft.note
  };
}

function rowFromItem(item) {
  return {
    key: item.id,
    transferNumber: item.transferNumber || "",
    requestRef: item.requestRef || "",
    fromBranchCode: item.fromBranchCode || "",
    toBranchCode: item.toBranchCode || "",
    preparerUid: item.preparerUid || "",
    receipt: item.receipt || "complete",
    note: item.note || ""
  };
}

async function request(apiFetch, url, init) {
  const response = await apiFetch(url, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(json.error || "ดำเนินการไม่สำเร็จ");
  return json.data;
}

const jsonInit = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function TransferFields({ row, onChange, branches, staff, fields, sample, idPrefix }) {
  const incomplete = row.receipt === "incomplete";
  const missingNote = incomplete && !row.note.trim();
  const value = effectiveRow(row, branches, staff);
  const branchOptions = branches.map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>);
  const noteVisible = fields.note?.show !== false || incomplete;
  const noteLabel = incomplete ? `${fields.note?.label || "หมายเหตุสินค้าไม่ครบ"} *` : "หมายเหตุ";
  return (
    <div className="st-fields">
      <label className="st-field st-field-no">{labelOf(fields, "no", "เลขที่ใบโอน")}
        <input id={`${idPrefix}-no`} value={row.transferNumber} onChange={(event) => onChange({ transferNumber: event.target.value })} placeholder={sample} autoComplete="off" />
      </label>
      {fields.ref?.show !== false && (
        <label className="st-field st-field-ref">{labelOf(fields, "ref", "อ้างอิงใบขอโอน")}
          <input value={row.requestRef} onChange={(event) => onChange({ requestRef: event.target.value })} placeholder="RQ-0395" autoComplete="off" />
        </label>
      )}
      <label className="st-field">{labelOf(fields, "from", "ต้นทาง")}
        <select value={value.fromBranchCode} onChange={(event) => onChange({ fromBranchCode: event.target.value })}>{branchOptions}</select>
      </label>
      <label className="st-field">{labelOf(fields, "to", "ปลายทาง")}
        <select value={value.toBranchCode} onChange={(event) => onChange({ toBranchCode: event.target.value })}>{branchOptions}</select>
      </label>
      {fields.preparer?.show !== false && (
        <label className="st-field">{labelOf(fields, "preparer", "ผู้จัดใบโอน")}
          <select value={row.preparerUid} onChange={(event) => onChange({ preparerUid: event.target.value })}>
            <option value="">เลือกผู้จัด</option>
            {staff.map((person) => <option key={person.uid} value={person.uid}>{person.name}</option>)}
          </select>
        </label>
      )}
      <label className="st-field">{labelOf(fields, "receipt", "ผลรับสินค้า")}
        <select value={row.receipt} onChange={(event) => onChange({ receipt: event.target.value })}>
          <option value="complete">ครบ</option>
          <option value="incomplete">ไม่ครบ</option>
        </select>
      </label>
      {noteVisible && (
        <label className={`st-field st-field-note${incomplete ? " is-required" : ""}`}>{noteLabel}
          <input className={missingNote ? "is-invalid" : ""} value={row.note} onChange={(event) => onChange({ note: event.target.value })} placeholder={incomplete ? "ระบุสินค้าที่ขาด / จำนวน" : "ไม่บังคับ"} />
        </label>
      )}
    </div>
  );
}

export default function StoreTransferPanel({ apiFetch, settings, profile, onUnresolvedChange, onNavigate }) {
  const cfg = settings?.documents?.transfer;
  const fields = useMemo(() => fieldMap(settings), [settings]);
  const branches = useMemo(() => getActiveBranches(settings), [settings]);
  const sample = cfg ? sampleDocumentNumber(cfg) : "TR-0418";
  const today = useMemo(() => bangkokDateKey(), []);
  const title = (settings?.modules || []).find((module) => module.id === "store-transfer")?.name || "ใบโอนสินค้า";

  const [date, setDate] = useState(today);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total: 0, complete: 0, open: 0, resolved: 0, incomplete: 0 });
  const [alerts, setAlerts] = useState({ count: 0, items: [] });
  const [staff, setStaff] = useState([]);
  const [drafts, setDrafts] = useState(() => [newDraft()]);
  const [view, setView] = useState("day");
  const [status, setStatus] = useState("all");
  const [branchCode, setBranchCode] = useState("all");
  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState([]);
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const busyRef = useRef(false);
  const loadSeq = useRef(0);
  const notifyRef = useRef(onUnresolvedChange);
  useEffect(() => { notifyRef.current = onUnresolvedChange; }, [onUnresolvedChange]);

  const loadDay = useCallback(async () => {
    const seq = (loadSeq.current += 1);
    setLoading(true);
    try {
      const data = await request(apiFetch, `/api/store/transfers?date=${date}`);
      if (seq !== loadSeq.current) return;
      setItems(data.items || []);
      setSummary(data.summary || summarizeTransfers(data.items));
    } catch (error) {
      if (seq === loadSeq.current) setToast({ text: error.message, tone: "error" });
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [apiFetch, date]);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await request(apiFetch, "/api/store/transfers?alerts=true");
      setAlerts({ count: data.count || 0, items: data.items || [] });
      notifyRef.current?.(data.count || 0);
    } catch {
      // The banner is advisory; a failed refresh keeps the previous count.
    }
  }, [apiFetch]);

  const [searchTick, setSearchTick] = useState(0);
  const refresh = useCallback(() => {
    setSearchTick((tick) => tick + 1);
    return Promise.all([loadDay(), loadAlerts()]);
  }, [loadDay, loadAlerts]);

  useEffect(() => { void loadDay(); }, [loadDay]);
  useEffect(() => { void loadAlerts(); }, [loadAlerts]);
  useEffect(() => {
    let cancelled = false;
    request(apiFetch, "/api/store/staff").then((data) => { if (!cancelled) setStaff(Array.isArray(data) ? data : []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [apiFetch]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(TRANSFER_DRAFT_KEY) || "null");
      if (Array.isArray(saved) && saved.length) {
        setDrafts(saved.slice(0, MAX_ROWS).map((row) => {
          const fresh = newDraft();
          const text = (name) => (typeof row?.[name] === "string" ? row[name] : fresh[name]);
          return { ...fresh, transferNumber: text("transferNumber"), requestRef: text("requestRef"), fromBranchCode: text("fromBranchCode"), toBranchCode: text("toBranchCode"), preparerUid: text("preparerUid"), receipt: row?.receipt === "incomplete" ? "incomplete" : "complete", note: text("note") };
        }));
      }
    } catch {
      // A corrupt draft is simply ignored.
    }
  }, []);
  useEffect(() => {
    const text = query.trim();
    if (!text) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      request(apiFetch, `/api/store/transfers?q=${encodeURIComponent(text)}`)
        .then((data) => { if (!cancelled) setSearchItems(data.items || []); })
        .catch((error) => { if (!cancelled) setToast({ text: error.message, tone: "error" }); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [apiFetch, query, searchTick]);

  const searching = Boolean(query.trim());
  const baseRows = searching ? searchItems : view === "alerts" ? alerts.items : items;
  const baseSummary = useMemo(() => summarizeTransfers(baseRows), [baseRows]);
  const visibleRows = useMemo(
    () => sortTransfersForDisplay(filterTransfers(baseRows, { status, branchCode })),
    [baseRows, status, branchCode]
  );
  const chipCounts = { all: baseSummary.total, open: baseSummary.open, resolved: baseSummary.resolved, complete: baseSummary.complete };

  const updateDraft = (key, patch) => {
    setToast(null);
    setDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const removeDraft = (key) => setDrafts((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : [newDraft()]));
  const addDraft = () => setDrafts((rows) => (rows.length >= MAX_ROWS ? rows : [...rows, newDraft()]));

  // Runs one request at a time; a second click while one is in flight is dropped.
  const run = async (name, action) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(name);
    try {
      await action();
      return true;
    } catch (error) {
      setToast({ text: error.message, tone: "error" });
      return false;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const saveDraft = () => {
    try {
      window.sessionStorage.setItem(TRANSFER_DRAFT_KEY, JSON.stringify(drafts));
      setToast({ text: "บันทึกร่างแล้ว · ยังไม่ส่งยืนยัน", tone: "warn" });
    } catch {
      setToast({ text: "เบราว์เซอร์นี้ไม่อนุญาตให้บันทึกร่าง", tone: "error" });
    }
  };

  const confirmDrafts = () => run("confirm", async () => {
    const rows = drafts.map((draft) => effectiveRow(draft, branches, staff)).filter((row) => !isBlankTransferRow(row));
    if (!rows.length) { setToast({ text: "ยังไม่มีรายการให้ยืนยัน", tone: "warn" }); return; }
    for (const row of rows) {
      const checked = validateTransferRow(row, { settings, profile });
      if (!checked.ok) { setToast({ text: checked.error, tone: "error" }); return; }
    }
    const saved = await request(apiFetch, "/api/store/transfers", jsonInit("POST", { rows }));
    setDrafts([newDraft()]);
    try { window.sessionStorage.removeItem(TRANSFER_DRAFT_KEY); } catch { /* ignore */ }
    setToast({ text: `ยืนยันใบโอน ${saved.length} รายการแล้ว`, tone: "ok" });
    await refresh();
  });

  const submitResolve = () => run("resolve", async () => {
    const text = panel.text.trim();
    if (!text) { setToast({ text: "กรุณาระบุวิธีแก้ไข / ผลการดำเนินการ", tone: "error" }); return; }
    await request(apiFetch, "/api/store/transfers", jsonInit("PATCH", { id: panel.id, action: "resolve", text }));
    setPanel(null);
    setToast({ text: "บันทึกการแก้ไขแล้ว", tone: "ok" });
    await refresh();
  });

  const reopen = (item) => run(`reopen:${item.id}`, async () => {
    await request(apiFetch, "/api/store/transfers", jsonInit("PATCH", { id: item.id, action: "reopen" }));
    setToast({ text: `เปิดเรื่อง ${item.transferNumber} ใหม่แล้ว`, tone: "ok" });
    await refresh();
  });

  const submitEdit = () => run("edit", async () => {
    const reason = panel.reason.trim();
    if (!reason) { setToast({ text: "กรุณาระบุเหตุผลในการแก้ไข", tone: "error" }); return; }
    const row = effectiveRow(panel.row, branches, staff);
    if (!panel.row.preparerUid) { row.preparerUid = panel.original.preparerUid; row.preparerName = panel.original.preparerName; }
    const checked = validateTransferRow(row, { settings, profile, keepBranchCodes: [panel.original.fromBranchCode, panel.original.toBranchCode] });
    if (!checked.ok) { setToast({ text: checked.error, tone: "error" }); return; }
    await request(apiFetch, "/api/store/transfers", jsonInit("PUT", { id: panel.id, reason, ...row }));
    setPanel(null);
    setToast({ text: "บันทึกการแก้ไขใบโอนแล้ว", tone: "ok" });
    await refresh();
  });

  const submitDelete = () => run("delete", async () => {
    const reason = panel.reason.trim();
    if (!reason) { setToast({ text: "กรุณาระบุเหตุผลในการลบ", tone: "error" }); return; }
    await request(apiFetch, "/api/store/transfers", jsonInit("DELETE", { id: panel.id, reason }));
    setPanel(null);
    setToast({ text: `ลบใบโอน ${panel.transferNumber} แล้ว`, tone: "ok" });
    await refresh();
  });

  const showOpen = () => { setView("alerts"); setStatus("open"); setQuery(""); setBranchCode("all"); };
  const pickDate = (value) => { if (!value) return; setDate(value); setView("day"); setQuery(""); };
  const startEdit = (item) => {
    const base = rowFromItem(item);
    const stillStaff = staff.some((person) => person.uid === base.preparerUid);
    setPanel({ kind: "edit", id: item.id, original: item, row: stillStaff ? base : { ...base, preparerUid: "" }, reason: "" });
  };
  const patchEditRow = (patch) => setPanel((current) => ({ ...current, row: { ...current.row, ...patch } }));
  const canManage = (item) => !item.deletedAt && Boolean(profile?.uid) && item.createdByUid === profile.uid;
  const inFlight = Boolean(busy);

  return (
    <div className="store-report-workspace st-workspace">
      <header className="store-report-header">
        <div>
          <span className="store-report-eyebrow">STORE OPERATIONS · โมดูลเสริม</span>
          <h2>{title}</h2>
          <p>บันทึกใบโอนระหว่างสาขา อ้างอิงใบขอโอน และติดตามกรณีสินค้าไม่ครบจนแก้ไขเสร็จ</p>
        </div>
        <div className="store-report-header-tools">
          <label className="store-report-date">วันที่รายงาน
            <input type="date" value={date} onChange={(event) => pickDate(event.target.value)} />
          </label>
        </div>
      </header>

      {alerts.count > 0 && (
        <section className="st-alert" aria-label="ใบโอนที่ยังไม่แก้ไข">
          <TriangleAlert size={20} aria-hidden="true" />
          <div>
            <b>มีใบโอนสินค้าไม่ครบที่ยังไม่แก้ไข {alerts.count} รายการ</b>
            <small>รวมงานข้ามวัน · เรียงงานเก่าก่อน เพื่อเร่งติดตาม</small>
          </div>
          <button type="button" className="secondary" onClick={showOpen}>ดูรายการค้าง</button>
        </section>
      )}

      <div className="store-report-kpis st-kpis">
        <article><span>ใบโอนทั้งหมด</span><strong>{summary.total}</strong><small>วันที่ {thaiDateLabel(date).replace(/^\S+ /, "")}</small></article>
        <article className="st-kpi-complete"><span>สินค้าครบ</span><strong>{summary.complete}</strong><small>รับครบตามใบโอน</small></article>
        <article className="st-kpi-open"><span>ไม่ครบ · ยังไม่แก้ไข</span><strong>{summary.open}</strong><small>ต้องติดตาม</small></article>
        <article className="st-kpi-resolved"><span>ไม่ครบ · แก้ไขแล้ว</span><strong>{summary.resolved}</strong><small>ปิดเรื่องพร้อมวิธีแก้ไข</small></article>
      </div>

      <section className="panel st-form" aria-label="เพิ่มรายการใบโอน">
        <div className="panel-head">
          <h2>เพิ่มรายการใบโอน</h2>
          <span>เลขที่ใบโอนรูปแบบ {sample} · เปลี่ยนรูปแบบได้ที่หน้าตั้งค่าสโตร์</span>
        </div>
        {!branches.length ? (
          <p className="st-empty-branches" role="status">
            {NO_BRANCH_TEXT}
            {onNavigate && <button type="button" className="secondary" onClick={() => onNavigate("store-settings")}>ไปที่ตั้งค่าสโตร์</button>}
          </p>
        ) : drafts.map((draft, index) => (
          <div className="st-draft-row" key={draft.key}>
            <TransferFields row={draft} onChange={(patch) => updateDraft(draft.key, patch)} branches={branches} staff={staff} fields={fields} sample={sample} idPrefix={`st-draft-${index}`} />
            <button type="button" className="secondary st-icon-button" aria-label="ลบแถวนี้" onClick={() => removeDraft(draft.key)}><Trash2 size={18} aria-hidden="true" /></button>
          </div>
        ))}
        <div className="store-report-actions st-form-actions">
          <button type="button" className="secondary" onClick={addDraft} disabled={drafts.length >= MAX_ROWS || !branches.length}>+ เพิ่มรายการ</button>
          <div>
            <button type="button" className="secondary" onClick={saveDraft} disabled={!branches.length}>บันทึกร่าง</button>
            <button type="button" className="primary" onClick={confirmDrafts} disabled={inFlight || !branches.length}>{busy === "confirm" ? "กำลังบันทึก..." : "ยืนยันรายการ"}</button>
          </div>
        </div>
        {toast && <p className={`st-toast is-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>{toast.text}</p>}
      </section>

      <div className="st-filters">
        <label className="store-report-search">
          <Search size={17} aria-hidden="true" />
          <input aria-label="ค้นหาใบโอน" value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setSearchItems([]); }} placeholder="ค้นหาเลขใบโอน / ใบขอโอน / หมายเหตุ" />
        </label>
        <div className="st-chips" role="group" aria-label="กรองตามสถานะ">
          {CHIPS.map((chip) => (
            <button type="button" key={chip.key} className="st-chip" aria-pressed={status === chip.key} onClick={() => setStatus(chip.key)}>{chip.label} · {chipCounts[chip.key]}</button>
          ))}
        </div>
        <label className="st-branch-filter">สาขา
          <select value={branchCode} onChange={(event) => setBranchCode(event.target.value)}>
            <option value="all">ทุกสาขา</option>
            {(settings?.branches || []).map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>)}
          </select>
        </label>
      </div>
      {view === "alerts" && !searching && (
        <p className="st-view-note">แสดงใบโอนที่ยังไม่แก้ไขทุกวัน <button type="button" className="secondary" onClick={() => { setView("day"); setStatus("all"); }}>กลับไปดูตามวันที่</button></p>
      )}

      {panel?.kind === "resolve" && (
        <section className="st-panel is-resolve" aria-label="บันทึกการแก้ไข">
          <div>
            <b>บันทึกการแก้ไข · {panel.transferNumber}</b>
            <div className="st-problem">ปัญหาที่แจ้ง: {panel.note}</div>
          </div>
          <label className="st-field">วิธีแก้ไข / ผลการดำเนินการ *
            <textarea rows={3} value={panel.text} onChange={(event) => setPanel({ ...panel, text: event.target.value })} placeholder="เช่น ส่งสินค้าเพิ่มรอบบ่ายด้วยใบโอน TR-0419" />
          </label>
          <div className="st-panel-actions">
            <button type="button" className="secondary" onClick={() => setPanel(null)} disabled={inFlight}>ยกเลิก</button>
            <button type="button" className="primary" onClick={submitResolve} disabled={inFlight}>{busy === "resolve" ? "กำลังบันทึก..." : "ยืนยันว่าแก้ไขแล้ว"}</button>
          </div>
        </section>
      )}

      {panel?.kind === "edit" && (
        <section className="st-panel is-edit" aria-label="แก้ไขใบโอน">
          <b>แก้ไขใบโอน · {panel.original.transferNumber}</b>
          <TransferFields row={panel.row} onChange={patchEditRow} branches={getActiveBranchesWith(settings, panel.original)} staff={staff} fields={fields} sample={sample} idPrefix="st-edit" />
          <label className="st-field">เหตุผลในการแก้ไข *
            <input value={panel.reason} onChange={(event) => setPanel({ ...panel, reason: event.target.value })} placeholder="ระบุเหตุผล" />
          </label>
          <div className="st-panel-actions">
            <button type="button" className="secondary" onClick={() => setPanel(null)} disabled={inFlight}>ยกเลิก</button>
            <button type="button" className="primary" onClick={submitEdit} disabled={inFlight}>{busy === "edit" ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button>
          </div>
        </section>
      )}

      {panel?.kind === "delete" && (
        <section className="st-panel is-delete" aria-label="ลบใบโอน">
          <b>ลบใบโอน · {panel.transferNumber}</b>
          <label className="st-field">เหตุผลในการลบ *
            <input value={panel.reason} onChange={(event) => setPanel({ ...panel, reason: event.target.value })} placeholder="ระบุเหตุผล" />
          </label>
          <div className="st-panel-actions">
            <button type="button" className="secondary" onClick={() => setPanel(null)} disabled={inFlight}>ยกเลิก</button>
            <button type="button" className="primary st-danger" onClick={submitDelete} disabled={inFlight}>{busy === "delete" ? "กำลังลบ..." : "ยืนยันลบ"}</button>
          </div>
        </section>
      )}

      <div className="st-table-wrap">
        <table className="st-table" aria-label="รายการใบโอน">
          <thead>
            <tr>
              <th scope="col">เลขที่ใบโอน</th>
              <th scope="col">อ้างอิงใบขอโอน</th>
              <th scope="col">ต้นทาง → ปลายทาง</th>
              <th scope="col">ผู้จัดใบโอน / หมายเหตุ</th>
              <th scope="col">เวลา / ผู้บันทึก</th>
              <th scope="col">สถานะ</th>
              <th scope="col">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((item) => {
              const state = transferStatus(item);
                            return (
                <tr key={item.id} className={`st-row is-${state}${panel?.id === item.id ? " is-active" : ""}`}>
                  <td><b>{item.transferNumber}</b></td>
                  <td className={item.requestRef ? "" : "st-muted"}>{item.requestRef || "ไม่มีอ้างอิง"}</td>
                  <td className="st-route">{item.fromBranchName} → {item.toBranchName}</td>
                  <td className="st-detail">
                    <div>{item.preparerName}</div>
                    {item.note && <div className="st-problem">หมายเหตุ: {item.note}</div>}
                    {state === "resolved" && item.resolution && (
                      <div className="st-resolution">แก้ไข: {item.resolution.text} · {item.resolution.byName} {bangkokTimeHHmm(item.resolution.at)} น.</div>
                    )}
                  </td>
                  <td>
                    <div>{bangkokTimeHHmm(item.createdAt)} น.</div>
                    {item.serviceDate && item.serviceDate !== date && <div className="st-muted">{thaiDateLabel(item.serviceDate)}</div>}
                    <div className="st-muted">{item.createdBy}</div>
                  </td>
                  <td><span className={`st-status is-${state}`}>{STATUS_LABELS[state]}</span></td>
                  <td>
                    <div className="st-row-actions">
                      {state === "open" && <button type="button" className="secondary" disabled={inFlight} onClick={() => setPanel({ kind: "resolve", id: item.id, transferNumber: item.transferNumber, note: item.note, text: "" })}>บันทึกการแก้ไข</button>}
                      {state === "resolved" && <button type="button" className="secondary" disabled={inFlight} onClick={() => reopen(item)}>เปิดเรื่องใหม่</button>}
                      {state === "complete" && <span className="st-muted">—</span>}
                      {canManage(item) && <button type="button" className="secondary" disabled={inFlight} onClick={() => startEdit(item)}>แก้ไข</button>}
                      {canManage(item) && <button type="button" className="secondary" disabled={inFlight} onClick={() => setPanel({ kind: "delete", id: item.id, transferNumber: item.transferNumber, reason: "" })}>ลบ</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visibleRows.length && <p className="st-no-rows">{loading ? "กำลังโหลด..." : "ไม่มีรายการตามตัวกรองที่เลือก"}</p>}
      </div>
    </div>
  );
}

// The edit form must still offer a branch that was deactivated after the document was created.
function getActiveBranchesWith(settings, original) {
  const active = getActiveBranches(settings);
  const extra = (settings?.branches || []).filter((branch) => [original.fromBranchCode, original.toBranchCode].includes(branch.code) && !active.some((a) => a.code === branch.code));
  return [...active, ...extra];
}

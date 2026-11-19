"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { addDaysToDateKey, thaiDateLabel } from "../../../lib/storeFormat.js";
import { bangkokDateOf } from "../../../lib/storeDailyReport.js";
import { CLAIM_KINDS, IMPORT_DOCUMENT_MAX, PRODUCTION_COLUMNS, parseAmount, parseClaimPaste, parseProductionPaste, sameProductionRecord, storeMainBranches, typedAmount, validateClaimDocument, validateProductionRecord } from "../../../lib/storeClaimsProduction.js";
import "./StoreRecordsPanels.css";

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d }));
const money = (n) => fmt(n, 2);
const shortDate = (key) => { const [, d, m, y] = thaiDateLabel(key).split(" "); return d ? `${d} ${m} ${String(y).slice(2)}` : key; };
const newRequestId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const activeBranches = (settings) => storeMainBranches(settings?.branches);

async function callApi(apiFetch, url, method, body) {
  const res = await apiFetch(url, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error || "ทำรายการไม่สำเร็จ");
  return json.data;
}

function useRange(today) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDaysToDateKey(monthStart, -1);
  const presets = [["เดือนนี้", monthStart, today], ["เดือนก่อน", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd], ["30 วัน", addDaysToDateKey(today, -29), today]];
  const [range, setRange] = useState({ from: monthStart, to: today });
  return { range, setRange, presets };
}

function RangeBar({ range, setRange, presets, busy, onRefresh }) {
  const [draft, setDraft] = useState(range);
  useEffect(() => { setDraft(range); }, [range]);
  return <form className="srp-range" onSubmit={(e) => { e.preventDefault(); if (draft.from && draft.to && draft.from <= draft.to) setRange({ ...draft }); }} aria-label="ช่วงวันที่">
    {presets.map(([label, from, to]) => <button type="button" key={label} aria-pressed={range.from === from && range.to === to} onClick={() => setRange({ from, to })}>{label}</button>)}
    <label>ตั้งแต่<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
    <label>ถึง<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
    <button type="submit">ดูช่วงนี้</button>
    <button type="button" onClick={onRefresh} disabled={busy}>{busy ? "กำลังโหลด…" : "รีเฟรช"}</button>
  </form>;
}

// Editable product lines. columns: [{ key, label, type: "text"|"number", width }]
function ItemsEditor({ items, setItems, columns, computed }) {
  const update = (index, key, value) => setItems(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return <div className="srp-items">
    <div className="srp-table-wrap"><table className="srp-table">
      <thead><tr><th>#</th>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{computed && <th className="num">{computed.label}</th>}<th aria-label="ลบ" /></tr></thead>
      <tbody>{items.map((item, index) => <tr key={item.rowId}>
        <td>{index + 1}</td>
        {columns.map((c) => <td key={c.key}><input aria-label={`${c.label} รายการที่ ${index + 1}`} inputMode={c.type === "number" ? "decimal" : undefined} value={item[c.key] ?? ""} placeholder={c.placeholder || ""} style={{ minWidth: c.width || 80 }} onChange={(e) => update(index, c.key, e.target.value)} /></td>)}
        {computed && <td className="num">{computed.value(item)}</td>}
        <td><button type="button" className="srp-icon" aria-label={`ลบรายการที่ ${index + 1}`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>×</button></td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" className="srp-secondary" onClick={() => setItems([...items, { rowId: newRequestId() }])}>+ เพิ่มรายการ</button>
  </div>;
}

function PasteBox({ columns, value, setValue, onCheck, hint }) {
  return <div className="srp-paste">
    <p>คัดลอกแถวจาก Excel / รายงาน ERP แล้ววางในช่องนี้ (แถวหัวตารางข้ามให้อัตโนมัติ) · ลำดับคอลัมน์:</p>
    <ol className="srp-columns">{columns.map((c) => <li key={c}>{c}</li>)}</ol>
    {hint && <p className="srp-muted">{hint}</p>}
    <textarea aria-label="วางข้อมูลจาก Excel" rows={7} value={value} onChange={(e) => setValue(e.target.value)} placeholder="วางข้อมูลที่นี่ (Ctrl+V)" />
    <button type="button" className="srp-secondary" onClick={onCheck} disabled={!value.trim()}>ตรวจข้อมูลที่วาง</button>
  </div>;
}

function Errors({ errors }) {
  if (!errors.length) return null;
  return <ul className="srp-errors" role="alert">{errors.slice(0, 20).map((e, i) => <li key={i}>{e.line ? `บรรทัด ${e.line}: ` : ""}{e.message}</li>)}{errors.length > 20 && <li>และอีก {errors.length - 20} รายการ</li>}</ul>;
}

function DeleteButton({ label, onDelete }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="srp-danger-link" onClick={() => setOpen(true)}>ลบ</button>;
  return <span className="srp-delete">
    <input aria-label={`เหตุผลที่ลบ ${label}`} placeholder="เหตุผลที่ลบ" value={reason} onChange={(e) => setReason(e.target.value)} />
    <button type="button" className="srp-danger" disabled={!reason.trim()} onClick={() => onDelete(reason.trim())}>ยืนยันลบ</button>
    <button type="button" className="srp-link" onClick={() => setOpen(false)}>ยกเลิก</button>
  </span>;
}

const emptyClaimForm = (kind, today) => ({ kind, documentNumber: "", serviceDate: today, branchCode: "", reason: "", requester: "", supplier: "", note: "", items: [{ rowId: newRequestId() }] });

/* ============================== CLAIMS ============================== */
export function StoreClaimsPanel({ apiFetch, settings, title = "เคลมสินค้า" }) {
  const [today] = useState(() => bangkokDateOf(new Date().toISOString()));
  const { range, setRange, presets } = useRange(today);
  const [kind, setKind] = useState("unclaimable");
  const [mode, setMode] = useState("form");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => emptyClaimForm("unclaimable", today));
  const [editing, setEditing] = useState(null);
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState("");
  const generation = useRef(0);
  const branches = activeBranches(settings);
  const meta = CLAIM_KINDS[kind];

  const load = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    try {
      const data = await callApi(apiFetch, `/api/store/claims?${new URLSearchParams(range)}`, "GET");
      if (id === generation.current) { setRows(data.items || []); setError(""); }
    } catch (e) { if (id === generation.current) setError(e.message); } finally { if (id === generation.current) setBusy(false); }
  }, [apiFetch, range]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  const switchKind = (next) => { setKind(next); setEditing(null); setForm(emptyClaimForm(next, today)); setPreview(null); setMessage(""); setError(""); };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const formItems = form.items.filter((item) => item.name || item.code || item.qty || item.unitPrice);
  const lineAmount = (item) => { const a = parseAmount(item.amount); if (a !== null && !Number.isNaN(a)) return money(a); const q = parseAmount(item.qty); const p = parseAmount(item.unitPrice); return q > 0 && p >= 0 ? money(q * p) : "—"; };

  const save = async (event) => {
    event.preventDefault();
    const document = { ...form, kind, items: formItems };
    const checked = validateClaimDocument(document, { settings, keep: editing });
    if (!checked.ok) { setError(checked.error); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      if (editing) {
        await callApi(apiFetch, "/api/store/claims", "PATCH", { id: editing.id, baseUpdatedAt: editing.updatedAt, document });
        setMessage(`แก้ไขเอกสาร ${editing.documentNumber} แล้ว`);
      } else {
        const data = await callApi(apiFetch, "/api/store/claims", "POST", { documents: [document] });
        if (data.skipped?.length) { setError(`เลขที่ ${data.skipped.join(", ")} มีอยู่แล้ว · แก้ไขจากรายการด้านล่างแทน`); return; }
        setMessage(`บันทึกเอกสาร ${checked.value.documentNumber} แล้ว`);
      }
      setEditing(null); setForm(emptyClaimForm(kind, form.serviceDate)); await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const checkPaste = () => { setMessage(""); setError(""); setPreview(parseClaimPaste(kind, paste, branches)); };
  const importPaste = async () => {
    const docs = preview.documents.map(({ lines, ...doc }) => doc);
    const invalid = docs.map((doc) => [doc.documentNumber, validateClaimDocument(doc, { settings })]).filter(([, r]) => !r.ok);
    if (invalid.length) { setError(invalid.slice(0, 5).map(([n, r]) => `${n}: ${r.error}`).join(" · ")); return; }
    setSaving(true); setError(""); setMessage("");
    let created = 0;
    const skipped = [];
    try {
      for (let i = 0; i < docs.length; i += IMPORT_DOCUMENT_MAX) {
        const data = await callApi(apiFetch, "/api/store/claims", "POST", { documents: docs.slice(i, i + IMPORT_DOCUMENT_MAX) });
        created += data.created.length; skipped.push(...data.skipped);
      }
      setMessage(`นำเข้า ${created} เอกสาร${skipped.length ? ` · ข้าม ${skipped.length} เอกสารที่มีอยู่แล้ว (${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""})` : ""}`);
      setPaste(""); setPreview(null); await load();
    } catch (e) { setError(`${e.message}${created ? ` (บันทึกไปแล้ว ${created} เอกสาร)` : ""}`); await load(); } finally { setSaving(false); }
  };

  const startEdit = (row) => {
    setMode("form"); setEditing(row); setKind(row.kind);
    setForm({ kind: row.kind, documentNumber: row.documentNumber, serviceDate: row.serviceDate, branchCode: row.branchCode || "", reason: row.reason || "", requester: row.requester || "", supplier: row.supplier || "", note: row.note || "", items: row.items.map((item) => ({ rowId: newRequestId(), code: item.code, name: item.name, qty: String(item.qty), unitPrice: String(item.unitPrice), amount: typedAmount(item) })) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (row, reason) => {
    try { await callApi(apiFetch, "/api/store/claims", "DELETE", { id: row.id, reason }); setMessage(`ลบเอกสาร ${row.documentNumber} แล้ว`); await load(); } catch (e) { setError(e.message); }
  };

  const list = rows.filter((row) => row.kind === kind);
  const totals = list.reduce((s, r) => ({ qty: s.qty + r.totalQty, amount: s.amount + r.totalAmount }), { qty: 0, amount: 0 });
  const branchName = (code) => branches.find((b) => b.code === code)?.name || code || "—";

  return <section className="srp" aria-label={title}>
    <header className="srp-head"><div><span className="srp-eyebrow">STORE · CLAIMS</span><h2>{title}</h2><p>บันทึกสินค้าเคลมได้ (ส่งคืน/ลดหนี้) และเคลมไม่ได้ (เบิกออก/ตัดจ่าย) เพื่อแสดงในรายงานแดชบอร์ดสโตร์</p></div></header>
    <div className="srp-kinds" role="group" aria-label="ประเภทเคลม">{Object.entries(CLAIM_KINDS).map(([id, k]) => <button type="button" key={id} aria-pressed={kind === id} onClick={() => switchKind(id)}><b>{k.label}</b><small>{k.detail}</small></button>)}</div>

    <div className="srp-card">
      <div className="srp-modes" role="group" aria-label="วิธีบันทึก"><button type="button" aria-pressed={mode === "form"} onClick={() => setMode("form")}>{editing ? `แก้ไข ${editing.documentNumber}` : "บันทึกทีละเอกสาร"}</button><button type="button" aria-pressed={mode === "paste"} onClick={() => { setMode("paste"); if (editing) { setEditing(null); setForm(emptyClaimForm(kind, today)); } }}>วางจาก Excel (หลายเอกสาร)</button></div>
      {mode === "form" ? <form onSubmit={save} className="srp-form">
        <div className="srp-fields">
          <label>วันที่เอกสาร<input type="date" required value={form.serviceDate} max={today} onChange={set("serviceDate")} /></label>
          <label>เลขที่เอกสาร<input required value={form.documentNumber} disabled={Boolean(editing)} placeholder={kind === "claimable" ? "CRR6911-0001" : "STK-SIE6911-0001"} onChange={set("documentNumber")} /></label>
          <label>สาขา{kind === "claimable" ? " (ไม่บังคับ)" : ""}<select value={form.branchCode} required={kind === "unclaimable"} onChange={set("branchCode")}><option value="">{kind === "claimable" ? "ไม่ระบุสาขา" : "เลือกสาขา"}</option>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}</select></label>
          {kind === "unclaimable" ? <>
            <label className="srp-wide">สาเหตุที่เคลมไม่ได้<input required value={form.reason} placeholder="เช่น สินค้าหมดอายุ / ชำรุด / เบิกเป็นของแถม" onChange={set("reason")} /></label>
            <label>ผู้เบิก<input value={form.requester} onChange={set("requester")} /></label>
          </> : <label>ผู้ขาย / ซัพพลายเออร์<input value={form.supplier} onChange={set("supplier")} /></label>}
          <label className="srp-wide">หมายเหตุ<input value={form.note} onChange={set("note")} /></label>
        </div>
        <ItemsEditor items={form.items} setItems={(items) => setForm({ ...form, items })} columns={[{ key: "code", label: "รหัสสินค้า", width: 110 }, { key: "name", label: "ชื่อสินค้า", width: 220 }, { key: "qty", label: "จำนวน", type: "number", width: 70 }, { key: "unitPrice", label: meta.priceLabel, type: "number", width: 90 }, { key: "amount", label: "มูลค่า (ถ้าต่างจากคำนวณ)", type: "number", width: 110, placeholder: "อัตโนมัติ" }]} computed={{ label: "มูลค่า ฿", value: lineAmount }} />
        <div className="srp-actions"><button type="submit" className="srp-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : `บันทึก${meta.label}`}</button>{editing && <button type="button" className="srp-secondary" onClick={() => { setEditing(null); setForm(emptyClaimForm(kind, today)); }}>ยกเลิกแก้ไข</button>}</div>
      </form> : <>
        <PasteBox columns={meta.columns} value={paste} setValue={(v) => { setPaste(v); setPreview(null); }} onCheck={checkPaste} hint={kind === "unclaimable" ? "รหัสสาขาจาก ERP จับคู่ให้อัตโนมัติ เช่น MHD → MH · แถวที่เลขที่เอกสารเดียวกันจะรวมเป็นเอกสารเดียว" : "แถวที่เลขที่เอกสารเดียวกันจะรวมเป็นเอกสารเดียว · สาขาไม่บังคับ"} />
        {preview && <div className="srp-preview">
          <Errors errors={preview.errors} />
          <p><b>{preview.documents.length}</b> เอกสาร · {fmt(preview.documents.reduce((s, d) => s + d.items.length, 0))} รายการสินค้า</p>
          {preview.documents.length > 0 && <div className="srp-table-wrap"><table className="srp-table"><thead><tr><th>วันที่</th><th>เลขที่</th>{kind === "unclaimable" && <><th>สาขา</th><th>สาเหตุ</th></>}<th className="num">รายการ</th><th className="num">จำนวน</th><th>ตรวจ</th></tr></thead>
            <tbody>{preview.documents.map((doc) => { const r = validateClaimDocument(doc, { settings }); return <tr key={doc.documentNumber}><td>{shortDate(doc.serviceDate)}</td><td>{doc.documentNumber}</td>{kind === "unclaimable" && <><td>{doc.branchCode || "—"}</td><td>{doc.reason || "—"}</td></>}<td className="num">{doc.items.length}</td><td className="num">{fmt(doc.items.reduce((s, i) => s + (Number(i.qty) || 0), 0))}</td><td>{r.ok ? <span className="srp-ok">พร้อม · ฿{money(r.value.totalAmount)}</span> : <span className="srp-bad">{r.error}</span>}</td></tr>; })}</tbody></table></div>}
          <button type="button" className="srp-primary" disabled={saving || !preview.documents.length || preview.errors.length > 0} onClick={importPaste}>{saving ? "กำลังนำเข้า…" : `นำเข้า ${preview.documents.length} เอกสาร`}</button>
          {preview.errors.length > 0 && <p className="srp-muted">แก้แถวที่ผิดในข้อมูลที่วางก่อน แล้วกดตรวจอีกครั้ง</p>}
        </div>}
      </>}
      {error && <p className="srp-error" role="alert">{error}</p>}
      {message && <p className="srp-message" role="status">{message}</p>}
    </div>

    <div className="srp-card">
      <div className="srp-list-head"><h3>{meta.label} · รายการที่บันทึก</h3><span>{list.length} เอกสาร · {fmt(totals.qty)} ชิ้น · ฿{money(totals.amount)}</span></div>
      <RangeBar range={range} setRange={setRange} presets={presets} busy={busy} onRefresh={load} />
      {busy && !rows.length ? <p className="srp-muted" role="status">กำลังโหลด…</p> : !list.length ? <p className="srp-empty">ยังไม่มีเอกสาร{meta.label}ในช่วงนี้</p> :
        <div className="srp-table-wrap"><table className="srp-table"><thead><tr><th>วันที่</th><th>เลขที่</th><th>สาขา</th><th>{kind === "unclaimable" ? "สาเหตุ / ผู้เบิก" : "ผู้ขาย"}</th><th className="num">รายการ</th><th className="num">จำนวน</th><th className="num">มูลค่า ฿</th><th>จัดการ</th></tr></thead>
          <tbody>{list.map((row) => <Fragment key={row.id}>
            <tr><td className="nowrap">{shortDate(row.serviceDate)}</td><td className="nowrap"><button type="button" className="srp-link" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? "" : row.id)}>{row.documentNumber}</button></td><td>{row.branchCode ? branchName(row.branchCode) : "—"}</td><td>{kind === "unclaimable" ? <>{row.reason}{row.requester && <small>{row.requester}</small>}</> : row.supplier || "—"}{row.note && <small>{row.note}</small>}</td><td className="num">{row.itemCount}</td><td className="num">{fmt(row.totalQty)}</td><td className="num">{money(row.totalAmount)}</td>
              <td className="nowrap"><button type="button" className="srp-link" onClick={() => startEdit(row)}>แก้ไข</button> <DeleteButton label={row.documentNumber} onDelete={(reason) => remove(row, reason)} /></td></tr>
            {open === row.id && <tr className="srp-detail"><td colSpan={8}><table className="srp-table srp-inner"><thead><tr><th>รหัส</th><th>สินค้า</th><th className="num">จำนวน</th><th className="num">{meta.priceLabel}</th><th className="num">มูลค่า</th></tr></thead><tbody>{row.items.map((item, i) => <tr key={i}><td>{item.code || "—"}</td><td>{item.name}</td><td className="num">{fmt(item.qty, 2).replace(/\.00$/, "")}</td><td className="num">{money(item.unitPrice)}</td><td className="num">{money(item.amount)}</td></tr>)}</tbody></table><small>บันทึกโดย {row.createdBy || "—"}{row.updatedBy ? ` · แก้ไขล่าสุดโดย ${row.updatedBy}` : ""}</small></td></tr>}
          </Fragment>)}</tbody></table></div>}
    </div>
  </section>;
}

/* ============================== PRODUCTION ============================== */
const emptyProduction = (today) => ({ serviceDate: today, branchCode: "", documentNumber: "", note: "", items: [{ rowId: newRequestId() }] });

export function StoreProductionPanel({ apiFetch, settings, title = "การผลิตสินค้า" }) {
  const [today] = useState(() => bangkokDateOf(new Date().toISOString()));
  const { range, setRange, presets } = useRange(today);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => emptyProduction(today));
  const [editing, setEditing] = useState(null);
  const [paste, setPaste] = useState("");
  const [pasteErrors, setPasteErrors] = useState([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState("");
  const [open, setOpen] = useState("");
  const requestId = useRef("");
  const generation = useRef(0);
  const branches = activeBranches(settings);

  const load = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    try {
      const data = await callApi(apiFetch, `/api/store/production?${new URLSearchParams(range)}`, "GET");
      if (id === generation.current) { setRows(data.items || []); setError(""); }
    } catch (e) { if (id === generation.current) setError(e.message); } finally { if (id === generation.current) setBusy(false); }
  }, [apiFetch, range]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  // Any change to the form is a new save: drop the retry id and any pending duplicate confirmation.
  const changeForm = (next) => { requestId.current = ""; setConfirmDuplicate(""); setForm(next); };
  const set = (key) => (e) => changeForm({ ...form, [key]: e.target.value });
  const fillFromPaste = () => {
    const parsed = parseProductionPaste(paste);
    setPasteErrors(parsed.errors);
    if (parsed.errors.length || !parsed.items.length) return;
    const kept = form.items.filter((item) => item.name || item.code || item.qty);
    changeForm({ ...form, items: [...kept, ...parsed.items.map((item) => ({ rowId: newRequestId(), code: item.code, name: item.name, unit: item.unit, qty: String(item.qty), sold: item.sold == null ? "" : String(item.sold) }))] });
    setPaste("");
    setMessage(`เติม ${parsed.items.length} รายการลงฟอร์มแล้ว · ตรวจแล้วกดบันทึก`);
  };

  const save = async (event) => {
    event.preventDefault();
    const record = { ...form, items: form.items.filter((item) => item.name || item.code || item.qty || item.sold) };
    const checked = validateProductionRecord(record, { settings, keep: editing });
    if (!checked.ok) { setError(checked.error); return; }
    // The same branch and date saved before is usually a repeated import: ask once before adding it again.
    const dupKey = `${checked.value.branchCode}|${checked.value.serviceDate}`;
    if (!editing && confirmDuplicate !== dupKey && rows.some((row) => row.branchCode === checked.value.branchCode && row.serviceDate === checked.value.serviceDate)) {
      setConfirmDuplicate(dupKey);
      setError(`มีบันทึกการผลิตของ ${checked.value.branchCode} วันที่ ${shortDate(checked.value.serviceDate)} อยู่แล้ว · ถ้าเป็นการผลิตอีกรอบจริง กด "บันทึกการผลิต" อีกครั้งเพื่อยืนยัน`);
      return;
    }
    if (!editing && rows.some((row) => sameProductionRecord(row, checked.value))) { setError("รายการนี้บันทึกไว้แล้ว (สาขา วันที่ และสินค้าตรงกันทุกบรรทัด)"); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      if (editing) {
        await callApi(apiFetch, "/api/store/production", "PATCH", { id: editing.id, baseUpdatedAt: editing.updatedAt, record });
        setMessage("แก้ไขรายการผลิตแล้ว");
      } else {
        // Same id across retries of one save so a lost response never creates a duplicate.
        if (!requestId.current) requestId.current = newRequestId();
        await callApi(apiFetch, "/api/store/production", "POST", { requestId: requestId.current, records: [record] });
        setMessage(`บันทึกการผลิต ${checked.value.branchCode} ${shortDate(checked.value.serviceDate)} · ${checked.value.itemCount} รายการแล้ว`);
      }
      requestId.current = "";
      setConfirmDuplicate("");
      setEditing(null); setForm(emptyProduction(form.serviceDate)); await load();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const startEdit = (row) => {
    setEditing(row);
    changeForm({ serviceDate: row.serviceDate, branchCode: row.branchCode, documentNumber: row.documentNumber || "", note: row.note || "", items: row.items.map((item) => ({ rowId: newRequestId(), code: item.code, name: item.name, unit: item.unit, qty: String(item.qty), sold: item.sold == null ? "" : String(item.sold) })) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (row, reason) => {
    try { await callApi(apiFetch, "/api/store/production", "DELETE", { id: row.id, reason }); setMessage("ลบรายการผลิตแล้ว"); await load(); } catch (e) { setError(e.message); }
  };
  const totals = rows.reduce((s, r) => ({ qty: s.qty + r.totalQty, sold: s.sold + (r.totalSold || 0) }), { qty: 0, sold: 0 });
  const branchName = (code) => branches.find((b) => b.code === code)?.name || code;

  return <section className="srp" aria-label={title}>
    <header className="srp-head"><div><span className="srp-eyebrow">STORE · PRODUCTION</span><h2>{title}</h2><p>บันทึกจำนวนผลิตต่อสาขา (และยอดขายถ้ามี) เพื่อแสดงในรายงานแดชบอร์ดสโตร์</p></div></header>
    <div className="srp-card">
      <h3>{editing ? "แก้ไขรายการผลิต" : "บันทึกการผลิต"}</h3>
      <form onSubmit={save} className="srp-form">
        <div className="srp-fields">
          <label>วันที่ผลิต / งวด<input type="date" required value={form.serviceDate} max={today} onChange={set("serviceDate")} /></label>
          <label>สาขา<select required value={form.branchCode} onChange={set("branchCode")}><option value="">เลือกสาขา</option>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} {b.name}</option>)}</select></label>
          <label>เลขที่เอกสาร (ไม่บังคับ)<input value={form.documentNumber} onChange={set("documentNumber")} /></label>
          <label className="srp-wide">หมายเหตุ<input value={form.note} onChange={set("note")} /></label>
        </div>
        <ItemsEditor items={form.items} setItems={(items) => changeForm({ ...form, items })} columns={[{ key: "code", label: "รหัสสินค้า", width: 110 }, { key: "name", label: "ชื่อสินค้า", width: 240 }, { key: "unit", label: "หน่วย", width: 60 }, { key: "qty", label: "จำนวนผลิต", type: "number", width: 80 }, { key: "sold", label: "ยอดขาย (ถ้ามี)", type: "number", width: 80 }]} />
        <details className="srp-details"><summary>วางรายการสินค้าจาก Excel</summary>
          <PasteBox columns={PRODUCTION_COLUMNS} value={paste} setValue={setPaste} onCheck={fillFromPaste} hint="ระบบจะเติมรายการลงในฟอร์มด้านบนให้ตรวจก่อนบันทึก" />
          <Errors errors={pasteErrors} />
        </details>
        <div className="srp-actions"><button type="submit" className="srp-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : editing ? "บันทึกการแก้ไข" : "บันทึกการผลิต"}</button>{editing && <button type="button" className="srp-secondary" onClick={() => { setEditing(null); changeForm(emptyProduction(today)); }}>ยกเลิกแก้ไข</button>}</div>
      </form>
      {error && <p className="srp-error" role="alert">{error}</p>}
      {message && <p className="srp-message" role="status">{message}</p>}
    </div>
    <div className="srp-card">
      <div className="srp-list-head"><h3>รายการผลิตที่บันทึก</h3><span>{rows.length} รายการ · ผลิต {fmt(totals.qty)} · ขาย {fmt(totals.sold)}</span></div>
      <RangeBar range={range} setRange={setRange} presets={presets} busy={busy} onRefresh={load} />
      {busy && !rows.length ? <p className="srp-muted" role="status">กำลังโหลด…</p> : !rows.length ? <p className="srp-empty">ยังไม่มีรายการผลิตในช่วงนี้</p> :
        <div className="srp-table-wrap"><table className="srp-table"><thead><tr><th>วันที่</th><th>สาขา</th><th>เอกสาร</th><th className="num">SKU</th><th className="num">ผลิต</th><th className="num">ขาย</th><th>จัดการ</th></tr></thead>
          <tbody>{rows.map((row) => <Fragment key={row.id}>
            <tr><td className="nowrap"><button type="button" className="srp-link" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? "" : row.id)}>{shortDate(row.serviceDate)}</button></td><td>{row.branchCode} {branchName(row.branchCode)}</td><td>{row.documentNumber || "—"}{row.note && <small>{row.note}</small>}</td><td className="num">{row.itemCount}</td><td className="num">{fmt(row.totalQty)}</td><td className="num">{row.totalSold == null ? "—" : fmt(row.totalSold)}</td>
              <td className="nowrap"><button type="button" className="srp-link" onClick={() => startEdit(row)}>แก้ไข</button> <DeleteButton label={`${row.branchCode} ${row.serviceDate}`} onDelete={(reason) => remove(row, reason)} /></td></tr>
            {open === row.id && <tr className="srp-detail"><td colSpan={7}><table className="srp-table srp-inner"><thead><tr><th>รหัส</th><th>สินค้า</th><th>หน่วย</th><th className="num">ผลิต</th><th className="num">ขาย</th></tr></thead><tbody>{row.items.map((item, i) => <tr key={i}><td>{item.code || "—"}</td><td>{item.name}</td><td>{item.unit || "—"}</td><td className="num">{fmt(item.qty)}</td><td className="num">{item.sold == null ? "—" : fmt(item.sold)}</td></tr>)}</tbody></table><small>บันทึกโดย {row.createdBy || "—"}</small></td></tr>}
          </Fragment>)}</tbody></table></div>}
    </div>
  </section>;
}

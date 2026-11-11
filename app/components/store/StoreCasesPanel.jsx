"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CASE_STATUSES, SHORTAGE_STATUSES, isOpenCase, remainingOf, validateCase } from "../../../lib/storeCases.js";
import { bangkokDateOf } from "../../../lib/storeDailyReport.js";
import "./StoreCasesPanel.css";

const STATUS_LABELS = { open: "เปิด", working: "กำลังดำเนินการ", closed: "ปิด", reopened: "เปิดใหม่", waiting_purchase: "รอจัดซื้อ", ordered: "สั่งแล้วรอรับ", waiting_transfer: "รอโอนภายใน", partial: "รับบางส่วน", complete: "ครบ", cancelled: "ยกเลิก" };
const CLOSURE_LABELS = { fulfilled: "รับครบ", cancelled: "ยกเลิก", exception: "ข้อยกเว้น" };
const EVENT_LABELS = { created: "สร้างเคส", source_updated: "ปรับปรุงเอกสารต้นทาง", closed: "ปิดเคส", reopened: "เปิดเคสใหม่", source_cancelled: "ยกเลิกเอกสารต้นทาง", updated: "ปรับปรุงเคส" };
const SOURCE_LABELS = { transfer: "ใบโอน", booking: "ใบสั่งจอง", online: "ออนไลน์", audit: "Audit" };
const newLine = () => ({ id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sku: "", name: "", unit: "", required: "", received: 0, cancelled: 0, cancellationReason: "", trackingStatus: "waiting_purchase", allocations: [] });
export function CaseEditor({ item, onSave, onCancel, busy = false, staff = [] }) {
  const [form, setForm] = useState(() => ({ ...item, category: item.category || "unknown", cause: item.cause || "", responsibleId: item.responsibleId || "", responsibleName: item.responsibleName || "", closure: item.closure || "", closureReason: item.closureReason || "", note: item.note || "", lines: item.lines || [] }));
  const [error, setError] = useState("");
  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const linePatch = (id, key, value) => setForm((current) => ({ ...current, lines: current.lines.map((line) => line.id === id ? { ...line, [key]: value } : line) }));
  const allocationPatch = (line, index, key, value) => linePatch(line.id, "allocations", line.allocations.map((a, i) => i === index ? { ...a, [key]: value } : a));
  const submit = (event) => {
    event.preventDefault();
    const checked = validateCase(form);
    if (!checked.ok) { setError(checked.error); return; }
    setError(""); onSave({ ...checked.value, baseUpdatedAt: item.legacy ? "" : item.updatedAt });
  };
  return <form className="sc-editor" onSubmit={submit}><h3>เคส {item.sourceNumber || item.sourceId}</h3><fieldset disabled={busy}>
    <div className="sc-filters"><label>ประเภทปัญหา<select value={form.category} onChange={(e) => patch("category", e.target.value)}>{[["unknown", "ยังไม่ระบุ"], ["shortage", "สินค้าขาด"], ["wrong", "สินค้าผิด"], ["damaged", "ชำรุด"], ["document", "ปัญหาเอกสาร"]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>สถานะ<select value={form.status} onChange={(e) => patch("status", e.target.value)}>{CASE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><label>ผู้รับผิดชอบ<select value={form.responsibleId} onChange={(e) => { const person = staff.find((p) => p.id === e.target.value || p.uid === e.target.value); setForm((current) => ({ ...current, responsibleId: e.target.value, responsibleName: person?.name || "" })); }}><option value="">ยังไม่ระบุ</option>{form.responsibleId && !staff.some((p) => (p.id || p.uid) === form.responsibleId) && <option value={form.responsibleId}>{form.responsibleName || form.responsibleId}</option>}{staff.map((p) => <option key={p.id || p.uid} value={p.id || p.uid}>{p.name}</option>)}</select></label></div>
    <label>สาเหตุ<textarea value={form.cause} maxLength={1000} onChange={(e) => patch("cause", e.target.value)} /></label><label>หมายเหตุ / การแก้ไข<textarea value={form.note} maxLength={2000} onChange={(e) => patch("note", e.target.value)} /></label>
    {!form.lines.length && <p>ยังไม่ระบุรายการสินค้า · ไม่ทราบจำนวนค้าง</p>}
    {form.lines.map((line, index) => <section className="sc-line" key={line.id}><h4>สินค้า {index + 1} · ค้าง {remainingOf(line)} {line.unit}</h4><label>ประเภทปัญหาสินค้า<select value={line.category || "unknown"} onChange={(e) => linePatch(line.id, "category", e.target.value)}><option value="unknown">ยังไม่ระบุ</option><option value="shortage">ขาด</option><option value="wrong">ผิด</option><option value="damaged">ชำรุด</option><option value="document">เอกสาร</option></select></label><div className="sc-filters">{[["sku", "SKU"], ["name", "ชื่อสินค้า"], ["unit", "หน่วย"]].map(([key, label]) => <label key={key}>{label}<input value={line[key] || ""} onChange={(e) => linePatch(line.id, key, e.target.value)} /></label>)}{[["required", "ต้องรับ"], ["received", "รับยืนยันแล้ว"], ["cancelled", "ยกเลิก"]].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={line[key]} onChange={(e) => linePatch(line.id, key, e.target.value === "" ? "" : Number(e.target.value))} /></label>)}<label>เหตุผลยกเลิก<input value={line.cancellationReason || ""} onChange={(e) => linePatch(line.id, "cancellationReason", e.target.value)} /></label><label>การติดตาม<select value={line.trackingStatus || "waiting_purchase"} onChange={(e) => linePatch(line.id, "trackingStatus", e.target.value)}>{SHORTAGE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></div>
      <p>จัดสรรรอจากหลายแหล่งรวมได้ไม่เกินยอดค้าง · เลข PO ไม่ใช่การรับสินค้า</p>
      {(line.allocations || []).map((a, i) => <div className="sc-allocation" key={i}><label>แหล่ง<select value={a.kind || "supplier"} onChange={(e) => allocationPatch(line, i, "kind", e.target.value)}><option value="supplier">supplier</option><option value="transfer">โอนภายใน</option></select></label>{[["quantity", "จำนวน"], ["supplier", "Supplier"], ["branch", "สาขา"], ["warehouse", "คลัง"], ["owner", "ผู้ติดตาม"], ["po", "PO / อ้างอิง"], ["eta", "คาดรับ"], ["followUp", "ติดตามล่าสุด"]].map(([key, label]) => <label key={key}>{label}<input type={key === "quantity" ? "number" : ["eta", "followUp"].includes(key) ? "date" : "text"} min={key === "quantity" ? "0" : undefined} step={key === "quantity" ? "any" : undefined} value={a[key] || ""} onChange={(e) => allocationPatch(line, i, key, key === "quantity" ? Number(e.target.value) : e.target.value)} /></label>)}<button type="button" onClick={() => linePatch(line.id, "allocations", line.allocations.filter((_, n) => n !== i))}>ลบแหล่ง</button></div>)}
      <button type="button" onClick={() => linePatch(line.id, "allocations", [...(line.allocations || []), { quantity: remainingOf(line), kind: "supplier", supplier: "", branch: "", warehouse: "", owner: "", po: "", eta: "", followUp: "" }])}>เพิ่มแหล่งรอรับ</button>
    </section>)}
    <button type="button" onClick={() => patch("lines", [...form.lines, newLine()])}>เพิ่มสินค้า</button>
    {form.status === "closed" && <div className="sc-filters"><label>รูปแบบปิด<select value={form.closure} onChange={(e) => patch("closure", e.target.value)}><option value="">เลือก</option><option value="fulfilled">รับครบ</option><option value="cancelled">ยกเลิก</option><option value="exception">ข้อยกเว้น</option></select></label><label>เหตุผลปิด / ยกเลิก<input value={form.closureReason} onChange={(e) => patch("closureReason", e.target.value)} /></label></div>}
    {error && <p role="alert">{error}</p>}<div className="sc-actions"><button type="submit" className="primary">{busy ? "กำลังบันทึก…" : "บันทึกเคส"}</button><button type="button" onClick={onCancel}>ยกเลิกการแก้ไข</button></div>
  </fieldset></form>;
}
function trackingState(line, item) {
  if (item.status === "closed" && item.closure === "cancelled") return "cancelled";
  if (remainingOf(line) === 0) return line.cancelled === line.required ? "cancelled" : "complete";
  if (line.received > 0) return "partial";
  return line.trackingStatus || "waiting_purchase";
}
export default function StoreCasesPanel({ apiFetch, settings }) {
  const [items, setItems] = useState([]);
  const [roster, setRoster] = useState([]);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true); setError("");
    try {
      const date = bangkokDateOf(new Date().toISOString());
      const res = await apiFetch(`/api/store/cases?from=${date}&to=${date}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "โหลดทะเบียนเคสไม่สำเร็จ");
      if (id === generation.current) { setItems(json.data.items); setRoster(json.data.roster || []); setGeneratedAt(json.data.generatedAt); }
    } catch (e) { if (id === generation.current) { setError(e.message); setItems([]); } }
    finally { if (id === generation.current) setLoading(false); }
  }, [apiFetch]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { load(); return invalidate; }, [load, invalidate]);
  const save = async (value) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const res = await apiFetch("/api/store/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "บันทึกเคสไม่สำเร็จ");
      setEditing(null); await load();
    } catch (e) { setError(e.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const selected = items.filter((item) => `${item.sourceNumber} ${item.note} ${item.cause} ${item.lines.map((line) => `${line.sku} ${line.name}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const shortages = selected.flatMap((item) => item.lines.map((line) => ({ item, line, state: trackingState(line, item) }))).filter((row) => !status || row.state === status);
  return <section className="sc-dashboard" aria-label="ทะเบียนเคสและสินค้าขาด"><h2>ทะเบียนเคสและสินค้าขาด</h2><p>ทะเบียนติดตามภายใน · ไม่สร้าง PO และไม่เชื่อม stock สด · ข้อมูลอ้างอิงสถานะปัจจุบัน</p><div className="sc-filters"><label>ค้นหาเอกสาร / สินค้า<input value={query} onChange={(e) => setQuery(e.target.value)} /></label><label>สถานะสินค้า<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">ทุกสถานะ</option>{SHORTAGE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label><button type="button" disabled={loading || busy} onClick={load}>ปรับปรุงข้อมูล</button></div>
    {loading && <p role="status">กำลังโหลดทะเบียนเคส…</p>}{error && <p role="alert">{error}</p>}{generatedAt && <p className="muted">ข้อมูลล่าสุด {new Date(generatedAt).toLocaleString("th-TH")}</p>}
    {editing && <CaseEditor key={editing.id} item={editing} busy={busy} staff={roster.length ? roster : settings?.staff || []} onSave={save} onCancel={() => setEditing(null)} />}
    {!loading && <><div className="store-report-table-wrap"><table className="sc-table"><caption>สินค้าขาดและแหล่งรอรับ · {shortages.length} รายการสินค้า</caption><thead><tr><th>เอกสาร / สินค้า</th><th>ต้องรับ / รับแล้ว / ยกเลิก / ค้าง</th><th>ติดตาม</th><th>แหล่งรอรับ</th><th>จัดการ</th></tr></thead><tbody>{shortages.map(({ item, line, state }) => <tr key={`${item.id}:${line.id}`}><td>{item.sourceNumber}<br />{line.sku || "ไม่ระบุ SKU"} · {line.name}</td><td>{line.required} / {line.received} / {line.cancelled} / <strong>{remainingOf(line)} {line.unit}</strong>{line.cancelled > 0 && <small>{line.cancellationReason}</small>}</td><td>{item.status === "closed" && item.closure === "exception" && remainingOf(line) > 0 ? "ปิดข้อยกเว้น มียอดคงเหลือไม่ติดตาม" : STATUS_LABELS[state]}<br />{item.responsibleName || "ไม่ทราบผู้รับผิดชอบ"}</td><td>{(line.allocations || []).map((a, i) => <p key={i}>{a.quantity} {line.unit} · {[a.supplier, a.branch, a.warehouse].filter(Boolean).join(" / ") || "ยังไม่ระบุแหล่ง"}<br />ผู้ติดตาม {a.owner || "—"} · PO {a.po || "—"}<br />คาดรับ {a.eta || "—"} · ติดตามล่าสุด {a.followUp || "—"}</p>)}</td><td><button type="button" disabled={busy} onClick={() => setEditing(item)}>แก้ไขเคส</button></td></tr>)}</tbody></table></div>{!shortages.length && <p>ไม่มีรายการสินค้าตามตัวกรอง · เคสที่ยังไม่ระบุสินค้าอยู่ในทะเบียนด้านล่าง</p>}
      <h3>ทะเบียนเคส · {selected.length} เคส</h3><div className="store-report-table-wrap"><table className="sc-table"><thead><tr><th>เอกสาร / ประเภท</th><th>สถานะ / ผู้รับผิดชอบ</th><th>สาเหตุ / หมายเหตุเดิม</th><th>สินค้า / ประวัติ</th><th>จัดการ</th></tr></thead><tbody>{selected.map((item) => <tr key={item.id}><td>{item.sourceNumber}<small>{SOURCE_LABELS[item.sourceType] || item.sourceType} · {item.branchCode || "ไม่ทราบสาขา"}</small></td><td>{STATUS_LABELS[item.status]} · {item.responsibleName || "ยังไม่ระบุ"}<small>{!isOpenCase(item) && `${CLOSURE_LABELS[item.closure] || item.closure}: ${item.closureReason || ""}`}</small></td><td>{item.cause || "ไม่ทราบสาเหตุ"}<small>{item.note}</small></td><td>{item.lines.length ? `${item.lines.length} รายการ` : "ยังไม่ระบุรายการสินค้า"}<details><summary>ประวัติ {item.history?.length || 0} รายการ</summary>{(item.history || []).map((event, i) => <p key={i}>{EVENT_LABELS[event.action] || event.action} · {event.actorName || event.actorUid}<br />มีผล {event.effectiveAt} · บันทึก {event.recordedAt}<br />{event.note}</p>)}</details></td><td><button type="button" disabled={busy} onClick={() => setEditing(item)}>{item.legacy ? "ระบุรายละเอียดเคส" : "แก้ไข / เปิดใหม่"}</button></td></tr>)}</tbody></table></div></>}
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bangkokDateOf } from "../../../lib/storeDailyReport.js";
import { addDaysToDateKey } from "../../../lib/storeFormat.js";
import { customRange } from "../../../lib/storeOverview.js";
import { DOCUMENT_TYPES, selectOperationalScope } from "../../../lib/storeDashboard.js";
import StoreDonutChart from "./StoreDonutChart.jsx";
import StorePlanningPanel from "./StorePlanningPanel.jsx";
import "./StoreOperationalDashboard.css";

const VIEWS = [["overview", "ภาพรวมทีม"], ["people", "รายบุคคล"], ["cases", "เคสและของค้าง"], ["quality", "คุณภาพการรับ"]];
const SOURCE_TABS = { booking: "store-booking", online: "store-online", transfer: "store-transfer", audit: "store-audit", auditDocs: "store-audit" };
const CATEGORIES = { shortage: "สินค้าขาด", wrong: "สินค้าผิด", damaged: "เสียหาย", document: "เอกสาร", unknown: "ไม่ระบุประเภท" };
const TRACKING = { waiting_purchase: "รอจัดซื้อ", ordered: "สั่งซื้อแล้ว", waiting_transfer: "รอโอน", partial: "รับบางส่วน", complete: "ครบ", cancelled: "ยกเลิก" };

function Records({ picked, onClose, onNavigate }) {
  return <section className="sop-records" aria-label="รายการที่เลือก" tabIndex={-1}>
    <header><div><h3>{picked.title}</h3><p>{picked.rows.length} {picked.unit} · {picked.scopeLabel}</p></div><button type="button" onClick={onClose}>ปิดรายการ</button></header>
    {!picked.rows.length && <p className="sop-empty">ไม่มีรายการในขอบเขตนี้</p>}
    <div className="sop-record-list">{picked.rows.map((row) => <article key={row.key}>
      <div><strong>{row.number || row.sourceNumber || row.sourceId || row.id}</strong><span>{row.line?.name || DOCUMENT_TYPES.find(([id]) => id === row.type)?.[1] || CATEGORIES[row.category] || row.category || "เคส"}</span></div>
      <p>{row.staffName} · {row.branchCode || "ไม่ระบุสาขา"} · {row.date || bangkokDateOf(row.effectiveAt || row.createdAt) || "ไม่ระบุวัน"}</p>
      {row.ownerName && <p>ผู้รับผิดชอบเคส {row.ownerName} · ผู้ปิด {row.staffName}</p>}
      {row.line && <p>ต้องรับ {row.line.required} · รับแล้ว {row.line.received} · ยกเลิก {row.line.cancelled} · ค้าง {row.remaining ?? "—"} {row.line.unit}</p>}
      {row.note && <p>{row.note}</p>}
      <button type="button" className="sop-link" onClick={() => onNavigate?.(SOURCE_TABS[row.sourceType || row.type])}>เปิดโมดูลต้นทาง</button>
    </article>)}</div>
  </section>;
}

export default function StoreOperationalDashboard({ apiFetch, settings, onNavigate, renderLegacy }) {
  const [today] = useState(() => bangkokDateOf(new Date().toISOString()));
  const [range, setRange] = useState(() => ({ from: addDaysToDateKey(today, -6), to: today }));
  const [draft, setDraft] = useState(range);
  const [view, setView] = useState("overview");
  const [staffId, setStaffId] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [type, setType] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(null);
  const generation = useRef(0);
  const detailRef = useRef(null);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true); setError(""); setData(null); setPicked(null);
    try {
      const response = await apiFetch(`/api/store/daily-report?${new URLSearchParams({ view: "operations", ...range })}`);
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "โหลดข้อมูลไม่สำเร็จ");
      if (generation.current === id) setData(json.data);
    } catch (e) { if (generation.current === id) setError(e.message || "โหลดข้อมูลไม่สำเร็จ"); }
    finally { if (generation.current === id) setBusy(false); }
  }, [apiFetch, range]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
  const changeScope = (setter, value) => { setter(value); setPicked(null); };
  const applyRange = (next) => { generation.current++; setData(null); setBusy(true); setPicked(null); setRange(next); setDraft(next); };
  const scope = data ? selectOperationalScope(data, { staffId, branchCode, type }) : null;
  const scopeLabel = `${data?.people.find((person) => person.uid === staffId)?.name || "ทั้งทีม"} · ${range.from} ถึง ${range.to} · ${branchCode || "ทุกสาขา"}`;
  const pick = (part, title, unit, label = scopeLabel) => { setPicked({ title: `${title} · ${part.label}`, rows: part.rows, unit, scopeLabel: label }); setTimeout(() => { detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); detailRef.current?.querySelector("section")?.focus({ preventScroll: true }); }, 0); };
  const charts = (selected, label = scopeLabel) => <div className="sop-charts">
    <StoreDonutChart title="เอกสารที่จัดทำ" unit="เอกสาร" parts={selected.documentParts} onPick={(part) => pick(part, "เอกสารที่จัดทำ", "เอกสาร", label)} />
    <StoreDonutChart title="เคสเกิดในช่วง · สถานะปัจจุบัน" unit="เคส" parts={selected.caseParts} onPick={(part) => pick(part, "เคสเกิดในช่วง", "เคส", label)} />
    <StoreDonutChart title="การรับสินค้า · เคสเกิดในช่วง" unit="รายการสินค้า" parts={selected.receiving} onPick={(part) => pick(part, "การรับสินค้า", "รายการสินค้า", label)} />
  </div>;
  const navigate = (tab) => onNavigate?.(tab);
  const branches = [...new Set(data ? [...data.documents, ...data.cases].map((row) => row.branchCode).filter(Boolean) : [])].sort();
  const moduleName = (id, fallback) => settings?.modules?.find((module) => module.id === id)?.name || fallback;

  return <section className="sop-workspace" aria-label="ศูนย์ปฏิบัติการสโตร์">
    <header className="sop-heading"><div><span className="sop-eyebrow">HILLKOFF / STORE OPERATIONS</span><h2>ศูนย์ปฏิบัติการสโตร์</h2><p>เห็นงานของทีม เข้าใจงานของแต่ละคน และติดตามสินค้าที่ยังรอ</p></div><span className="sop-updated">{data?.generatedAt ? `อัปเดต ${new Date(data.generatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : "ข้อมูลจริงจากเอกสารและทะเบียนเคส"}</span></header>
    <nav className="sop-nav" aria-label="มุมมองปฏิบัติการ">{VIEWS.map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => changeScope(setView, id)}>{label}</button>)}</nav>
    <div className="sop-utility"><button type="button" aria-pressed={view === "planning"} onClick={() => changeScope(setView, "planning")}>แผนงานและปฏิทิน</button>{renderLegacy && <button type="button" aria-pressed={view === "reports"} onClick={() => changeScope(setView, "reports")}>รายงานเดิม / LINE / บันทึกงาน</button>}<button type="button" onClick={() => navigate("store-shortage")}>จัดการทะเบียนเคส / ของขาด</button><button type="button" onClick={() => navigate("store-transfer")}>ไปหน้าใบโอน</button><button type="button" onClick={() => navigate("store-audit")}>ไปหน้า Audit</button></div>
    {view === "planning" ? <StorePlanningPanel apiFetch={apiFetch} staff={(data?.people || []).filter((person) => person.uid !== "unknown" && !person.uid.startsWith("name:")).map((person) => ({ id: person.uid, name: person.name }))} /> : view === "reports" ? renderLegacy?.() : <>
      <form className="sop-filters" onSubmit={(event) => { event.preventDefault(); if (!customRange(draft.from, draft.to)) { setError("ช่วงวันที่ไม่ถูกต้อง หรือเกิน 366 วัน"); return; } applyRange({ ...draft }); }}>
        <div className="sop-presets" aria-label="ช่วงเวลา">{[["วันนี้", today], ["7 วัน", addDaysToDateKey(today, -6)], ["เดือนนี้", `${today.slice(0, 7)}-01`], ["3 เดือน", addDaysToDateKey(today, -89)], ["ทั้งปี", `${today.slice(0, 4)}-01-01`]].map(([label, from]) => <button type="button" key={label} aria-pressed={range.from === from && range.to === today} onClick={() => applyRange({ from, to: today })}>{label}</button>)}</div>
        <label>ตั้งแต่<input aria-label="ตั้งแต่" type="date" required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label>ถึง<input aria-label="ถึง" type="date" required value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label><button type="submit">กำหนดช่วงเอง</button>
        <label>พนักงาน<select value={staffId} onChange={(event) => changeScope(setStaffId, event.target.value)}><option value="">ทุกคน</option>{data?.people.map((person) => <option key={person.uid} value={person.uid}>{person.name}</option>)}</select></label>
        <label>สาขา<select value={branchCode} onChange={(event) => changeScope(setBranchCode, event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch}>{branch}</option>)}</select></label>
        <label>กรองประเภทข้อมูล<select value={type} onChange={(event) => changeScope(setType, event.target.value)}><option value="">ทุกประเภท</option>{DOCUMENT_TYPES.map(([id, label]) => <option key={id} value={id}>{moduleName(SOURCE_TABS[id], label)}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={load}>{busy ? "กำลังโหลด…" : "รีเฟรช"}</button>
      </form>
      <div className="sop-body" aria-busy={busy}>
        <p className="sop-basis">{scopeLabel} · เอกสารใช้วันปฏิบัติงาน · เคสใช้วันเกิด · กิจกรรมใช้ผู้ปิดและวันปิดจริง</p>
        {error && <p className="sop-error" role="alert">{error} <button type="button" onClick={load}>ลองอีกครั้ง</button></p>}
        {busy && <div className="sop-loading" role="status">กำลังรวบรวมเอกสารและเคส…</div>}
        {scope && <>
          <div className="sop-metrics">{[["เอกสารในช่วง", scope.documents.length, "เอกสาร", () => pick({ label: "ทั้งหมด", rows: scope.documents }, "เอกสาร", "เอกสาร")], ["เคสเกิดในช่วง", scope.cohort.length, "เคส", () => pick({ label: "ทั้งหมด", rows: scope.cohort }, "เคสเกิดในช่วง", "เคส")], ["แก้เสร็จ · รับครบในช่วง", scope.activities.filter((row) => row.closure === "fulfilled").length, "กิจกรรมปิด", () => pick(scope.activityParts[0], "กิจกรรมปิดจริง", "กิจกรรม")], ["เคสค้างสะสม", scope.backlog.length, "เคส · ทุกวัน", () => pick({ label: "ยังเปิดทุกวัน", rows: scope.backlog }, "เคสค้างสะสม", "เคส")]].map(([label, value, unit, onClick]) => <button type="button" className="sop-metric" key={label} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{unit}</small></button>)}</div>
          {view === "people" ? <>
            {!staffId && <section className="sop-section"><h3>ผลงานรายบุคคล</h3><p>เลือกพนักงานเพื่อดูเอกสาร เคสที่รับผิดชอบ และกิจกรรมปิดที่ทำจริง</p><div className="sop-people">{!staffId && data.people.map((person) => {
              const own = selectOperationalScope(data, { staffId: person.uid, branchCode, type });
              const label = `${person.name} · ${range.from} ถึง ${range.to} · ${branchCode || "ทุกสาขา"}`;
              return <article className="sop-person" key={person.uid}><header><span className="sop-avatar">{person.name.slice(0, 1)}</span><h3>{person.name}</h3></header><StoreDonutChart title="เอกสารที่จัดทำ" unit="เอกสาร" parts={own.documentParts} onPick={(part) => pick(part, "เอกสารที่จัดทำ", "เอกสาร", label)} /><div className="sop-person-stats"><span>เคสค้าง <b>{own.backlog.length}</b></span><span>กิจกรรมรับครบ <b>{own.activities.filter((row) => row.closure === "fulfilled").length}</b></span></div><button type="button" className="sop-profile-button" onClick={() => changeScope(setStaffId, person.uid)}>เปิดโปรไฟล์ {person.name}</button></article>;
            })}</div></section>}
            {staffId && <><div className="sop-profile"><h3>โปรไฟล์ · {data.people.find((person) => person.uid === staffId)?.name || staffId}</h3><button type="button" onClick={() => changeScope(setStaffId, "")}>กลับไปทุกคน</button></div>{charts(scope)}<StoreDonutChart title="กิจกรรมปิดในช่วง · ผู้ลงมือปิด" unit="กิจกรรม" parts={scope.activityParts} onPick={(part) => pick(part, "กิจกรรมปิดจริง", "กิจกรรม")} /></>}
          </> : view === "quality" ? <>
            {charts(scope)}<div className="sop-quality-charts"><StoreDonutChart title="ประเภทปัญหา · เคสเกิดในช่วง" unit="เคส" parts={scope.categoryParts} onPick={(part) => pick(part, "ประเภทปัญหา", "เคส")} /><StoreDonutChart title="สาเหตุ · เคสเกิดในช่วง" unit="เคส" parts={scope.causeParts} onPick={(part) => pick(part, "สาเหตุ", "เคส")} /></div><section className="sop-section"><h3>รายการที่ยังไม่ทราบการรับ</h3><p>ไม่รวมเคสที่ไม่มีรายการสินค้าหรือจำนวนไม่ครบในวงการรับสินค้า</p><button type="button" onClick={() => pick({ label: "ไม่ทราบรายละเอียดสินค้า", rows: scope.unknownReceiving }, "ความครบถ้วนข้อมูล", "เคส")}>{scope.unknownReceiving.length} เคส · ดูข้อมูลที่ต้องเติม</button></section>
            <StoreDonutChart title="กิจกรรมปิดในช่วง · รับครบแยกจากยกเลิก" unit="กิจกรรม" parts={scope.activityParts} onPick={(part) => pick(part, "กิจกรรมปิดจริง", "กิจกรรม")} />
          </> : <>{charts(scope)}<section className="sop-section sop-shortages"><header><div><h3>{view === "cases" ? "ติดตามเคสและสินค้าค้าง" : "สินค้าที่ยังต้องติดตาม"}</h3><p>เคสที่ยังเปิดทุกวัน · เฉพาะรายการยอดค้างมากกว่าศูนย์ · ไม่รวมยอดต่างหน่วย</p></div><button type="button" onClick={() => pick({ label: "เคสเกิดในช่วงทั้งหมด", rows: scope.cohort }, "ทะเบียนเคส", "เคส")}>ดูเคสทั้งหมดในช่วง</button></header>
            {!scope.shortages.length && <p className="sop-empty">ไม่มีสินค้าค้างที่ระบุจำนวนในขอบเขตนี้</p>}
            <div className="sop-shortage-list">{scope.shortages.map((row) => <article key={row.key}><div className="sop-shortage-title"><div><h4>{row.line.name}</h4><p>{row.sourceNumber || row.sourceId} · {row.staffName} · {row.branchCode || "ไม่ระบุสาขา"}</p></div><strong>{row.remaining} <small>{row.line.unit}</small></strong></div><p>{TRACKING[row.line.trackingStatus] || "ยังไม่ระบุสถานะติดตาม"} · {CATEGORIES[row.line.category || row.category] || "ไม่ระบุประเภท"}{row.overdue && " · เกินวันที่คาดรับ"}</p>
              {(row.line.allocations || []).length ? <div className="sop-allocations">{row.line.allocations.map((allocation, index) => <div key={index}><strong>{allocation.kind === "transfer" ? "รอโอน" : allocation.kind === "supplier" ? "รอซัพพลายเออร์" : "ไม่ระบุประเภทแหล่ง"} · {allocation.quantity} {row.line.unit}</strong><p>ซัพพลายเออร์ {allocation.supplier || "—"} · สาขา {allocation.branch || "—"} · คลัง {allocation.warehouse || "—"}</p><p>PO {allocation.po || "ยังไม่ระบุ"} · ETA {allocation.eta || "ยังไม่ทราบ"}</p><p>ผู้ติดตาม {allocation.owner || "ยังไม่ระบุ"} · ติดตามล่าสุด {allocation.followUp || "ยังไม่ระบุ"}</p></div>)}</div> : <p>ยังไม่มีแหล่งรอรับ / PO / ETA ที่บันทึก</p>}
              <button type="button" className="sop-link" onClick={() => navigate(SOURCE_TABS[row.sourceType])}>เปิดโมดูลต้นทางเพื่อติดตาม</button></article>)}</div>
            {scope.backlog.some((row) => !row.lines?.length) && <button type="button" onClick={() => pick({ label: "เคสค้างที่ไม่มีรายละเอียดสินค้า", rows: scope.backlog.filter((row) => !row.lines?.length) }, "เติมข้อมูลของค้าง", "เคส")}>เคสค้างที่ยังไม่ระบุรายการสินค้า {scope.backlog.filter((row) => !row.lines?.length).length} เคส</button>}
          </section></>}
          <p className="sop-note">การรับนับเป็นรายการสินค้า ไม่ใช่ผลรวมจำนวนข้ามหน่วย · ไม่ทราบรายละเอียดการรับ {scope.unknownReceiving.length} เคส <button type="button" className="sop-link" onClick={() => pick({ label: "ไม่ทราบรายละเอียดสินค้า", rows: scope.unknownReceiving }, "ความครบถ้วนข้อมูล", "เคส")}>ดูรายการ</button></p>
          <div ref={detailRef}>{picked && <Records picked={picked} onClose={() => setPicked(null)} onNavigate={navigate} />}</div>
        </>}
      </div>
    </>}
    <footer className="sop-footer">สถานะปัจจุบันของเอกสารและเคส ไม่ใช่ภาพ ณ สิ้นวันย้อนหลัง · ข้อมูลเคสเดิมที่ปิดก่อนเริ่มทะเบียนอาจไม่ครบ · จำนวนเอกสารไม่ใช่ชั่วโมงทำงานหรือคะแนนความสามารถ</footer>
  </section>;
}

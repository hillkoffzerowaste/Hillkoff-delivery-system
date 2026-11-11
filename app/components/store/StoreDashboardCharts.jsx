"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bangkokDateOf, jobsOf } from "../../../lib/storeDailyReport.js";
import { analyzeCases, summarizeCases } from "../../../lib/storeCases.js";
import "./StoreCasesPanel.css";

const TYPES = [["booking", "ใบสั่งจอง"], ["online", "ออนไลน์"], ["transfer", "ใบโอน"], ["auditDocs", "Audit"]];
const COLORS = ["#0f766e", "#329b92", "#75bab1", "#bddfd7"];
function Donut({ values, label }) {
  const total = values.reduce((sum, n) => sum + n, 0);
  let start = 0;
  const stops = values.map((n, i) => { const end = start + (total ? n / total * 100 : 0); const part = `${COLORS[i % COLORS.length]} ${start}% ${end}%`; start = end; return part; });
  return <div className="sc-donut" role="img" aria-label={label} style={{ background: total ? `conic-gradient(${stops.join(",")})` : "#e4eeeb" }}><span>{total}</span></div>;
}
export function DocumentCharts({ data, onPick }) {
  const rows = data.people.filter((row) => jobsOf(row) > 0);
  const max = Math.max(1, ...rows.map(jobsOf));
  return <section className="sc-section" aria-label="กราฟเอกสารรายคน">
    <h3>เอกสารที่จัดทำรายคน</h3><p className="muted">เอกสารเป็นคนละหน่วยกับสินค้าและเคส · งานจัดเอกสารไม่ใช่คะแนนความสามารถ</p>
    <p>{data.total} เอกสาร · พนักงานมีงาน {data.activePeople} คน · ไม่ทราบผู้ทำแสดงแยก</p>
    {!rows.length && <p>ไม่มีเอกสารในช่วงที่เลือก</p>}
    {rows.map((row) => <button type="button" className="sc-bar-row" key={row.uid} aria-label={`เจาะเอกสารของ ${row.name}`} onClick={() => onPick(row.uid)}>
      <strong>{row.name}</strong><span className="sc-bar-track">{TYPES.map(([key, label], i) => <span key={key} title={`${label} ${row[key]} เอกสาร`} style={{ width: `${row[key] / max * 100}%`, background: COLORS[i] }}>{row[key] > 0 ? row[key] : ""}</span>)}</span>
      <small>{TYPES.map(([key, label]) => `${label} ${row[key]} เอกสาร`).join(" · ")}</small>
    </button>)}
    <div className="sc-donuts">{rows.map((row) => <button type="button" className="sc-person-donut" key={row.uid} onClick={() => onPick(row.uid)} aria-label={`สัดส่วนเอกสารของ ${row.name}`}><Donut values={TYPES.map(([key]) => row[key])} label={`${row.name}: ${TYPES.map(([key, label]) => `${label} ${row[key]}`).join(" · ")}`} /><strong>{row.name}</strong></button>)}</div>
  </section>;
}
export function CaseSummary({ summary }) {
  return <section className="sc-section" aria-label="สรุปเคส"><h3>ทะเบียนเคส · สถานะปัจจุบัน</h3>
    <div className="sc-kpis">{[["เคสเกิดในช่วง", summary.created], ["ยังเปิดในชุดเดียวกัน", summary.cohortOpen], ["ปิดในชุดเดียวกัน", summary.cohortClosed], ["รับครบในช่วง (กิจกรรม)", summary.resolvedActivities], ["ยกเลิกในช่วง (กิจกรรม)", summary.cancelledActivities], ["ข้อยกเว้นในช่วง (กิจกรรม)", summary.exceptionActivities], ["ค้างสะสมทุกวัน", summary.backlog]].map(([label, n]) => <article key={label}><span>{label}</span><strong>{n}</strong></article>)}</div>
    <div className="sc-case-donut"><Donut values={[summary.cohortOpen, summary.cohortClosed]} label={`เคสเกิดในช่วง: ยังเปิด ${summary.cohortOpen} ปิด ${summary.cohortClosed}`} /><p>เฉพาะเคสเกิดในช่วง: ยังเปิด {summary.cohortOpen} · ปิด {summary.cohortClosed}<br />ค้างสะสม {summary.backlog} แยกจากเคสชุดนี้</p></div>
    <p className="muted">รายงานย้อนหลังแสดงสถานะปัจจุบัน ไม่ใช่ภาพค้าง ณ สิ้นวัน · เคสในทะเบียนและปัญหาปัจจุบัน · ข้อมูลเก่าที่ปิดก่อนเริ่มทะเบียนอาจไม่ครบ · ข้อมูลเดิมใช้วันสร้างเอกสารแทนวันพบปัญหาที่ไม่ทราบ · กิจกรรมปิดนับจากเวลาปิดจริงและยังคงอยู่เมื่อเปิดใหม่</p>
  </section>;
}
export function CaseAnalysis({ items, today }) {
  const analysis = analyzeCases(items, today);
  return <section className="sc-section"><h3>วิเคราะห์เคสค้าง · เกินกำหนด {analysis.overdue} เคส</h3><p>เกินกำหนดนับเฉพาะแหล่งที่มีวันที่คาดรับ · วันที่ไม่ทราบไม่ถือว่าทันกำหนด</p><div className="sc-analysis">{[["byCategory", "ประเภทปัญหา"], ["byCause", "สาเหตุ"], ["byProduct", "สินค้า"], ["byBranch", "สาขา"], ["bySource", "แหล่งที่รอ"], ["byAge", "อายุเคส"]].map(([key, label]) => <table key={key}><caption>{label} · จำนวนเคส (หนึ่งเคสอยู่ได้หลายกลุ่มสินค้า/แหล่ง)</caption><thead><tr><th>{label}</th><th>เคส</th></tr></thead><tbody>{analysis[key].map((row) => <tr key={row.key}><td>{row.key}</td><td>{row.count}</td></tr>)}</tbody></table>)}</div></section>;
}
export default function StoreDashboardCharts({ apiFetch, settings }) {
  const today = bangkokDateOf(new Date().toISOString());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [staffId, setStaffId] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [data, setData] = useState(null);
  const [caseData, setCaseData] = useState(null);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ from, to, staffId, branchCode });
      const responses = await Promise.all([apiFetch(`/api/store/daily-report?${query}`), apiFetch(`/api/store/cases?${query}`)]);
      const json = await Promise.all(responses.map((res) => res.json()));
      for (let i = 0; i < json.length; i++) if (!responses[i].ok || !json[i].ok) throw new Error(json[i].error || "โหลดรายงานไม่สำเร็จ");
      if (id === generation.current) { setData(json[0].data); setCaseData(json[1].data); setPicked(""); }
    } catch (e) { if (id === generation.current) { setError(e.message); setData(null); setCaseData(null); } }
    finally { if (id === generation.current) setBusy(false); }
  }, [apiFetch, from, to, staffId, branchCode]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { load(); return invalidate; }, [load, invalidate]);
  const summary = caseData ? summarizeCases(caseData.items, { from, to, staffId, branchCode, activityActorId: staffId }) : null;
  return <section className="sc-dashboard" aria-label="แดชบอร์ดเอกสารและเคส">
    <h2>แดชบอร์ดเอกสารและเคส</h2><div className="sc-filters"><label>ตั้งแต่<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>ถึง<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><label>พนักงาน<select value={staffId} onChange={(e) => setStaffId(e.target.value)}><option value="">ทุกคน</option>{(data?.staffChoices || settings?.staff || []).filter((p) => (p.uid || p.id) !== "unknown").map((p) => <option key={p.uid || p.id} value={p.uid || p.id}>{p.name}</option>)}<option value="unknown">ไม่ทราบผู้ทำ</option></select></label><label>สาขา<select value={branchCode} onChange={(e) => setBranchCode(e.target.value)}><option value="">ทุกสาขา</option>{(settings?.branches || []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select></label><button type="button" disabled={busy} onClick={load}>ปรับปรุงข้อมูล</button></div>
    {busy && <p role="status">กำลังโหลดแดชบอร์ด…</p>}{error && <p role="alert">{error}</p>}
    {!busy && data && <><p className="muted">ข้อมูลล่าสุด {data.generatedAt ? new Date(data.generatedAt).toLocaleString("th-TH") : "—"} · สถานะปัจจุบัน</p><DocumentCharts data={data} onPick={setPicked} />{picked && <div className="sc-section"><h3>เอกสารที่เลือก</h3><ul>{data.documents.filter((row) => row.staffId === picked).map((row) => <li key={`${row.type}:${row.id}`}>{row.date} · {row.number} · {TYPES.find(([key]) => key === row.type)?.[1]} · {row.staffName}</li>)}</ul></div>}</>}
    {!busy && summary && <><CaseSummary summary={summary} /><CaseAnalysis items={caseData.items.filter((item) => (!staffId || (staffId === "unknown" ? !item.responsibleId : item.responsibleId === staffId)) && (!branchCode || item.branchCode === branchCode))} today={today} /><section className="sc-section"><h3>เคสเร่งติดตาม · เกินกำหนดก่อน แล้วเก่าก่อน</h3>{summary.urgent.length ? <ul>{summary.urgent.slice(0, 20).map((item) => <li key={item.id}>{item.sourceNumber} · {item.responsibleName || "ไม่ทราบผู้รับผิดชอบ"} · {item.note || item.cause || "ไม่ระบุสาเหตุ"} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString("th-TH") : "ไม่ทราบวันที่"}</li>)}</ul> : <p>ไม่มีเคสค้าง</p>}{summary.urgent.length > 20 && <p>แสดง 20 จาก {summary.urgent.length} เคส · เปิดทะเบียนสินค้าขาดเพื่อดูทั้งหมด</p>}</section></>}
  </section>;
}

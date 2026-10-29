"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bangkokTimeHHmm, fmt, thaiDateLabel } from "../../../lib/storeFormat.js";
import { bangkokDateOf } from "../../../lib/storeOverview.js";
import "./StoreOverviewPanel.css";
import StorePlanningPanel from "./StorePlanningPanel.jsx";

const REFRESH_MS = 900_000;
const PERIODS = [
  { id: "today", label: "วันนี้" },
  { id: "7d", label: "7 วัน" },
  { id: "month", label: "เดือนนี้" }
];
const MODULE_ROWS = [
  { id: "store-booking", key: "booking", fallback: "ใบสั่งจอง", source: "โมดูลเดิม · ของไม่ครบ / รอของ" },
  { id: "store-online", key: "online", fallback: "ใบขายออนไลน์", source: "โมดูลเดิม · ของไม่ครบ / ห้องแพ็คส่งกลับ" },
  { id: "store-transfer", key: "transfer", fallback: "ใบโอนสินค้า", source: "โมดูลใหม่ · สินค้าไม่ครบ / ยังไม่แก้ไข" },
  { id: "store-audit", key: "audit", fallback: "Internal Audit", source: "โมดูลใหม่ · จำนวนรายการที่นับไม่ตรง" }
];
// เว้นที่เหนือแท่งที่สูงสุดไว้ให้ตัวเลขค่าบนแท่งและป้ายเส้นเฉลี่ย
const CHART_HEADROOM = 1.15;

export function formatResolveHours(hours) {
  return Number.isFinite(hours) ? `${hours.toFixed(1)} ชม.` : "—";
}

export function formatRate(rate) {
  return Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : "—";
}

export function formatAccuracy(accuracy) {
  return Number.isFinite(accuracy) ? `${(accuracy * 100).toFixed(1)}%` : "—";
}

export function chartScale(daily = [], avg = 0) {
  return Math.max(1, avg, ...daily.map((day) => day.total)) * CHART_HEADROOM;
}

// ความสูงแท่ง (เปอร์เซ็นต์ของพื้นที่กราฟ); แท่งไม่ตรงที่มีค่าอย่างน้อย 1.5% เพื่อให้มองเห็น
export function barHeights(day, scale) {
  if (!day || !(scale > 0)) return { match: 0, mismatch: 0 };
  const mismatch = day.mismatch > 0 ? Math.max(1.5, (day.mismatch / scale) * 100) : 0;
  return { match: ((day.total - day.mismatch) / scale) * 100, mismatch };
}

export function branchWidths(row, max) {
  const base = Math.max(1, max);
  return { resolved: (row.resolved / base) * 100, open: (row.open / base) * 100 };
}

function moduleName(settings, id, fallback) {
  const found = Array.isArray(settings?.modules) ? settings.modules.find((item) => item.id === id) : null;
  return found?.name || fallback;
}

function dayParts(dateKey) {
  const [weekday, day, month] = thaiDateLabel(dateKey).split(" ");
  return { weekday, day, month };
}

function stamp(iso, today) {
  const time = bangkokTimeHHmm(iso);
  if (!time) return "";
  const dateKey = bangkokDateOf(iso);
  if (dateKey === today) return `วันนี้ ${time}`;
  const { day, month } = dayParts(dateKey);
  return `${day} ${month} ${time}`;
}

function Kpi({ tone, label, value, sub }) {
  return (
    <article className={`so-kpi so-kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function DailyChart({ audits, rangeLabel }) {
  const daily = audits?.daily || [];
  const dense = daily.length > 7;
  const scale = chartScale(daily, audits?.avg || 0);
  const label = `กราฟจำนวนตรวจนับรายวัน ${rangeLabel} รวม ${fmt(audits?.total || 0)} รายการ เฉลี่ย ${fmt(audits?.avg || 0)} รายการต่อวัน`;
  const avgBottom = `${((audits?.avg || 0) / scale) * 100}%`;
  return (
    <>
      <figure className="so-chart" role="img" aria-label={label}>
        {audits ? (
          <>
            <div className="so-avg-line" aria-hidden="true" style={{ bottom: avgBottom }} />
            <span className="so-avg-label" aria-hidden="true" style={{ bottom: `calc(${avgBottom} + 4px)` }}>เฉลี่ย {fmt(audits.avg)}</span>
            <div className={dense ? "so-bars is-dense" : "so-bars"}>
              {daily.map((day) => {
                const { weekday, day: dayNo, month } = dayParts(day.date);
                const heights = barHeights(day, scale);
                return (
                  <div key={day.date} className="so-bar" title={`${weekday} ${dayNo} ${month}: ตรวจนับ ${fmt(day.total)} · ไม่ตรง ${fmt(day.mismatch)}`}>
                    {!dense && <span className="so-bar-value">{day.total ? fmt(day.total) : "—"}</span>}
                    <div className="so-bar-mismatch" style={{ height: `${heights.mismatch}%` }} />
                    <div className={day.mismatch ? "so-bar-match" : "so-bar-match is-solo"} style={{ height: `${heights.match}%` }} />
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </figure>
      <div className={dense ? "so-axis is-dense" : "so-axis"} aria-hidden="true">
        {daily.map((day) => {
          const { weekday, day: dayNo } = dayParts(day.date);
          return <span key={day.date}>{dense ? dayNo : `${weekday} ${dayNo}`}</span>;
        })}
      </div>
    </>
  );
}

function ReportCharts({ data, source, onNavigate }) {
  if (!data?.reportCharts) return null;
  const chart = data.reportCharts;
  const types = source === "booking" ? ["booking"] : source === "online" ? ["online"] : ["booking", "online"];
  const docs = types.reduce((sum, type) => sum + (data.modules?.[type]?.docs || 0), 0);
  const problems = types.reduce((sum, type) => sum + (data.modules?.[type]?.problems || 0), 0);
  const open = types.reduce((sum, type) => sum + (data.modules?.[type]?.open || 0), 0);
  const resolved = types.reduce((sum, type) => sum + (chart.resolvedByType?.[type] || 0), 0);
  const values = chart.daily.map((day) => ({ ...day, total: types.reduce((sum, type) => sum + day[type], 0) }));
  const max = Math.max(1, ...values.map((day) => day.total));
  const problemDays = values.map(day => ({ ...day, issueCount: types.reduce((sum,type) => sum + day[`${type}Problems`], 0), resolvedCount: types.reduce((sum,type) => sum + day[`${type}Resolved`], 0) }));
  const problemMax = Math.max(1, ...problemDays.map(day => day.issueCount));
  const issues = chart.issues.filter((item) => types.includes(item.type)).slice(0, 20);
  return <>
    <div className="store-report-kpis so-kpis"><Kpi tone="neutral" label="เอกสารทั้งหมด" value={fmt(docs)} sub="ตามช่วงวันที่เลือก"/><Kpi tone="danger" label="รายการที่เคยมีปัญหา" value={fmt(problems)} sub={`ยังต้องติดตาม ${fmt(open)} รายการ`}/><Kpi tone="brand" label="ปัญหาที่ตรวจครบแล้ว" value={fmt(resolved)} sub="อิงประวัติห้องแพ็ค"/></div>
    <div className="so-row"><section className="so-card so-card-wide"><h3>ใบสั่งจองและใบขายออนไลน์รายวัน</h3><div className="so-legend">{types.includes("booking")&&<span><i className="so-swatch so-swatch-match"/>ใบสั่งจอง</span>}{types.includes("online")&&<span><i className="so-swatch so-swatch-resolved"/>ใบขายออนไลน์</span>}</div><figure className="so-chart" role="img" aria-label={`กราฟเอกสารรายวัน ${data.rangeLabel}`}><div className={values.length > 7 ? "so-bars is-dense" : "so-bars"}>{values.map(day=><div className="so-bar" key={day.date} title={`${thaiDateLabel(day.date)} · ใบสั่งจอง ${day.booking} · ออนไลน์ ${day.online} · พบปัญหา ${source === "booking" ? day.bookingProblems : source === "online" ? day.onlineProblems : day.problems}`}><span className="so-bar-value">{day.total || ""}</span>{types.includes("online")&&<div className="so-bar-online" style={{height:`${day.online/max*85}%`}}/>}{types.includes("booking")&&<div className="so-bar-match" style={{height:`${day.booking/max*85}%`}}/>}</div>)}</div></figure><div className={values.length > 7 ? "so-axis is-dense" : "so-axis"} aria-hidden="true">{values.map(day=><span key={day.date}>{Number(day.date.slice(8))}</span>)}</div></section>
    <section className="so-card"><h3>ปัญหาและแนวทางติดตาม</h3>{issues.length?issues.map(item=><div key={item.id} className="so-item is-danger"><div><b>{item.bookingNumber||"ไม่มีเลขเอกสาร"}</b> · {item.type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}<div className="so-item-note">{item.reason || item.detail || "ยังไม่ระบุรายละเอียด"}</div><small>{item.packStatus === "returned" ? "แนวทาง: ตรวจเหตุผล แก้ไขข้อมูล แล้วส่งตรวจใหม่" : "แนวทาง: ตรวจรายละเอียดและติดตามสินค้าหรือข้อมูลที่ค้าง"}</small></div></div>):<p className="so-empty">ไม่พบปัญหาค้างในช่วงวันที่เลือก</p>}{issues.length>0&&<small className="muted">แสดงไม่เกิน 20 รายการล่าสุดในช่วงวันที่เลือก</small>}<div><button type="button" className="so-link" onClick={()=>onNavigate?.(source === "online" ? "store-online" : "store-booking")}>ไปตรวจเอกสาร</button></div></section></div>
    <section className="so-card"><h3>ปัญหาและผลการแก้ไขตามวันที่สร้างเอกสาร</h3><p className="muted">จำนวนปัญหาที่พบ เทียบกับรายการที่ห้องแพ็คตรวจครบแล้วในปัจจุบัน</p><div className="so-legend"><span><i className="so-swatch so-swatch-open"/>มีปัญหา</span><span><i className="so-swatch so-swatch-match"/>ตรวจครบแล้ว</span></div><figure className="so-chart" role="img" aria-label={`กราฟปัญหาและผลแก้ไข ${data.rangeLabel}`}><div className={problemDays.length > 7 ? "so-bars is-dense" : "so-bars"}>{problemDays.map(day=><div className="so-problem-pair" key={day.date} title={`${thaiDateLabel(day.date)} · ปัญหา ${day.issueCount} · ตรวจครบ ${day.resolvedCount}`}><div className="so-problem-bar" style={{height:`${day.issueCount/problemMax*90}%`}}/><div className="so-resolved-bar" style={{height:`${day.resolvedCount/problemMax*90}%`}}/></div>)}</div></figure><div className={problemDays.length > 7 ? "so-axis is-dense" : "so-axis"} aria-hidden="true">{problemDays.map(day=><span key={day.date}>{Number(day.date.slice(8))}</span>)}</div></section>
  </>;
}

export default function StoreOverviewPanel({ apiFetch, settings, onNavigate }) {
  const [period, setPeriod] = useState("7d");
  const [view, setView] = useState("dashboard");
  const [source, setSource] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/store/overview?period=${period}`);
      const json = await res.json().catch(() => ({}));
      if (id !== requestId.current) return;
      if (!res.ok || !json.ok) throw new Error(json.error || "โหลดรายงานแดชบอร์ดไม่สำเร็จ");
      setData(json.data);
      setError("");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e.message || "โหลดรายงานแดชบอร์ดไม่สำเร็จ");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [apiFetch, period]);

  useEffect(() => {
    load();
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const transfers = data?.transfers;
  const audits = data?.audits;
  const today = bangkokDateOf(new Date().toISOString());
  const rangeLabel = data?.rangeLabel || "";
  const dash = "—";
  const maxIssues = Math.max(1, ...(transfers?.byDestination || []).map((row) => row.resolved + row.open));
  const moduleValues = {
    booking: data?.modules?.booking,
    online: data?.modules?.online,
    transfer: transfers && { docs: transfers.total, problems: transfers.incomplete, open: transfers.open },
    audit: audits && { docs: audits.docs, problems: audits.mismatch, open: null }
  };

  return (
    <section className="panel role-workspace so-workspace">
      <div className="so-view-tabs" role="tablist" aria-label="หน้ารายงานสโตร์"><button type="button" role="tab" aria-selected={view === "dashboard"} className={view === "dashboard" ? "primary" : "secondary"} onClick={()=>setView("dashboard")}>แดชบอร์ด</button><button type="button" role="tab" aria-selected={view === "planning"} className={view === "planning" ? "primary" : "secondary"} onClick={()=>setView("planning")}>แผนงานและปฏิทิน</button></div>
      {view === "planning" ? <StorePlanningPanel apiFetch={apiFetch}/> : <>
      <header className="store-report-header">
        <div>
          <span className="store-report-eyebrow">STORE REPORT</span>
          <h2>รายงานแดชบอร์ดสโตร์</h2>
          <p>ภาพรวมใบโอนสินค้าและ Internal Audit พร้อมยอดจากใบสั่งจอง / ใบขายออนไลน์{rangeLabel ? ` · ${rangeLabel}` : ""}</p>
        </div>
        <div className="store-report-header-tools">
          <div className="so-periods" role="group" aria-label="ช่วงเวลา">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" className={period === item.id ? "primary" : "secondary"} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>
            ))}
          </div>
        </div>
      </header>

      <label className="so-source-filter">กรองประเภทข้อมูล <select aria-label="กรองประเภทข้อมูล" value={source} onChange={e=>setSource(e.target.value)}><option value="all">ทุกประเภท</option><option value="booking">ใบสั่งจอง</option><option value="online">ใบขายออนไลน์</option><option value="transfer">ใบโอนสินค้า</option><option value="audit">Internal Audit</option></select></label>
      {error && <p className="so-message is-error" role="alert">{error}</p>}
      {data?.openTransfersCapped && <p className="so-message" role="status">รายการใบโอนค้างมีจำนวนมาก รายการที่แสดงอาจไม่ครบ</p>}
      {loading && !error && <p className="so-message" role="status">กำลังโหลดข้อมูล...</p>}

      {["all", "booking", "online"].includes(source) && <ReportCharts data={data} source={source} onNavigate={onNavigate}/>}
      {["all", "transfer", "audit"].includes(source) && <div className="store-report-kpis so-kpis">
        {["all", "transfer"].includes(source) && <><Kpi tone="neutral" label="ใบโอนทั้งหมด" value={transfers ? fmt(transfers.total) : dash} sub={transfers ? `ครบ ${fmt(transfers.complete)} · ไม่ครบ ${fmt(transfers.incomplete)}` : dash} />
        <Kpi tone="danger" label="ไม่ครบ · ค้างแก้ไข" value={transfers ? fmt(transfers.open) : dash} sub={`ใช้เวลาแก้ไขเฉลี่ย ${formatResolveHours(transfers?.avgResolveHours)}`} />
        <Kpi tone="info" label="อัตราแก้ไขแล้ว" value={formatRate(transfers?.resolveRate)} sub={transfers ? `แก้ไขแล้ว ${fmt(transfers.resolved)} จาก ${fmt(transfers.incomplete)}` : dash} />
        </>}
        {["all", "audit"].includes(source) && <><Kpi tone="brand" label="ตรวจนับทั้งหมด" value={audits ? fmt(audits.total) : dash} sub={audits ? `${fmt(audits.docs)} เอกสาร · ไม่ตรง ${fmt(audits.mismatch)}` : dash} />
        <Kpi tone="deep" label="ความแม่นยำสต็อก" value={formatAccuracy(audits?.accuracy)} sub="สินค้าตรง ÷ ตรวจนับทั้งหมด" />
        <Kpi tone="info-dark" label="เฉลี่ยตรวจนับต่อวัน" value={audits ? fmt(audits.avg) : dash} sub={`รายการ/วัน · ${audits ? fmt(audits.activeDays) : dash} วันที่มีการตรวจ`} />
        </>}
      </div>}

      {["all", "transfer", "audit"].includes(source) && <div className="so-row">
        {["all", "audit"].includes(source) && <section className="so-card so-card-wide" aria-label="ตรวจนับรายวัน">
          <div className="so-card-head">
            <h3>จำนวนตรวจนับรายวัน</h3>
            <div className="so-legend">
              <span><i className="so-swatch so-swatch-match" aria-hidden="true" />สินค้าตรง</span>
              <span><i className="so-swatch so-swatch-mismatch" aria-hidden="true" />สินค้าไม่ตรง</span>
              <span><i className="so-swatch so-swatch-avg" aria-hidden="true" />เฉลี่ย/วัน</span>
            </div>
          </div>
          <DailyChart audits={audits} rangeLabel={rangeLabel} />
        </section>}

        {["all", "transfer"].includes(source) && <section className="so-card" aria-label="ใบโอนไม่ครบแยกสาขา">
          <div>
            <h3>ใบโอนไม่ครบ แยกสาขาปลายทาง</h3>
            <div className="so-legend">
              <span><i className="so-swatch so-swatch-resolved" aria-hidden="true" />แก้ไขแล้ว</span>
              <span><i className="so-swatch so-swatch-open" aria-hidden="true" />ยังไม่แก้ไข</span>
            </div>
          </div>
          {(transfers?.byDestination || []).map((row) => {
            const widths = branchWidths(row, maxIssues);
            return (
              <div key={row.code} className="so-branch">
                <div className="so-branch-head"><b>{row.name}</b><span>ไม่ครบ {fmt(row.resolved + row.open)} · ค้าง {fmt(row.open)}</span></div>
                <div className="so-branch-bar" aria-hidden="true">
                  <div className="so-branch-resolved" style={{ width: `${widths.resolved}%` }} />
                  <div className="so-branch-open" style={{ width: `${widths.open}%` }} />
                </div>
              </div>
            );
          })}
          {transfers && transfers.byDestination.length === 0 && <p className="so-empty">ไม่มีใบโอนไม่ครบในช่วงนี้</p>}
        </section>}
      </div>}

      {["all", "transfer", "audit"].includes(source) && <div className="so-row">
        {["all", "transfer"].includes(source) && <section className="so-card" aria-label="งานค้างแก้ไข">
          <div className="so-card-head">
            <h3>ใบโอนค้างแก้ไข</h3>
            <button type="button" className="so-link" onClick={() => onNavigate?.("store-transfer")}>ไปหน้าใบโอน</button>
          </div>
          <div className="so-list">
            {(transfers?.openList || []).map((row) => (
              <div key={row.id || row.transferNumber} className="so-item is-danger">
                <div>
                  <b>{row.transferNumber}</b> <span>· {row.fromBranchName} → {row.toBranchName}</span>
                  {row.note && <div className="so-item-note">{row.note}</div>}
                </div>
                <span className="so-item-meta">{stamp(row.createdAt, today)}</span>
              </div>
            ))}
            {transfers && transfers.openList.length === 0 && <p className="so-empty">ไม่มีใบโอนค้างแก้ไข</p>}
          </div>
        </section>}

        {["all", "audit"].includes(source) && <section className="so-card" aria-label="ตรวจนับพบสินค้าไม่ตรง">
          <div className="so-card-head">
            <h3>ตรวจนับพบสินค้าไม่ตรงล่าสุด</h3>
            <button type="button" className="so-link" onClick={() => onNavigate?.("store-audit")}>ไปหน้า Audit</button>
          </div>
          <div className="so-list">
            {(audits?.latestMismatched || []).map((row) => (
              <div key={row.id || row.documentNumber} className="so-item is-accent">
                <div>
                  <b>{row.documentNumber}</b> <span>· {[row.branchName, row.zone].filter(Boolean).join(" ")}</span>
                  {row.note && <div className="so-item-note">{row.note}</div>}
                </div>
                <span className="so-item-meta">ไม่ตรง {fmt(row.mismatch)} / {fmt(row.total)}</span>
              </div>
            ))}
            {audits && audits.latestMismatched.length === 0 && <p className="so-empty">ไม่พบสินค้าไม่ตรงในช่วงนี้</p>}
          </div>
        </section>}
      </div>}

      <section className="so-table-section" aria-label="ภาพรวมทุกโมดูล">
        <h3>ภาพรวมทุกโมดูลสโตร์{rangeLabel ? ` · ${rangeLabel}` : ""}</h3>
        <div className="store-report-table-wrap">
          <table className="store-report-table so-table" aria-label="ภาพรวมทุกโมดูล">
            <thead>
              <tr>
                <th scope="col">โมดูล</th>
                <th scope="col" className="so-num">เอกสาร</th>
                <th scope="col" className="so-num">มีปัญหา</th>
                <th scope="col" className="so-num">ค้างอยู่</th>
                <th scope="col">ที่มาข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_ROWS.filter((row) => source === "all" || source === row.key).map((row) => {
                const values = moduleValues[row.key];
                const hasOpen = Number.isFinite(values?.open);
                return (
                  <tr key={row.id}>
                    <th scope="row">{moduleName(settings, row.id, row.fallback)}</th>
                    <td className="so-num">{values ? fmt(values.docs) : dash}</td>
                    <td className={values?.problems > 0 ? "so-num is-accent" : "so-num"}>{values ? fmt(values.problems) : dash}</td>
                    <td className={values?.open > 0 ? "so-num is-danger" : "so-num"}>{hasOpen ? fmt(values.open) : dash}</td>
                    <td className="so-source">{row.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      </>}
    </section>
  );
}

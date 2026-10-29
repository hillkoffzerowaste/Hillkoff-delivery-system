"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bangkokTimeHHmm, fmt, pct, thaiDateLabel, thaiMonthLabel } from "../../../lib/storeFormat.js";
import { DAILY_CHART_MAX_DAYS, MAX_RANGE_DAYS, bangkokDateOf, customRange } from "../../../lib/storeOverview.js";
import { workLogHours } from "../../../lib/storeWorkLog.js";
import "./StoreOverviewPanel.css";
import StorePlanningPanel from "./StorePlanningPanel.jsx";

const REFRESH_MS = 900_000;
const PERIODS = [
  { id: "today", label: "วันนี้" },
  { id: "7d", label: "7 วัน" },
  { id: "month", label: "เดือนนี้" },
  { id: "3m", label: "3 เดือน" },
  { id: "year", label: "ทั้งปี" },
  { id: "custom", label: "กำหนดช่วงเอง" }
];
const MODULE_ROWS = [
  { id: "store-booking", key: "booking", fallback: "ใบสั่งจอง", source: "โมดูลเดิม · ของไม่ครบ / รอของ" },
  { id: "store-online", key: "online", fallback: "ใบขายออนไลน์", source: "โมดูลเดิม · ของไม่ครบ / ห้องแพ็คส่งกลับ" },
  { id: "store-transfer", key: "transfer", fallback: "ใบโอนสินค้า", source: "โมดูลใหม่ · สินค้าไม่ครบ / ยังไม่แก้ไข" },
  { id: "store-audit", key: "audit", fallback: "Internal Audit", source: "โมดูลใหม่ · จำนวนรายการที่นับไม่ตรง" }
];
// เว้นที่เหนือแท่งที่สูงสุดไว้ให้ตัวเลขค่าบนแท่งและป้ายเส้นเฉลี่ย
const CHART_HEADROOM = 1.15;
// แกนนอนแสดงป้ายไม่เกินประมาณนี้ ที่เหลือดูจาก tooltip ของแท่ง
const AXIS_LABELS = 16;

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

// Bars are days ("2026-10-28") or, for long ranges, months ("2026-10").
export function barLabel(key, granularity) {
  if (granularity === "month") return thaiMonthLabel(key).replace(/ 25(\d\d)$/, " $1");
  return String(Number(key.slice(8)));
}

export function barTitle(key, granularity) {
  return granularity === "month" ? thaiMonthLabel(key) : thaiDateLabel(key);
}

// Multi-month figures barely move within 15 minutes, so long ranges load on demand only (saves reads).
export function autoRefreshes(period, custom) {
  if (period === "3m" || period === "year") return false;
  if (period === "custom") return (customRange(custom?.from, custom?.to)?.dates.length || 0) <= DAILY_CHART_MAX_DAYS;
  return true;
}

export function overviewQuery(period, custom) {
  return period === "custom" ? `period=custom&from=${encodeURIComponent(custom.from)}&to=${encodeURIComponent(custom.to)}` : `period=${period}`;
}

function moduleName(settings, id, fallback) {
  const found = Array.isArray(settings?.modules) ? settings.modules.find((item) => item.id === id) : null;
  return found?.name || fallback;
}

function stamp(iso, today) {
  const time = bangkokTimeHHmm(iso);
  if (!time) return "";
  const dateKey = bangkokDateOf(iso);
  if (dateKey === today) return `วันนี้ ${time}`;
  const [, day, month] = thaiDateLabel(dateKey).split(" ");
  return `${day} ${month} ${time}`;
}

function Stat({ label, value, sub, tone }) {
  return <div className={tone ? `so-stat is-${tone}` : "so-stat"}><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

function ModuleCard({ title, tone, children, link, onNavigate }) {
  return <article className={`so-module so-module-${tone}`}>
    <div className="so-card-head"><h3>{title}</h3>{link && <button type="button" className="so-link" onClick={() => onNavigate?.(link.tab)}>{link.label}</button>}</div>
    <div className="so-stats">{children}</div>
  </article>;
}

function Axis({ bars, granularity }) {
  const step = Math.max(1, Math.ceil(bars.length / AXIS_LABELS));
  return <div className={bars.length > 7 ? "so-axis is-dense" : "so-axis"} aria-hidden="true">
    {bars.map((bar, index) => <span key={bar.date}>{index % step === 0 ? barLabel(bar.date, granularity) : ""}</span>)}
  </div>;
}

function StackChart({ bars, series, granularity, label }) {
  const max = Math.max(1, ...bars.map((bar) => series.reduce((sum, item) => sum + bar[item.key], 0))) * CHART_HEADROOM;
  const dense = bars.length > 7;
  return <>
    <figure className="so-chart" role="img" aria-label={label}>
      <div className={dense ? "so-bars is-dense" : "so-bars"}>
        {bars.map((bar) => {
          const total = series.reduce((sum, item) => sum + bar[item.key], 0);
          return <div className="so-bar" key={bar.date} title={`${barTitle(bar.date, granularity)} · ${series.map((item) => `${item.label} ${fmt(bar[item.key])}`).join(" · ")}`}>
            {!dense && <span className="so-bar-value">{total ? fmt(total) : ""}</span>}
            {[...series].reverse().map((item, index) => bar[item.key] > 0 && <div key={item.key} className={`${item.className}${index === 0 ? " is-top" : ""}`} style={{ height: `${(bar[item.key] / max) * 100}%` }} />)}
          </div>;
        })}
      </div>
    </figure>
    <Axis bars={bars} granularity={granularity} />
  </>;
}

function Legend({ items }) {
  return <div className="so-legend">{items.map(([className, text]) => <span key={text}><i className={`so-swatch ${className}`} aria-hidden="true" />{text}</span>)}</div>;
}

function AuditChart({ audits, rangeLabel, granularity }) {
  const daily = audits?.daily || [];
  const avg = audits?.chartAvg ?? audits?.avg ?? 0;
  const scale = chartScale(daily, avg);
  const per = granularity === "month" ? "เดือน" : "วัน";
  const avgBottom = `${(avg / scale) * 100}%`;
  return <>
    <figure className="so-chart" role="img" aria-label={`กราฟจำนวนตรวจนับ ${rangeLabel} รวม ${fmt(audits?.total || 0)} รายการ เฉลี่ย ${fmt(avg)} รายการต่อ${per}`}>
      {audits ? <>
        <div className="so-avg-line" aria-hidden="true" style={{ bottom: avgBottom }} />
        <span className="so-avg-label" aria-hidden="true" style={{ bottom: `calc(${avgBottom} + 4px)` }}>เฉลี่ย {fmt(avg)}</span>
        <div className={daily.length > 7 ? "so-bars is-dense" : "so-bars"}>
          {daily.map((day) => {
            const heights = barHeights(day, scale);
            return <div key={day.date} className="so-bar" title={`${barTitle(day.date, granularity)}: ตรวจนับ ${fmt(day.total)} · ไม่ตรง ${fmt(day.mismatch)}`}>
              {daily.length <= 7 && <span className="so-bar-value">{day.total ? fmt(day.total) : "—"}</span>}
              <div className="so-bar-mismatch" style={{ height: `${heights.mismatch}%` }} />
              <div className={day.mismatch ? "so-bar-match" : "so-bar-match is-solo"} style={{ height: `${heights.match}%` }} />
            </div>;
          })}
        </div>
      </> : null}
    </figure>
    <Axis bars={daily} granularity={granularity} />
  </>;
}

function ProblemChart({ bars, granularity, rangeLabel }) {
  const max = Math.max(1, ...bars.map((bar) => bar.issueCount));
  return <>
    <figure className="so-chart" role="img" aria-label={`กราฟปัญหาและผลแก้ไข ${rangeLabel}`}>
      <div className={bars.length > 7 ? "so-bars is-dense" : "so-bars"}>
        {bars.map((bar) => <div className="so-problem-pair" key={bar.date} title={`${barTitle(bar.date, granularity)} · ปัญหา ${bar.issueCount} · ตรวจครบ ${bar.resolvedCount}`}>
          <div className="so-problem-bar" style={{ height: `${(bar.issueCount / max) * 90}%` }} />
          <div className="so-resolved-bar" style={{ height: `${(bar.resolvedCount / max) * 90}%` }} />
        </div>)}
      </div>
    </figure>
    <Axis bars={bars} granularity={granularity} />
  </>;
}

export default function StoreOverviewPanel({ apiFetch, settings, onNavigate }) {
  const [today] = useState(() => bangkokDateOf(new Date().toISOString()));
  const [period, setPeriod] = useState("7d");
  const [draft, setDraft] = useState(() => ({ from: `${today.slice(0, 7)}-01`, to: today }));
  const [custom, setCustom] = useState(draft);
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
      const res = await apiFetch(`/api/store/overview?${overviewQuery(period, custom)}`);
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
  }, [apiFetch, period, custom]);

  const refreshes = autoRefreshes(period, custom);
  useEffect(() => {
    load();
    if (!refreshes) return undefined;
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(); }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load, refreshes]);

  const applyCustom = (event) => {
    event.preventDefault();
    if (!draft.from || !draft.to || draft.from > draft.to) return setError("วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด");
    setCustom({ ...draft });
  };

  const transfers = data?.transfers;
  const audits = data?.audits;
  const charts = data?.reportCharts;
  const granularity = data?.granularity || "day";
  const rangeLabel = data?.rangeLabel || "";
  const dash = "—";
  const show = (key) => source === "all" || source === key;
  const showDocs = show("booking") || show("online");
  const types = source === "booking" ? ["booking"] : source === "online" ? ["online"] : ["booking", "online"];
  const maxIssues = Math.max(1, ...(transfers?.byDestination || []).map((row) => row.resolved + row.open));
  const moduleValues = {
    booking: data?.modules?.booking,
    online: data?.modules?.online,
    transfer: transfers && { docs: transfers.total, problems: transfers.incomplete, open: transfers.open },
    audit: audits && { docs: audits.docs, problems: audits.mismatch, open: null }
  };
  const docSeries = [
    { key: "booking", className: "so-bar-match", label: "ใบสั่งจอง" },
    { key: "online", className: "so-bar-online", label: "ใบขายออนไลน์" }
  ].filter((item) => types.includes(item.key));
  const problemBars = (charts?.daily || []).map((bar) => ({
    date: bar.date,
    issueCount: types.reduce((sum, type) => sum + bar[`${type}Problems`], 0),
    resolvedCount: types.reduce((sum, type) => sum + bar[`${type}Resolved`], 0)
  }));
  const issues = (charts?.issues || []).filter((item) => types.includes(item.type)).slice(0, 20);
  const staffRows = (data?.staff || []).map((p) => ({ ...p, jobs: p.booking + p.online + p.transfer + p.auditDocs })).sort((a, b) => b.jobs + b.logs - (a.jobs + a.logs));
  const staffList = (settings?.staff || []).filter((person) => person.active !== false).map((person) => ({ id: person.id, name: person.name }));
  const docCard = (type, title, tone, tab) => {
    const values = data?.modules?.[type];
    return <ModuleCard key={type} title={title} tone={tone} link={{ tab, label: "ไปตรวจเอกสาร" }} onNavigate={onNavigate}>
      <Stat label="เอกสารทั้งหมด" value={values ? fmt(values.docs) : dash} />
      <Stat label="เคยมีปัญหา" value={values ? fmt(values.problems) : dash} sub={values ? `ยังต้องติดตาม ${fmt(values.open)}` : undefined} tone={values?.open ? "danger" : undefined} />
      <Stat label="ปัญหาที่ตรวจครบแล้ว" value={charts ? fmt(charts.resolvedByType?.[type] || 0) : dash} sub="อิงประวัติห้องแพ็ค" />
    </ModuleCard>;
  };

  return (
    <section className="panel role-workspace so-workspace">
      <div className="so-view-tabs" role="tablist" aria-label="หน้ารายงานสโตร์"><button type="button" role="tab" aria-selected={view === "dashboard"} className={view === "dashboard" ? "primary" : "secondary"} onClick={() => setView("dashboard")}>แดชบอร์ด</button><button type="button" role="tab" aria-selected={view === "planning"} className={view === "planning" ? "primary" : "secondary"} onClick={() => setView("planning")}>แผนงานและปฏิทิน</button></div>
      {view === "planning" ? <StorePlanningPanel apiFetch={apiFetch} staff={staffList} /> : <>
        <header className="store-report-header">
          <div>
            <span className="store-report-eyebrow">STORE REPORT</span>
            <h2>รายงานแดชบอร์ดสโตร์</h2>
            <p>ใบสั่งจอง ใบขายออนไลน์ ใบโอนสินค้า Internal Audit และผลงานพนักงาน ในหน้าเดียว{rangeLabel ? ` · ${rangeLabel}` : ""}</p>
          </div>
          <div className="store-report-header-tools so-tools">
            <div className="so-periods" role="group" aria-label="ช่วงเวลา">
              {PERIODS.map((item) => (
                <button key={item.id} type="button" className={period === item.id ? "primary" : "secondary"} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>
              ))}
              <button type="button" className="secondary" onClick={() => load()} disabled={loading}>{loading ? "กำลังโหลด" : "โหลดข้อมูลล่าสุด"}</button>
            </div>
            {period === "custom" && <form className="so-range" onSubmit={applyCustom} aria-label="กำหนดช่วงวันที่">
              <label>ตั้งแต่<input type="date" value={draft.from} max={today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
              <label>ถึง<input type="date" value={draft.to} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
              <button type="submit" className="primary">ดูรายงาน</button>
              <small className="muted">เลือกได้ไม่เกิน {MAX_RANGE_DAYS} วัน · ช่วงเกิน 2 เดือนกราฟจะแสดงเป็นรายเดือนและไม่รีเฟรชอัตโนมัติ</small>
            </form>}
          </div>
        </header>

        <label className="so-source-filter">กรองประเภทข้อมูล <select aria-label="กรองประเภทข้อมูล" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">ทุกประเภท</option><option value="booking">ใบสั่งจอง</option><option value="online">ใบขายออนไลน์</option><option value="transfer">ใบโอนสินค้า</option><option value="audit">Internal Audit</option></select></label>
        {error && <p className="so-message is-error" role="alert">{error}</p>}
        {data?.openTransfersCapped && <p className="so-message" role="status">รายการใบโอนค้างมีจำนวนมาก รายการที่แสดงอาจไม่ครบ</p>}
        {data?.openReportsCapped && <p className="so-message" role="status">เอกสารที่ยังค้างปัญหามีจำนวนมาก ยอดค้างที่แสดงอาจไม่ครบ</p>}
        {!refreshes && <p className="so-message" role="status">ช่วงหลายเดือนไม่รีเฟรชอัตโนมัติ · กด “โหลดข้อมูลล่าสุด” เมื่อต้องการตัวเลขใหม่</p>}
        {loading && !error && <p className="so-message" role="status">กำลังโหลดข้อมูล...</p>}

        <div className="so-modules" aria-label="สรุปทุกโมดูล">
          {show("booking") && docCard("booking", moduleName(settings, "store-booking", "ใบสั่งจอง"), "brand", "store-booking")}
          {show("online") && docCard("online", moduleName(settings, "store-online", "ใบขายออนไลน์"), "info", "store-online")}
          {show("transfer") && <ModuleCard title={moduleName(settings, "store-transfer", "ใบโอนสินค้า")} tone="ok" link={{ tab: "store-transfer", label: "ไปหน้าใบโอน" }} onNavigate={onNavigate}>
            <Stat label="ใบโอนทั้งหมด" value={transfers ? fmt(transfers.total) : dash} sub={transfers ? `ครบ ${fmt(transfers.complete)} · ไม่ครบ ${fmt(transfers.incomplete)}` : undefined} />
            <Stat label="ไม่ครบ · ค้างแก้ไข" value={transfers ? fmt(transfers.open) : dash} sub={`แก้ไขเฉลี่ย ${formatResolveHours(transfers?.avgResolveHours)}`} tone={transfers?.open ? "danger" : undefined} />
            <Stat label="อัตราแก้ไขแล้ว" value={formatRate(transfers?.resolveRate)} sub={transfers ? `แก้ไขแล้ว ${fmt(transfers.resolved)} จาก ${fmt(transfers.incomplete)}` : undefined} />
          </ModuleCard>}
          {show("audit") && <ModuleCard title={moduleName(settings, "store-audit", "Internal Audit")} tone="deep" link={{ tab: "store-audit", label: "ไปหน้า Audit" }} onNavigate={onNavigate}>
            <Stat label="ตรวจนับทั้งหมด" value={audits ? fmt(audits.total) : dash} sub={audits ? `${fmt(audits.docs)} เอกสาร · ไม่ตรง ${fmt(audits.mismatch)}` : undefined} />
            <Stat label="ความแม่นยำสต็อก" value={formatAccuracy(audits?.accuracy)} sub="สินค้าตรง ÷ ตรวจนับทั้งหมด" />
            <Stat label="เฉลี่ยตรวจนับต่อวัน" value={audits ? fmt(audits.avg) : dash} sub={`${audits ? fmt(audits.activeDays) : dash} วันที่มีการตรวจ`} />
          </ModuleCard>}
        </div>

        <div className="so-grid" aria-label="กราฟ">
          {showDocs && <section className="so-card">
            <div className="so-card-head"><h3>ใบสั่งจองและใบขายออนไลน์{granularity === "month" ? "รายเดือน" : "รายวัน"}</h3><Legend items={docSeries.map((item) => [item.key === "booking" ? "so-swatch-match" : "so-swatch-resolved", item.label])} /></div>
            <StackChart bars={charts?.daily || []} series={docSeries} granularity={granularity} label={`กราฟเอกสาร ${rangeLabel}`} />
          </section>}
          {show("transfer") && <section className="so-card">
            <div className="so-card-head"><h3>ใบโอนสินค้า{granularity === "month" ? "รายเดือน" : "รายวัน"}</h3><Legend items={[["so-swatch-match", "รับครบ"], ["so-swatch-open", "ไม่ครบ"]]} /></div>
            <StackChart bars={transfers?.daily || []} series={[{ key: "complete", className: "so-bar-match", label: "รับครบ" }, { key: "incomplete", className: "so-bar-problem", label: "ไม่ครบ" }]} granularity={granularity} label={`กราฟใบโอน ${rangeLabel}`} />
          </section>}
          {show("audit") && <section className="so-card" aria-label="ตรวจนับรายวัน">
            <div className="so-card-head"><h3>จำนวนตรวจนับ{granularity === "month" ? "รายเดือน" : "รายวัน"}</h3><Legend items={[["so-swatch-match", "สินค้าตรง"], ["so-swatch-mismatch", "สินค้าไม่ตรง"], ["so-swatch-avg", granularity === "month" ? "เฉลี่ย/เดือน" : "เฉลี่ย/วัน"]]} /></div>
            <AuditChart audits={audits} rangeLabel={rangeLabel} granularity={granularity} />
          </section>}
          {showDocs && <section className="so-card">
            <div className="so-card-head"><h3>ปัญหาและผลการแก้ไขตามวันที่สร้างเอกสาร</h3><Legend items={[["so-swatch-open", "มีปัญหา"], ["so-swatch-match", "ตรวจครบแล้ว"]]} /></div>
            <ProblemChart bars={problemBars} granularity={granularity} rangeLabel={rangeLabel} />
          </section>}
        </div>

        <div className="so-grid so-grid-3" aria-label="งานที่ต้องติดตาม">
          {showDocs && <section className="so-card">
            <div className="so-card-head"><h3>ปัญหาใบสั่งจอง / ออนไลน์</h3><button type="button" className="so-link" onClick={() => onNavigate?.(source === "online" ? "store-online" : "store-booking")}>ไปตรวจเอกสาร</button></div>
            <div className="so-list">
              {issues.map((item) => <div key={item.id} className="so-item is-danger"><div><b>{item.bookingNumber || "ไม่มีเลขเอกสาร"}</b> · {item.type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}<div className="so-item-note">{item.reason || item.detail || "ยังไม่ระบุรายละเอียด"}</div><small>{item.packStatus === "returned" ? "แนวทาง: ตรวจเหตุผล แก้ไขข้อมูล แล้วส่งตรวจใหม่" : "แนวทาง: ตรวจรายละเอียดและติดตามสินค้าหรือข้อมูลที่ค้าง"}</small></div></div>)}
              {charts && !issues.length && <p className="so-empty">ไม่พบปัญหาค้างในช่วงวันที่เลือก</p>}
              {issues.length > 0 && <small className="muted">แสดงไม่เกิน 20 รายการล่าสุด</small>}
            </div>
          </section>}
          {show("transfer") && <section className="so-card" aria-label="งานค้างแก้ไข">
            <div className="so-card-head"><h3>ใบโอนค้างแก้ไข</h3><button type="button" className="so-link" onClick={() => onNavigate?.("store-transfer")}>ไปหน้าใบโอน</button></div>
            <div className="so-list">
              {(transfers?.openList || []).map((row) => <div key={row.id || row.transferNumber} className="so-item is-danger">
                <div><b>{row.transferNumber}</b> <span>· {row.fromBranchName} → {row.toBranchName}</span>{row.note && <div className="so-item-note">{row.note}</div>}</div>
                <span className="so-item-meta">{stamp(row.createdAt, today)}</span>
              </div>)}
              {transfers && transfers.openList.length === 0 && <p className="so-empty">ไม่มีใบโอนค้างแก้ไข</p>}
            </div>
          </section>}
          {show("transfer") && <section className="so-card" aria-label="ใบโอนไม่ครบแยกสาขา">
            <div className="so-card-head"><h3>ใบโอนไม่ครบ แยกสาขาปลายทาง</h3><Legend items={[["so-swatch-resolved", "แก้ไขแล้ว"], ["so-swatch-open", "ยังไม่แก้ไข"]]} /></div>
            {(transfers?.byDestination || []).map((row) => {
              const widths = branchWidths(row, maxIssues);
              return <div key={row.code} className="so-branch">
                <div className="so-branch-head"><b>{row.name}</b><span>ไม่ครบ {fmt(row.resolved + row.open)} · ค้าง {fmt(row.open)}</span></div>
                <div className="so-branch-bar" aria-hidden="true"><div className="so-branch-resolved" style={{ width: `${widths.resolved}%` }} /><div className="so-branch-open" style={{ width: `${widths.open}%` }} /></div>
              </div>;
            })}
            {transfers && transfers.byDestination.length === 0 && <p className="so-empty">ไม่มีใบโอนไม่ครบในช่วงนี้</p>}
          </section>}
          {show("audit") && <section className="so-card" aria-label="ตรวจนับพบสินค้าไม่ตรง">
            <div className="so-card-head"><h3>ตรวจนับพบสินค้าไม่ตรงล่าสุด</h3><button type="button" className="so-link" onClick={() => onNavigate?.("store-audit")}>ไปหน้า Audit</button></div>
            <div className="so-list">
              {(audits?.latestMismatched || []).map((row) => <div key={row.id || row.documentNumber} className="so-item is-accent">
                <div><b>{row.documentNumber}</b> <span>· {[row.branchName, row.zone].filter(Boolean).join(" ")}</span>{row.note && <div className="so-item-note">{row.note}</div>}</div>
                <span className="so-item-meta">ไม่ตรง {fmt(row.mismatch)} / {fmt(row.total)}</span>
              </div>)}
              {audits && audits.latestMismatched.length === 0 && <p className="so-empty">ไม่พบสินค้าไม่ตรงในช่วงนี้</p>}
            </div>
          </section>}
        </div>

        <div className="so-grid so-grid-staff">
          <section className="so-card" aria-label="ผลงานรายบุคคล">
            <h3>ผลงานรายบุคคล{rangeLabel ? ` · ${rangeLabel}` : ""}</h3>
            <div className="store-report-table-wrap">
              <table className="store-report-table so-table so-table-staff" aria-label="ผลงานรายบุคคล">
                <thead><tr><th scope="col">พนักงาน</th><th scope="col">ตำแหน่ง</th><th scope="col" className="so-num">วันทำงาน</th><th scope="col" className="so-num">ใบสั่งจอง</th><th scope="col" className="so-num">ออนไลน์</th><th scope="col" className="so-num">ใบโอน</th><th scope="col" className="so-num">Audit</th><th scope="col" className="so-num">งานรวม</th><th scope="col" className="so-num">บันทึกงาน</th><th scope="col" className="so-num">ใบโอนครบ</th></tr></thead>
                <tbody>{staffRows.map((p) => <tr key={p.uid}><th scope="row">{p.name}</th><td className="so-position">{[p.position, p.area].filter(Boolean).join(" · ") || "—"}</td><td className="so-num">{fmt(p.days)}</td><td className="so-num">{fmt(p.booking)}</td><td className="so-num">{fmt(p.online)}</td><td className="so-num">{fmt(p.transfer)}</td><td className="so-num">{fmt(p.auditDocs)}</td><td className="so-num so-strong">{fmt(p.jobs)}</td><td className="so-num">{fmt(p.logs)}</td><td className="so-num">{pct(p.transfer - p.issues, p.transfer)}</td></tr>)}</tbody>
              </table>
            </div>
            {data && !staffRows.length && <p className="so-empty">ยังไม่มีรายชื่อพนักงานสโตร์</p>}
          </section>
          <section className="so-card" aria-label="บันทึกงานพนักงานล่าสุด">
            <h3>บันทึกงานพนักงานล่าสุด · ใครทำอะไร ที่ไหน เมื่อไหร่ อย่างไร</h3>
            <div className="so-list">
              {(data?.workLogs || []).map((log) => <div key={log.id} className="so-item so-log">
                <div><b>{log.staffName}</b> <span>· {log.activity}{log.location ? ` @ ${log.location}` : ""}</span>{log.detail && <div className="so-item-note">{log.detail}</div>}</div>
                <span className="so-item-meta">{thaiDateLabel(log.date).replace(/ \d{4}$/, "")} {workLogHours(log)}</span>
              </div>)}
              {data && !(data.workLogs || []).length && <p className="so-empty">ยังไม่มีบันทึกงานในช่วงนี้ · พนักงานลงได้ที่รายงานประจำวัน → รายบุคคล</p>}
            </div>
          </section>
        </div>

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
                {MODULE_ROWS.filter((row) => show(row.key)).map((row) => {
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

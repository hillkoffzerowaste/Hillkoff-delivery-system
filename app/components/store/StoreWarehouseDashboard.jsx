"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDaysToDateKey, thaiDateLabel, thaiMonthLabel } from "../../../lib/storeFormat.js";
import { bangkokDateOf } from "../../../lib/storeDailyReport.js";
import { customRange } from "../../../lib/storeOverview.js";
import { WAREHOUSE_MAX_DAYS, percent } from "../../../lib/storeWarehouseDashboard.js";
import "./StoreWarehouseDashboard.css";

// Branch colours avoid red, which always means "problem" on this page.
const BRANCH_COLORS = ["#22D3EE", "#34D399", "#A78BFA", "#60A5FA", "#F472B6", "#FBBF24", "#FB923C", "#94A3B8"];
const C = { red: "#F87171", amber: "#F59E0B", green: "#34D399", cyan: "#22D3EE", violet: "#A78BFA", blue: "#60A5FA", faint: "#8A9BBB" };
// Beyond about two months daily bars become unreadable, so charts switch to one bar per month.
const DAILY_MAX = 62;
const LIST_LIMIT = 60;
const TRACKING = { waiting_purchase: "รอจัดซื้อ", ordered: "สั่งซื้อแล้ว", waiting_transfer: "รอโอน", partial: "รับบางส่วน", complete: "ครบ", cancelled: "ยกเลิก" };
const SOURCE = { transfer: "ใบโอน", booking: "ใบสั่งจอง", online: "ออนไลน์", audit: "Audit" };
export const WAREHOUSE_TABS = [
  ["overview", "ภาพรวม"],
  ["transfers", "ใบโอนสินค้า"],
  ["orders", "ใบสั่งจอง / ออนไลน์"],
  ["claims", "เคลมสินค้า"],
  ["shortage", "สินค้าขาด / เคส"],
  ["production", "การผลิต"],
  ["audit", "Internal Audit"],
  ["staff", "พนักงาน"],
  ["operations", "ศูนย์ปฏิบัติการ"]
];

export const fmt = (n, digits = 0) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const pctText = (value) => (value == null ? "—" : `${value}%`);

export function shortDate(dateKey) {
  const [, day, month, year] = thaiDateLabel(dateKey).split(" ");
  return day ? `${day} ${month} ${String(year).slice(2)}` : dateKey || "—";
}

export function rangePresets(today) {
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDaysToDateKey(monthStart, -1);
  return [
    ["today", "วันนี้", today, today],
    ["7d", "7 วัน", addDaysToDateKey(today, -6), today],
    ["month", "เดือนนี้", monthStart, today],
    ["lastMonth", "เดือนก่อน", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd],
    ["3m", "3 เดือน", addDaysToDateKey(today, -89), today]
  ];
}

export function rangeTitle(from, to) {
  if (!from || !to) return "";
  return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
}

// Daily values, or monthly sums when the range is long. Returns [{ key, label, title, values: {...} }].
export function bucketDays(dates, seriesValues) {
  const keys = Object.keys(seriesValues);
  if (dates.length <= DAILY_MAX) {
    return dates.map((date, i) => ({ key: date, label: String(Number(date.slice(8))), title: thaiDateLabel(date), values: Object.fromEntries(keys.map((k) => [k, seriesValues[k][i] || 0])) }));
  }
  const months = new Map();
  dates.forEach((date, i) => {
    const key = date.slice(0, 7);
    const entry = months.get(key) || { key, label: thaiMonthLabel(key).replace(/ 25(\d\d)$/, " $1"), title: thaiMonthLabel(key), values: Object.fromEntries(keys.map((k) => [k, 0])) };
    keys.forEach((k) => { entry.values[k] += seriesValues[k][i] || 0; });
    months.set(key, entry);
  });
  return [...months.values()];
}

/* ---------------- small parts ---------------- */
function Card({ children, accent, className = "", label }) {
  return <div className={`swd-card ${className}`} style={accent ? { borderTopColor: accent, borderTopWidth: 3 } : undefined} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}

function Kpi({ label, value, unit, sub, color, onClick }) {
  const body = <>
    <span className="swd-kpi-label">{label}</span>
    <strong style={{ color }}>{value}{unit && <small>{unit}</small>}</strong>
    {sub && <span className="swd-kpi-sub">{sub}</span>}
  </>;
  return onClick
    ? <button type="button" className="swd-card swd-kpi is-link" style={{ borderTopColor: color }} onClick={onClick}>{body}</button>
    : <div className="swd-card swd-kpi" style={{ borderTopColor: color }}>{body}</div>;
}

function Badge({ children, color = C.faint }) {
  return <span className="swd-badge" style={{ color, background: `${color}22`, borderColor: `${color}55` }}>{children}</span>;
}

function Title({ title, sub, right }) {
  return <div className="swd-title"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{right}</div>;
}

function BranchTag({ branch, big }) {
  return <span className={big ? "swd-branch is-big" : "swd-branch"} style={{ color: branch.color }}><i style={{ background: branch.color }} aria-hidden="true" />{branch.code} {branch.name}</span>;
}

function Empty({ children }) {
  return <p className="swd-empty">{children}</p>;
}

function Note({ children, color = C.amber }) {
  return <div className="swd-note" style={{ background: `${color}14`, borderColor: `${color}55` }}>{children}</div>;
}

function Gauge({ value, color, label, sub }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const shown = value == null ? 0 : Math.max(0, Math.min(value, 100));
  return <div className="swd-gauge">
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${label} ${value == null ? "ไม่มีข้อมูล" : `${value}%`}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--swd-line)" strokeWidth="10" />
      {value != null && <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} transform="rotate(-90 60 60)" />}
      <text x="60" y="66" textAnchor="middle" fill={value == null ? "var(--swd-faint)" : color} fontSize="19" fontWeight="700">{value == null ? "—" : `${fmt(value, 1)}%`}</text>
    </svg>
    <span>{label}</span>
    {sub && <small>{sub}</small>}
  </div>;
}

function Bar({ value, max, color }) {
  return <div className="swd-meter" aria-hidden="true"><div style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, background: color }} /></div>;
}

// Vertical stacked bars. series: [{ key, label, color }]; buckets from bucketDays.
function StackedBars({ buckets, series, label, height = 220, colorFor }) {
  const max = Math.max(1, ...buckets.map((b) => series.reduce((sum, s) => sum + b.values[s.key], 0)));
  const step = Math.max(1, Math.ceil(buckets.length / 16));
  const total = buckets.reduce((sum, b) => sum + series.reduce((s2, s) => s2 + b.values[s.key], 0), 0);
  return <figure className="swd-bars" role="img" aria-label={`${label} รวม ${fmt(total)}`}>
    <div className="swd-bars-plot" style={{ height }}>
      {[0.25, 0.5, 0.75, 1].map((g) => <i key={g} className="swd-gridline" style={{ bottom: `${g * 100}%` }} aria-hidden="true" />)}
      {buckets.map((b) => {
        const sum = series.reduce((s, item) => s + b.values[item.key], 0);
        return <div key={b.key} className="swd-bar" title={`${b.title} · ${series.map((s) => `${s.label} ${fmt(b.values[s.key])}`).join(" · ")}`}>
          {buckets.length <= 14 && sum > 0 && <span className="swd-bar-value" style={{ bottom: `calc(${(sum / max) * 100}% + 2px)` }}>{fmt(sum)}</span>}
          {series.map((s) => b.values[s.key] > 0 && <div key={s.key} style={{ height: `${(b.values[s.key] / max) * 100}%`, background: colorFor ? colorFor(b, s) : s.color }} />)}
        </div>;
      })}
    </div>
    <div className="swd-axis" aria-hidden="true">{buckets.map((b, i) => <span key={b.key}>{i % step === 0 ? b.label : ""}</span>)}</div>
  </figure>;
}

function Legend({ items }) {
  return <div className="swd-legend">{items.map(([color, text]) => <span key={text}><i style={{ background: color }} aria-hidden="true" />{text}</span>)}</div>;
}

// Horizontal stacked bars: rows [{ label, parts: [{ value, color, label }] }]
function HBars({ rows, label }) {
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  return <div className="swd-hbars" role="img" aria-label={label}>
    {rows.map((row) => <div key={row.label} className="swd-hbar" title={`${row.label} · ${row.parts.map((p) => `${p.label} ${fmt(p.value)}`).join(" · ")}`}>
      <span className="swd-hbar-label">{row.label}</span>
      <div className="swd-hbar-track">{row.parts.map((p) => p.value > 0 && <div key={p.label} style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />)}</div>
      <span className="swd-hbar-num">{row.parts.map((p) => fmt(p.value)).join(" / ")}</span>
    </div>)}
  </div>;
}

function Donut({ parts, unit, label }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 70;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return <div className="swd-donut">
    <svg viewBox="0 0 200 200" role="img" aria-label={`${label} รวม ${fmt(total)} ${unit}`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="var(--swd-line)" strokeWidth="26" />
      {parts.map((p) => {
        const length = total ? (p.value / total) * c : 0;
        const start = offset;
        offset += length;
        return length > 0 && <circle key={p.label} cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth="26" strokeDasharray={`${length} ${c - length}`} strokeDashoffset={-start} transform="rotate(-90 100 100)"><title>{`${p.label} ${fmt(p.value)} ${unit}`}</title></circle>;
      })}
      <text x="100" y="100" textAnchor="middle" fill="var(--swd-text)" fontSize="26" fontWeight="700">{fmt(total)}</text>
      <text x="100" y="124" textAnchor="middle" fill="var(--swd-soft)" fontSize="13">{unit}</text>
    </svg>
    <Legend items={parts.map((p) => [p.color, `${p.label} ${fmt(p.value)} (${total ? Math.round((p.value / total) * 100) : 0}%)`])} />
  </div>;
}

function Table({ children, label, min = 480 }) {
  return <div className="swd-table-wrap"><table className="swd-table" aria-label={label} style={{ minWidth: min }}>{children}</table></div>;
}

function Mini({ label, value, sub, color }) {
  return <div className="swd-mini"><span>{label}</span><strong style={{ color }}>{value}</strong>{sub && <small>{sub}</small>}</div>;
}

const errorRate = (t) => percent(t.incomplete, t.total, 2);
// Store-level lines (booking/online cases) belong to "ทุกสาขา" only.
const inScope = (row, codes, all) => (row.storeLevel ? all : codes.has(row.branchCode));
const auditColor = (audits) => (audits.accuracy == null ? C.faint : audits.pass ? C.green : C.amber);
const rateColor = (rate, warn) => (rate == null || rate === 0 ? C.green : rate > warn ? C.red : C.amber);

/* ---------------- tabs ---------------- */
function Overview({ data, visible, go, all }) {
  const sum = (pick) => visible.reduce((s, b) => s + pick(b), 0);
  const trTotal = sum((b) => b.transfers.total);
  const trErr = sum((b) => b.transfers.incomplete);
  const trOpen = sum((b) => b.transfers.open);
  const auTotal = sum((b) => b.audits.total);
  const auMis = sum((b) => b.audits.mismatch);
  const codes = new Set(visible.map((b) => b.code));
  const shortages = data.cases.shortages.filter((s) => inScope(s, codes, all));
  const openCases = sum((b) => b.cases.open) + (all ? data.cases.storeOpen : 0);
  const pass = data.auditPassPercent;
  const buckets = bucketDays(data.dates, Object.fromEntries(visible.map((b) => [b.code, b.transfers.daily])));
  const withTransfers = visible.filter((b) => b.transfers.total > 0);
  const worst = [...withTransfers].sort((a, b) => (errorRate(b) ?? 0) - (errorRate(a) ?? 0))[0];
  const longest = [...shortages].filter((s) => s.days != null).sort((a, b) => b.days - a.days)[0];
  const mostCases = [...visible].sort((a, b) => b.cases.open - a.cases.open)[0];
  const lowAudit = [...visible].filter((b) => b.audits.total > 0).sort((a, b) => a.audits.accuracy - b.audits.accuracy)[0];
  const r = data.reports;
  const okDocs = claimableIn(data, codes, all);
  const badAmount = sum((b) => b.claims.amount);
  const bigBad = [...visible].filter((b) => b.claims.amount > 0).sort((a, b) => b.claims.amount - a.claims.amount)[0];
  return <>
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="ใบโอนสินค้ารวม" value={fmt(trTotal)} unit="ใบ" sub={`${visible.length} สาขา · เฉลี่ย ${fmt(trTotal / data.days, 1)}/วัน`} color={C.cyan} onClick={() => go("transfers")} />
      <Kpi label="ใบโอนรับไม่ครบ" value={fmt(trErr)} unit="ใบ" sub={`${pctText(percent(trErr, trTotal, 2))} ของใบโอน · ค้าง ${fmt(trOpen)}`} color={C.red} onClick={() => go("transfers")} />
      <Kpi label="Internal Audit ตรง" value={pctText(percent(auTotal - auMis, auTotal))} sub={`ไม่ตรง ${fmt(auMis)} จาก ${fmt(auTotal)} ชิ้น`} color={C.violet} onClick={() => go("audit")} />
      <Kpi label="ใบสั่งจอง + ออนไลน์" value={fmt(r.total)} unit="รายการ" sub="ระดับสโตร์ · ไม่แยกสาขา" color={C.blue} onClick={() => go("orders")} />
      <Kpi label="เคสค้าง" value={fmt(openCases)} unit="เคส" sub={all && data.cases.storeOpen ? `รวมระดับสโตร์ ${fmt(data.cases.storeOpen)} เคส · สถานะปัจจุบัน` : "สถานะปัจจุบัน ทุกวัน"} color={C.amber} onClick={() => go("shortage")} />
      <Kpi label="สินค้าค้างรับ" value={fmt(shortages.length)} unit="รายการ" sub={`เกินกำหนด ${fmt(shortages.filter((s) => s.overdue).length)} · ไม่มีกำหนดเข้า ${fmt(shortages.filter((s) => !s.eta).length)}`} color={C.amber} onClick={() => go("shortage")} />
      <Kpi label="เคลมได้" value={`฿${fmt(okDocs.reduce((s, d) => s + d.amount, 0))}`} sub={`${fmt(okDocs.reduce((s, d) => s + d.qty, 0))} ชิ้น · ${fmt(okDocs.length)} ใบ`} color={C.green} onClick={() => go("claims")} />
      <Kpi label="เคลมไม่ได้" value={`฿${fmt(badAmount)}`} sub={`${fmt(sum((b) => b.claims.qty))} ชิ้น · ${fmt(sum((b) => b.claims.docs))} ใบ`} color={C.red} onClick={() => go("claims")} />
    </div>

    <Title title="เปรียบเทียบรายสาขา" sub="ใบโอนนับที่สาขาต้นทาง · ไม่ครบแจ้งโดยสาขาปลายทาง · Audit และเคสตามสาขาที่บันทึก" />
    <div className="swd-grid swd-grid-3">
      {visible.map((b) => {
        const t = b.transfers;
        const er = errorRate(t);
        return <Card key={b.code} accent={b.color} label={`สาขา ${b.name}`}>
          <div className="swd-row"><BranchTag branch={b} big />{t.total === 0 ? <Badge>ไม่มีใบโอนออก</Badge> : t.incomplete === 0 ? <Badge color={C.green}>ไม่มีใบโอนไม่ครบ</Badge> : <Badge color={C.red}>ไม่ครบ {fmt(t.incomplete)} ใบ</Badge>}</div>
          <Gauge value={t.total ? Number((100 - er).toFixed(1)) : null} color={rateColor(er, data.transferWarnPercent)} label="ใบโอนรับครบ" sub={`${fmt(t.total - t.incomplete)}/${fmt(t.total)} ใบ`} />
          <div className="swd-row swd-small"><span>อัตราไม่ครบ</span><span style={{ color: rateColor(er, data.transferWarnPercent) }}>{pctText(er)}</span></div>
          <Bar value={er || 0} max={10} color={rateColor(er, data.transferWarnPercent)} />
          <div className="swd-minis">
            <Mini label="ใบโอนออก" value={fmt(t.total)} sub={`${fmt(t.items)} รายการสินค้า`} color={b.color} />
            <Mini label="เฉลี่ย/วัน" value={fmt(t.total / data.days, 1)} />
            <Mini label="รับเข้าสาขานี้" value={fmt(t.received)} sub={`ไม่ครบ ${fmt(t.receivedIncomplete)}`} />
            <Mini label="เคสค้างที่สาขานี้" value={fmt(b.cases.open)} sub={`ใบโอนนับฝั่งรับ · สินค้าค้าง ${fmt(b.cases.shortageLines)}`} color={b.cases.open ? C.amber : undefined} />
            <Mini label="เคลมไม่ได้" value={`฿${fmt(b.claims.amount)}`} sub={`${fmt(b.claims.qty)} ชิ้น`} color={b.claims.amount ? C.red : undefined} />
            <Mini label="การผลิต" value={b.production.records ? fmt(b.production.qty) : "—"} sub={b.production.records ? `${fmt(b.production.sku)} SKU` : "ไม่มีรายงาน"} />
            <div className="swd-mini is-wide">
              <span className="swd-row">Internal Audit ({fmt(b.audits.total)} ชิ้น){b.audits.total > 0 && <Badge color={b.audits.pass ? C.green : C.red}>{b.audits.pass ? "KPI ผ่าน" : "KPI ไม่ผ่าน"}</Badge>}</span>
              <strong style={{ color: auditColor(b.audits) }}>{b.audits.total ? `${fmt(b.audits.accuracy, 1)}% ตรง` : "ยังไม่มีการตรวจนับ"}</strong>
              {b.audits.total > 0 && <small>ไม่ตรง {fmt(b.audits.mismatch)} ชิ้น · {fmt(b.audits.docs)} เอกสาร</small>}
            </div>
          </div>
        </Card>;
      })}
    </div>

    <Card label="ใบโอนสินค้าแยกสาขา">
      <Title title={`ใบโอนสินค้า${data.days > DAILY_MAX ? "รายเดือน" : "รายวัน"} แยกตามสาขาต้นทาง`} right={<Legend items={visible.map((b) => [b.color, `${b.code} ${b.name}`])} />} />
      <StackedBars buckets={buckets} series={visible.map((b) => ({ key: b.code, label: b.code, color: b.color }))} label="กราฟใบโอนสินค้าแยกสาขา" />
    </Card>

    <Title title="จุดที่ควรเฝ้าระวัง" />
    <div className="swd-grid swd-grid-3">
      <Card accent={C.red}><span className="swd-kpi-label">ใบโอนไม่ครบสูงสุด</span>{worst && worst.transfers.incomplete ? <><BranchTag branch={worst} /><p className="swd-small">{fmt(worst.transfers.incomplete)} จาก {fmt(worst.transfers.total)} ใบ ({pctText(errorRate(worst.transfers))}) · ผู้จัดที่พบมากสุด {worst.transfers.staff[0] ? `${worst.transfers.staff[0].name} (${fmt(worst.transfers.staff[0].docs)} ใบ)` : "—"}</p></> : <p className="swd-small">ไม่มีใบโอนไม่ครบในช่วงนี้</p>}</Card>
      <Card accent={C.amber}><span className="swd-kpi-label">สินค้าค้างนานที่สุด</span>{longest ? <><b>{longest.name}</b><p className="swd-small">ค้าง {fmt(longest.days)} วัน · {fmt(longest.remaining)} {longest.unit} · {longest.sourceNumber}</p></> : <p className="swd-small">ไม่มีสินค้าค้างที่ระบุรายการ</p>}</Card>
      <Card accent={C.amber}><span className="swd-kpi-label">เคสค้างมากที่สุด</span>{mostCases && mostCases.cases.open ? <><BranchTag branch={mostCases} /><p className="swd-small">{fmt(mostCases.cases.open)} เคส · สินค้าค้าง {fmt(mostCases.cases.shortageLines)} รายการ</p></> : <p className="swd-small">ไม่มีเคสค้าง</p>}</Card>
      <Card accent={C.violet}><span className="swd-kpi-label">Audit แม่นยำต่ำสุด</span>{lowAudit ? <><BranchTag branch={lowAudit} /><p className="swd-small">{fmt(lowAudit.audits.accuracy, 1)}% ตรง · ไม่ตรง {fmt(lowAudit.audits.mismatch)} ชิ้น</p></> : <p className="swd-small">ยังไม่มีการตรวจนับในช่วงนี้</p>}</Card>
      <Card accent={C.red}><span className="swd-kpi-label">มูลค่าเคลมไม่ได้สูงสุด</span>{bigBad ? <><BranchTag branch={bigBad} /><p className="swd-small">฿{fmt(bigBad.claims.amount, 2)} · {fmt(bigBad.claims.qty)} ชิ้น</p></> : <p className="swd-small">ไม่มีรายการเคลมไม่ได้ในช่วงนี้</p>}</Card>
    </div>

    <Note><b>หมายเหตุข้อมูล:</b> (1) เกณฑ์ KPI Audit ผ่านที่ ≥{pass}% ตรง · (2) ใบสั่งจอง/ใบขายออนไลน์เป็นงานระดับสโตร์ ไม่แยกสาขา · (3) เคสและสินค้าค้างเป็นสถานะปัจจุบัน ไม่ใช่ภาพ ณ สิ้นวันย้อนหลัง · เคสใบโอนนับที่สาขาปลายทาง · เคสใบสั่งจอง/ออนไลน์เป็นระดับสโตร์ · (4) เคลมสินค้าและการผลิตมาจากเมนูบันทึกเคลมสินค้า / การผลิตสินค้า (นำเข้าจาก Excel ได้) · (5) แสดงเฉพาะ 3 สาขาหลักของสโตร์</Note>
  </>;
}

function TransferPanel({ b, data }) {
  const t = b.transfers;
  const er = errorRate(t);
  const buckets = bucketDays(data.dates, { ok: t.daily.map((n, i) => n - t.dailyIncomplete[i]), bad: t.dailyIncomplete });
  const chips = new Map();
  t.errors.forEach((e) => { const key = `${e.date}|${e.to}`; chips.set(key, { date: e.date, to: e.to, n: (chips.get(key)?.n || 0) + 1 }); });
  const maxDocs = Math.max(1, ...t.staff.map((s) => s.docs));
  const colorOf = (code) => data.branches.find((x) => x.code === code)?.color;
  return <Card accent={b.color} label={`ใบโอน ${b.name}`}>
    <BranchTag branch={b} big />
    <div className="swd-minis swd-minis-3">
      <Mini label="ใบโอนออก" value={fmt(t.total)} color={b.color} />
      <Mini label="รับไม่ครบ" value={fmt(t.incomplete)} sub={`ค้าง ${fmt(t.open)} · แก้แล้ว ${fmt(t.resolved)}`} color={t.incomplete ? C.red : C.green} />
      <Mini label="% ไม่ครบ" value={pctText(er)} color={rateColor(er, data.transferWarnPercent)} />
    </div>
    <StackedBars buckets={buckets} height={150} series={[{ key: "ok", label: "รับครบ", color: b.color }, { key: "bad", label: "ไม่ครบ", color: C.red }]} label={`ใบโอนรายวัน ${b.name}`} />
    <Legend items={[[b.color, "รับครบ"], [C.red, "รับไม่ครบ"]]} />
    {t.incomplete === 0 ? <Empty>{t.total ? "ไม่พบใบโอนไม่ครบในช่วงนี้ ✓" : "ไม่มีใบโอนออกจากสาขานี้ในช่วงนี้"}</Empty> : <>
      <h4>วันที่ไม่ครบ → สาขาปลายทางที่แจ้ง</h4>
      <div className="swd-chips">{[...chips.values()].map((c) => <span key={`${c.date}${c.to}`}>{shortDate(c.date)} → <b style={{ color: colorOf(c.to) }}>{c.to}</b> ×{c.n}</span>)}</div>
      <h4>ผู้จัดใบโอนที่รับไม่ครบ</h4>
      <Table label={`ผู้จัดใบโอนไม่ครบ ${b.name}`} min={320}><thead><tr><th>พนักงาน</th><th className="num">ใบ</th><th className="num">รายการ</th><th>สัดส่วน</th></tr></thead>
        <tbody>{t.staff.map((s) => <tr key={s.key || s.name}><td>{s.name}</td><td className="num">{fmt(s.docs)}</td><td className="num">{fmt(s.items)}</td><td><Bar value={s.docs} max={maxDocs} color={C.red} /></td></tr>)}</tbody></Table>
      <h4>รายการใบโอนไม่ครบ</h4>
      <Table label={`ใบโอนไม่ครบ ${b.name}`} min={560}><thead><tr><th>วันที่</th><th>เลขที่</th><th>ปลายทาง</th><th>หมายเหตุ</th><th>สถานะ</th></tr></thead>
        <tbody>{t.errors.slice(-LIST_LIMIT).reverse().map((e) => <tr key={e.id || e.number}><td className="nowrap">{shortDate(e.date)}</td><td className="nowrap">{e.number}</td><td>{e.to}</td><td>{e.note || "—"}<small>{e.preparer}{e.items != null ? ` · ${fmt(e.items)} รายการ` : ""}</small>{e.resolution && <small>แก้: {e.resolution}</small>}</td><td>{e.state === "open" ? <Badge color={C.red}>ค้าง</Badge> : <Badge color={C.green}>แก้แล้ว</Badge>}</td></tr>)}</tbody></Table>
      {t.errors.length > LIST_LIMIT && <p className="swd-small">แสดง {LIST_LIMIT} รายการล่าสุดจาก {fmt(t.errors.length)}</p>}
    </>}
  </Card>;
}

function Transfers({ data, visible, go }) {
  const total = visible.reduce((s, b) => s + b.transfers.total, 0);
  const bad = visible.reduce((s, b) => s + b.transfers.incomplete, 0);
  const open = visible.reduce((s, b) => s + b.transfers.open, 0);
  const items = visible.reduce((s, b) => s + b.transfers.items, 0);
  return <>
    <Title title="ใบโอนสินค้า — แยกรายสาขา" sub="นับใบโอนที่โอนออกจากสาขา · รับไม่ครบแจ้งโดยสาขาปลายทาง" right={<button type="button" className="swd-link" onClick={() => go("store-transfer")}>ไปหน้าใบโอน</button>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="ใบโอนทั้งหมด" value={fmt(total)} unit="ใบ" sub={`${fmt(items)} รายการสินค้า`} color={C.cyan} />
      <Kpi label="รับไม่ครบ" value={fmt(bad)} unit="ใบ" color={C.red} />
      <Kpi label="ยังค้างแก้ไข" value={fmt(open)} unit="ใบ" color={open ? C.red : C.green} />
      <Kpi label="% ไม่ครบ" value={pctText(percent(bad, total, 2))} color={bad ? C.amber : C.green} />
    </div>
    <div className={`swd-grid ${visible.length > 1 ? "swd-grid-3" : ""}`}>{visible.map((b) => <TransferPanel key={b.code} b={b} data={data} />)}</div>
  </>;
}

function Orders({ data, go, moduleName }) {
  const r = data.reports;
  const checked = r.statuses.find((s) => s.id === "checked")?.count || 0;
  const buckets = bucketDays(data.dates, { booking: r.daily.map((d) => d.booking), online: r.daily.map((d) => d.online) });
  const maxChecker = Math.max(1, ...r.checkers.map((p) => p.booking + p.online));
  const bookingName = moduleName("store-booking", "ใบสั่งจอง");
  const onlineName = moduleName("store-online", "ใบขายออนไลน์");
  return <>
    <Title title={`งานจัดสินค้า (${bookingName} / ${onlineName})`} right={<Badge color={C.amber}>ระดับสโตร์ · ไม่แยกสาขา</Badge>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="งานทั้งหมด" value={fmt(r.total)} unit="รายการ" color={C.violet} />
      <Kpi label="ห้องแพ็คตรวจครบ" value={fmt(checked)} unit="รายการ" sub={pctText(percent(checked, r.total))} color={C.green} />
      <Kpi label="เฉลี่ยต่อวันทำงาน" value={fmt(r.perDay)} unit="รายการ" sub={`${fmt(r.activeDays)} วันที่มีงาน`} color={C.cyan} />
      <Kpi label="ลบ / นำออกจากคิว" value={fmt(r.removed)} unit="รายการ" color={C.amber} />
    </div>
    <div className="swd-grid swd-grid-2">
      <Card label="สัดส่วนประเภทงาน"><Title title="สัดส่วนประเภทงาน" /><Donut unit="รายการ" label="สัดส่วนประเภทงาน" parts={[{ label: bookingName, value: r.booking, color: C.cyan }, { label: onlineName, value: r.online, color: C.violet }]} /></Card>
      <Card label="สถานะปัจจุบัน"><Title title="สถานะปัจจุบัน" sub="นับจากสถานะล่าสุดของแต่ละรายการ" />
        <Table label="สถานะงาน" min={280}><thead><tr><th>สถานะ</th><th className="num">จำนวน</th></tr></thead>
          <tbody>{r.statuses.map((s) => <tr key={s.id}><td>{s.label}</td><td className="num" style={{ color: s.count && ["shortage", "returned", "wrong"].includes(s.id) ? C.red : undefined }}>{fmt(s.count)}</td></tr>)}<tr><td>ลบ / นำออกจากคิว</td><td className="num">{fmt(r.removed)}</td></tr></tbody></Table>
        <div className="swd-actions"><button type="button" className="swd-link" onClick={() => go("store-booking")}>ไปหน้า{bookingName}</button><button type="button" className="swd-link" onClick={() => go("store-online")}>ไปหน้า{onlineName}</button></div>
      </Card>
    </div>
    <Card label="งานรายวัน"><Title title={`งาน${data.days > DAILY_MAX ? "รายเดือน" : "รายวัน"}`} right={<Legend items={[[C.cyan, bookingName], [C.violet, onlineName]]} />} />
      <StackedBars buckets={buckets} series={[{ key: "booking", label: bookingName, color: C.cyan }, { key: "online", label: onlineName, color: C.violet }]} label="กราฟงานจัดสินค้า" />
    </Card>
    <Card label="ผู้ตรวจสโตร์"><Title title="ผู้ตรวจสโตร์ (ยืนยันรายการ)" sub="จำนวนเอกสารไม่ใช่คะแนนความสามารถ" />
      {r.checkers.length ? <Table label="ผู้ตรวจสโตร์" min={420}><thead><tr><th>ผู้ตรวจ</th><th className="num">{bookingName}</th><th className="num">{onlineName}</th><th className="num">รวม</th><th>สัดส่วน</th></tr></thead>
        <tbody>{r.checkers.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num">{fmt(p.booking)}</td><td className="num">{fmt(p.online)}</td><td className="num"><b>{fmt(p.booking + p.online)}</b></td><td><Bar value={p.booking + p.online} max={maxChecker} color={C.cyan} /></td></tr>)}</tbody></Table> : <Empty>ยังไม่มีงานในช่วงนี้</Empty>}
    </Card>
  </>;
}

// Claimable documents are store-wide; with one branch chosen only that branch's documents remain.
const claimableIn = (data, codes, all) => data.claims.claimable.docs.filter((d) => all || codes.has(d.branchCode));

function Claims({ data, visible, go, all }) {
  const codes = new Set(visible.map((b) => b.code));
  const sumBad = visible.reduce((s, b) => ({ q: s.q + b.claims.qty, a: s.a + b.claims.amount, d: s.d + b.claims.docs }), { q: 0, a: 0, d: 0 });
  const okDocs = claimableIn(data, codes, all);
  const reasonMap = new Map();
  visible.flatMap((b) => b.claims.rows).forEach((d) => { const key = d.reason || "ไม่ระบุสาเหตุ"; const r = reasonMap.get(key) || { reason: key, docs: 0, amount: 0 }; r.docs += 1; r.amount += d.amount; reasonMap.set(key, r); });
  const topReason = [...reasonMap.values()].sort((a, b) => b.amount - a.amount)[0];
  const okQty = okDocs.reduce((s, d) => s + d.qty, 0);
  const okAmount = okDocs.reduce((s, d) => s + d.amount, 0);
  const items = new Map();
  okDocs.forEach((d) => d.items.forEach((item) => { const key = `${item.code}|${item.name}`; const e = items.get(key) || { code: item.code, name: item.name, qty: 0, amount: 0 }; e.qty += item.qty; e.amount += item.amount; items.set(key, e); }));
  const top = [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  return <>
    <Title title="สินค้าเคลมไม่ได้ — แยกรายสาขา" sub="เบิกออก / ตัดจ่าย (หมดอายุ ชำรุด ของแถม ฯลฯ) · มูลค่าตามต้นทุน" right={<button type="button" className="swd-link" onClick={() => go("store-claims")}>ไปหน้าบันทึกเคลม</button>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="เอกสารเคลมไม่ได้" value={fmt(sumBad.d)} unit="ใบ" color={C.red} />
      <Kpi label="จำนวน" value={fmt(sumBad.q)} unit="ชิ้น" color={C.red} />
      <Kpi label="มูลค่า (ต้นทุน)" value={`฿${fmt(sumBad.a, 2)}`} color={C.red} />
      <Kpi label="สาเหตุมูลค่าสูงสุด" value={topReason ? `฿${fmt(topReason.amount)}` : "—"} sub={topReason ? `${topReason.reason} · ${fmt(topReason.docs)} ใบ` : "ยังไม่มีข้อมูล"} color={C.amber} />
    </div>
    <div className={`swd-grid ${visible.length > 1 ? "swd-grid-3" : ""}`}>
      {visible.map((b) => <Card key={b.code} accent={b.color} label={`เคลมไม่ได้ ${b.name}`}>
        <div className="swd-row"><BranchTag branch={b} big /><div className="swd-right"><b style={{ color: C.red }}>฿{fmt(b.claims.amount, 2)}</b><small>{fmt(b.claims.qty)} ชิ้น · {fmt(b.claims.docs)} ใบ</small></div></div>
        {b.claims.rows.length === 0 ? <Empty>ไม่มีรายการเคลมไม่ได้</Empty> :
          <Table label={`เคลมไม่ได้ ${b.name}`} min={420}><thead><tr><th>วันที่</th><th>สินค้า / สาเหตุ</th><th className="num">จำนวน</th><th className="num">฿</th></tr></thead>
            <tbody>{b.claims.rows.flatMap((d) => d.items.map((item, i) => <tr key={`${d.id}-${i}`}><td className="nowrap">{shortDate(d.date)}<small>{d.doc}</small></td><td>{item.name}<small>{d.reason}{d.requester ? ` · ${d.requester}` : ""}</small></td><td className="num">{fmt(item.qty)}</td><td className="num">{fmt(item.amount, 2)}</td></tr>))}</tbody></Table>}
      </Card>)}
    </div>

    <Title title="สินค้าเคลมได้ (ใบส่งคืน / ลดหนี้)" right={<Badge color={C.amber}>{all ? "ทุกสาขา · รวมเอกสารที่ไม่ระบุสาขา" : "เฉพาะเอกสารที่ระบุสาขานี้"}</Badge>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="จำนวนใบ" value={fmt(okDocs.length)} unit="ใบ" color={C.green} />
      <Kpi label="จำนวนที่ส่งคืน" value={fmt(okQty)} unit="ชิ้น" color={C.green} />
      <Kpi label="มูลค่า" value={`฿${fmt(okAmount, 2)}`} color={C.green} />
      <Kpi label="เฉลี่ยต่อใบ" value={okDocs.length ? `฿${fmt(okAmount / okDocs.length)}` : "—"} color={C.cyan} />
    </div>
    {okDocs.length === 0 ? <Empty>ยังไม่มีเอกสารเคลมได้ในช่วงนี้</Empty> : <div className="swd-grid swd-grid-2">
      <Card label="สรุปรายใบ"><Title title="สรุปรายใบ" />
        <Table label="เอกสารเคลมได้" min={420}><thead><tr><th>วันที่</th><th>เลขที่ใบ</th><th className="num">รายการ</th><th className="num">จำนวน</th><th className="num">฿</th></tr></thead>
          <tbody>{okDocs.map((d) => <tr key={d.id || d.doc}><td className="nowrap">{shortDate(d.date)}</td><td>{d.doc}{(d.supplier || d.branchCode) && <small>{[d.supplier, d.branchCode].filter(Boolean).join(" · ")}</small>}</td><td className="num">{d.items.length}</td><td className="num">{fmt(d.qty)}</td><td className="num">{fmt(d.amount, 2)}</td></tr>)}</tbody></Table>
      </Card>
      <Card label="มูลค่าสูงสุด"><Title title={`${top.length} รายการมูลค่าสูงสุด`} />
        <Table label="สินค้าเคลมได้มูลค่าสูงสุด" min={320}><thead><tr><th>สินค้า</th><th className="num">จำนวน</th><th className="num">฿</th></tr></thead>
          <tbody>{top.map((item) => <tr key={`${item.code}|${item.name}`}><td>{item.name}{item.code && <small>{item.code}</small>}</td><td className="num">{fmt(item.qty)}</td><td className="num">{fmt(item.amount, 2)}</td></tr>)}</tbody></Table>
      </Card>
    </div>}
  </>;
}

function ProductionPanel({ b }) {
  const p = b.production;
  const chart = p.items.slice(0, 8).map((item) => ({ label: item.name.length > 26 ? `${item.name.slice(0, 26)}…` : item.name, parts: [{ label: "ผลิต", value: item.qty, color: b.color }, ...(item.sold !== null ? [{ label: "ขาย", value: item.sold, color: C.green }] : [])] }));
  return <Card accent={b.color} label={`การผลิต ${b.name}`}>
    <BranchTag branch={b} big />
    {p.records === 0 ? <Empty>ไม่มีรายงานการผลิตในช่วงนี้</Empty> : <>
      <div className="swd-minis swd-minis-3">
        <Mini label="SKU" value={fmt(p.sku)} color={b.color} />
        <Mini label="จำนวนผลิต" value={fmt(p.qty)} />
        <Mini label="ยอดขาย" value={p.soldKnown ? fmt(p.sold) : "—"} sub={p.soldKnown ? undefined : "ยังไม่ได้บันทึก"} color={C.green} />
      </div>
      <h4>8 รายการผลิตมากสุด</h4>
      <HBars rows={chart} label={`การผลิต ${b.name}`} />
      <Legend items={[[b.color, "จำนวนผลิต"], [C.green, "ยอดขาย"]]} />
      <Table label={`รายการผลิต ${b.name}`} min={420}><thead><tr><th>รหัส</th><th>สินค้า</th><th className="num">ผลิต</th><th className="num">ขาย</th></tr></thead>
        <tbody>{p.items.map((item) => <tr key={`${item.code}|${item.name}`}><td className="nowrap">{item.code || "—"}</td><td>{item.name}{item.unit && <small>{item.unit}</small>}</td><td className="num">{fmt(item.qty)}</td><td className="num">{item.sold === null ? "—" : fmt(item.sold)}</td></tr>)}</tbody></Table>
    </>}
  </Card>;
}

function Production({ data, visible, go }) {
  const s = visible.reduce((x, b) => ({ sku: x.sku + b.production.sku, qty: x.qty + b.production.qty, sold: x.sold + b.production.sold, rec: x.rec + b.production.records }), { sku: 0, qty: 0, sold: 0, rec: 0 });
  const withData = visible.filter((b) => b.production.records > 0);
  const without = visible.filter((b) => b.production.records === 0);
  return <>
    <Title title="การผลิตสินค้า — แยกรายสาขา" sub="รวมทุกบันทึกการผลิตในช่วงที่เลือก ต่อสาขาและสินค้า" right={<button type="button" className="swd-link" onClick={() => go("store-production")}>ไปหน้าบันทึกการผลิต</button>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="บันทึกการผลิต" value={fmt(s.rec)} unit="ครั้ง" color={C.violet} />
      <Kpi label="SKU" value={fmt(s.sku)} unit="รายการ" color={C.cyan} />
      <Kpi label="จำนวนผลิต" value={fmt(s.qty)} unit="ชิ้น" color={C.blue} />
      <Kpi label="ยอดขาย" value={fmt(s.sold)} unit="ชิ้น" color={C.green} />
    </div>
    {without.length > 0 && withData.length > 0 && <Note color={C.cyan}>{without.map((b) => `${b.code} ${b.name}`).join(", ")} ไม่มีรายงานการผลิตในช่วงนี้</Note>}
    {withData.length === 0 ? <Empty>ยังไม่มีบันทึกการผลิตในช่วงนี้ · บันทึกได้ที่เมนูการผลิตสินค้า</Empty> :
      <div className={`swd-grid ${withData.length > 1 ? "swd-grid-2" : ""}`}>{withData.map((b) => <ProductionPanel key={b.code} b={b} />)}</div>}
  </>;
}

function Shortage({ data, visible, go, all }) {
  const codes = new Set(visible.map((b) => b.code));
  const rows = data.cases.shortages.filter((s) => inScope(s, codes, all));
  const withDays = rows.filter((s) => s.days != null);
  const avg = withDays.length ? withDays.reduce((s, r) => s + r.days, 0) / withDays.length : null;
  const openCases = visible.reduce((s, b) => s + b.cases.open, 0) + (all ? data.cases.storeOpen : 0);
  return <>
    <Title title="สินค้าขาด / ค้างรับ จากทะเบียนเคส" sub="เฉพาะเคสที่ยังเปิด · รายการที่ยอดค้างมากกว่าศูนย์ · สถานะปัจจุบันทุกวัน" right={<button type="button" className="swd-link" onClick={() => go("store-shortage")}>จัดการทะเบียนเคส</button>} />
    <div className="swd-kpis swd-kpis-5">
      <Kpi label="เคสค้าง" value={fmt(openCases)} unit="เคส" color={C.amber} />
      <Kpi label="รายการสินค้าค้าง" value={fmt(rows.length)} unit="รายการ" color={C.amber} />
      <Kpi label="เกินกำหนดรับ" value={fmt(rows.filter((s) => s.overdue).length)} unit="รายการ" color={C.red} />
      <Kpi label="ไม่มีกำหนดเข้า" value={fmt(rows.filter((s) => !s.eta).length)} unit="รายการ" color={C.red} />
      <Kpi label="ค้างนานสุด / เฉลี่ย" value={withDays.length ? fmt(Math.max(...withDays.map((s) => s.days))) : "—"} unit="วัน" sub={avg == null ? "ยังไม่ทราบวันเปิดเคส" : `เฉลี่ย ${fmt(avg)} วัน`} color={C.cyan} />
    </div>
    {data.cases.withoutLines > 0 && <Note color={C.cyan}>มีเคสค้าง {fmt(data.cases.withoutLines)} เคส (ทุกสาขา) ที่ยังไม่ระบุรายการสินค้า จึงยังไม่อยู่ในตารางนี้ · เติมรายการได้ที่ทะเบียนเคส</Note>}
    {rows.length === 0 ? <Empty>ไม่มีสินค้าค้างที่ระบุรายการในสาขาที่เลือก</Empty> :
      <Table label="สินค้าค้างรับ" min={900}><thead><tr><th>#</th><th>รหัส</th><th>ชื่อสินค้า</th><th>เอกสารต้นทาง</th><th>สาขา</th><th>เปิดเคส</th><th>PO / ผู้ขาย</th><th>กำหนดเข้า</th><th className="num">ค้าง</th><th className="num">วัน</th><th>สถานะ</th></tr></thead>
        <tbody>{rows.map((s, i) => <tr key={s.key}>
          <td>{i + 1}</td><td className="nowrap">{s.sku || "—"}</td><td>{s.name}{s.note && <small>{s.note}</small>}</td>
          <td className="nowrap">{s.sourceNumber}<small>{SOURCE[s.sourceType] || s.sourceType}</small></td><td>{s.storeLevel ? "ระดับสโตร์" : s.branchCode}</td>
          <td className="nowrap">{s.opened ? shortDate(s.opened) : "—"}</td><td>{s.po || "—"}{s.supplier && <small>{s.supplier}</small>}</td>
          <td className="nowrap">{s.eta ? (s.overdue ? <Badge color={C.red}>{shortDate(s.eta)} · เลยกำหนด</Badge> : shortDate(s.eta)) : <Badge color={C.red}>ไม่มีกำหนด</Badge>}</td>
          <td className="num nowrap">{fmt(s.remaining)} {s.unit}<small>จาก {fmt(s.required)}</small></td>
          <td className="num">{s.days != null ? <Badge color={s.days > 60 ? C.red : C.amber}>{fmt(s.days)}</Badge> : "—"}</td>
          <td>{TRACKING[s.trackingStatus] || s.trackingStatus}{s.owner && <small>{s.owner}</small>}</td>
        </tr>)}</tbody></Table>}
  </>;
}

function AuditPanel({ b, data }) {
  const a = b.audits;
  const zones = new Map();
  a.rows.forEach((r) => { const z = zones.get(r.zone) || { label: r.zone, ok: 0, bad: 0 }; z.ok += r.match; z.bad += r.mismatch; zones.set(r.zone, z); });
  const zoneRows = [...zones.values()].sort((x, y) => y.bad - x.bad).map((z) => ({ label: z.label, parts: [{ label: "ตรง", value: z.ok, color: C.green }, { label: "ไม่ตรง", value: z.bad, color: C.red }] }));
  return <Card accent={b.color} label={`Audit ${b.name}`}>
    <div className="swd-row"><BranchTag branch={b} big />{a.total > 0 && <Badge color={a.pass ? C.green : C.red}>{a.pass ? "KPI ผ่าน" : "KPI ไม่ผ่าน"}</Badge>}</div>
    {a.docs === 0 ? <Empty>ยังไม่มีการตรวจนับในช่วงนี้</Empty> : <>
      <Gauge value={a.accuracy} color={auditColor(a)} label="สินค้าตรง" sub={`${fmt(a.match)}/${fmt(a.total)} ชิ้น`} />
      <div className="swd-minis swd-minis-3">
        <Mini label="เอกสาร" value={fmt(a.docs)} color={b.color} />
        <Mini label="ไม่ตรง" value={fmt(a.mismatch)} color={a.mismatch ? C.red : C.green} />
        <Mini label="ชิ้น/วัน" value={fmt(a.total / data.days, 1)} />
      </div>
      <h4>แยกตามโซน / กลุ่มสินค้า</h4>
      <HBars rows={zoneRows} label={`ผลตรวจนับแยกโซน ${b.name}`} />
      <Legend items={[[C.green, "ตรง"], [C.red, "ไม่ตรง"]]} />
      <Table label={`เอกสารตรวจนับ ${b.name}`} min={520}><thead><tr><th>วันที่</th><th>โซน</th><th className="num">จำนวน</th><th className="num">ตรง</th><th className="num">ไม่ตรง</th><th className="num">% ตรง</th></tr></thead>
        <tbody>{a.rows.map((r) => <tr key={r.id || r.doc}><td className="nowrap">{shortDate(r.date)}<small>{r.doc}</small></td><td>{r.zone}{r.note && <small>{r.note}</small>}</td><td className="num">{fmt(r.total)}</td><td className="num">{fmt(r.match)}</td><td className="num" style={{ color: r.mismatch ? C.red : undefined }}>{fmt(r.mismatch)}</td><td className="num">{pctText(percent(r.match, r.total))}</td></tr>)}
          <tr className="is-total"><td>รวม</td><td /><td className="num">{fmt(a.total)}</td><td className="num">{fmt(a.match)}</td><td className="num">{fmt(a.mismatch)}</td><td className="num">{pctText(a.accuracy)}</td></tr></tbody></Table>
    </>}
  </Card>;
}

function Audit({ data, visible, go }) {
  const s = visible.reduce((x, b) => ({ q: x.q + b.audits.total, m: x.m + b.audits.mismatch, d: x.d + b.audits.docs }), { q: 0, m: 0, d: 0 });
  return <>
    <Title title="Internal Audit — ตรวจนับสินค้า แยกรายสาขา" sub={`เกณฑ์ผ่าน: สินค้าตรง ≥ ${data.auditPassPercent}%`} right={<button type="button" className="swd-link" onClick={() => go("store-audit")}>ไปหน้า Audit</button>} />
    <div className="swd-kpis swd-kpis-4">
      <Kpi label="เอกสารตรวจนับ" value={fmt(s.d)} unit="ฉบับ" color={C.violet} />
      <Kpi label="สินค้าตรง" value={fmt(s.q - s.m)} unit="ชิ้น" sub={pctText(percent(s.q - s.m, s.q))} color={C.green} />
      <Kpi label="สินค้าไม่ตรง" value={fmt(s.m)} unit="ชิ้น" sub={pctText(percent(s.m, s.q))} color={C.red} />
      <Kpi label="ตรวจนับรวม" value={fmt(s.q)} unit="ชิ้น" color={C.cyan} />
    </div>
    <div className={`swd-grid ${visible.length > 1 ? "swd-grid-3" : ""}`}>{visible.map((b) => <AuditPanel key={b.code} b={b} data={data} />)}</div>
  </>;
}

function Staff({ data }) {
  const rows = data.staff.map((p) => ({ ...p, jobs: p.booking + p.online + p.transfer + p.auditDocs })).sort((a, b) => b.jobs - a.jobs || b.logs - a.logs);
  const max = Math.max(1, ...rows.map((p) => p.jobs));
  return <>
    <Title title="ผลงานพนักงานสโตร์" sub="รวมทุกสาขา · ช่วงวันที่ที่เลือก · จำนวนเอกสารไม่ใช่คะแนนความสามารถหรือชั่วโมงทำงาน" />
    <Card label="ผลงานพนักงาน">
      {rows.length ? <Table label="ผลงานพนักงาน" min={820}><thead><tr><th>พนักงาน</th><th className="num">วันทำงาน</th><th className="num">ใบสั่งจอง</th><th className="num">ออนไลน์</th><th className="num">ใบโอน</th><th className="num">ใบโอนไม่ครบ</th><th className="num">Audit</th><th className="num">ชิ้นที่นับ</th><th className="num">บันทึกงาน</th><th className="num">รวมเอกสาร</th><th>สัดส่วน</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.uid}><td>{p.name}</td><td className="num">{fmt(p.days)}</td><td className="num">{fmt(p.booking)}</td><td className="num">{fmt(p.online)}</td><td className="num">{fmt(p.transfer)}</td><td className="num" style={{ color: p.issues ? C.red : undefined }}>{fmt(p.issues)}</td><td className="num">{fmt(p.auditDocs)}</td><td className="num">{fmt(p.auditItems)}</td><td className="num">{fmt(p.logs)}</td><td className="num"><b>{fmt(p.jobs)}</b></td><td><Bar value={p.jobs} max={max} color={C.cyan} /></td></tr>)}</tbody></Table> : <Empty>ยังไม่มีรายชื่อพนักงานสโตร์</Empty>}
    </Card>
  </>;
}

export default function StoreWarehouseDashboard({ apiFetch, settings, onNavigate, renderOperations }) {
  const [today] = useState(() => bangkokDateOf(new Date().toISOString()));
  const presets = rangePresets(today);
  const [range, setRange] = useState(() => ({ from: presets[2][2], to: today }));
  const [draft, setDraft] = useState(range);
  const [tab, setTab] = useState("overview");
  // The operations centre loads its own data; keep it mounted after the first visit so switching back does not re-read.
  const [opsOpened, setOpsOpened] = useState(false);
  const [sel, setSel] = useState("ALL");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const load = useCallback(async () => {
    const id = ++generation.current;
    setBusy(true);
    setError("");
    // Never show figures of another range under this range's heading (while loading or after an error).
    setData((prev) => (prev && prev.from === range.from && prev.to === range.to ? prev : null));
    try {
      const res = await apiFetch(`/api/store/warehouse?${new URLSearchParams(range)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "โหลดรายงานไม่สำเร็จ");
      if (id === generation.current) setData(json.data);
    } catch (e) {
      if (id === generation.current) setError(e.message || "โหลดรายงานไม่สำเร็จ");
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }, [apiFetch, range]);

  const invalidate = useCallback(() => { generation.current++; }, []);
  // Loads once per date range; switching tabs reuses the same data (no extra Firestore reads).
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => { clearTimeout(timer); invalidate(); };
  }, [load, invalidate]);

  const applyRange = (next) => { setRange(next); setDraft(next); };
  const submitCustom = (event) => {
    event.preventDefault();
    const picked = customRange(draft.from, draft.to);
    if (!picked || picked.dates.length > WAREHOUSE_MAX_DAYS) { setError(`ช่วงวันที่ไม่ถูกต้อง หรือเกิน ${WAREHOUSE_MAX_DAYS} วัน · ช่วงยาวกว่านี้ดูที่รายงานเดิมในแท็บศูนย์ปฏิบัติการ`); return; }
    applyRange({ ...draft });
  };
  const moduleName = (id, fallback) => settings?.modules?.find((m) => m.id === id)?.name || fallback;
  const go = (target) => (WAREHOUSE_TABS.some(([id]) => id === target) ? setTab(target) : onNavigate?.(target));

  const branches = (data?.branches || []).map((b, i) => ({ ...b, color: BRANCH_COLORS[i % BRANCH_COLORS.length] }));
  const shown = data ? { ...data, branches } : null;
  // A chip that disappears with a new range falls back to every branch.
  const selected = branches.find((b) => b.code === sel);
  const all = !selected;
  const visible = all ? branches : [selected];

  return <section className="swd" aria-label="รายงานแดชบอร์ดสโตร์">
    <header className="swd-head">
      <div>
        <span className="swd-eyebrow">HILLKOFF · STORE</span>
        <h2>Hillkoff Store Dashboard</h2>
        <p>รายงานการทำงานสโตร์ / คลังสินค้า · {rangeTitle(range.from, range.to)}{busy ? " · กำลังโหลด…" : ""}{data?.generatedAt ? ` · อัปเดต ${new Date(data.generatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : ""}</p>
      </div>
      <div className="swd-chips-row" role="group" aria-label="เลือกสาขา">
        <button type="button" className="swd-chip" aria-pressed={all} style={{ "--chip": C.amber }} onClick={() => setSel("ALL")}>ทุกสาขา</button>
        {branches.map((b) => <button type="button" key={b.code} className="swd-chip" aria-pressed={sel === b.code} style={{ "--chip": b.color }} onClick={() => setSel(b.code)}>{b.code} {b.name}</button>)}
      </div>
    </header>

    {tab !== "operations" && <form className="swd-range" onSubmit={submitCustom} aria-label="ช่วงเวลา">
      <div className="swd-presets" role="group" aria-label="ช่วงเวลาสำเร็จรูป">{presets.map(([id, label, from, to]) => <button type="button" key={id} aria-pressed={range.from === from && range.to === to} onClick={() => applyRange({ from, to })}>{label}</button>)}</div>
      <label>ตั้งแต่<input type="date" required value={draft.from} max={today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></label>
      <label>ถึง<input type="date" required value={draft.to} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></label>
      <button type="submit">กำหนดช่วงเอง</button>
      <button type="button" onClick={load} disabled={busy}>{busy ? "กำลังโหลด…" : "รีเฟรช"}</button>
    </form>}

    <nav className="swd-tabs" aria-label="หมวดรายงาน">{WAREHOUSE_TABS.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { if (id === "operations") setOpsOpened(true); setTab(id); }}>{label}</button>)}</nav>

    <div className="swd-body" aria-busy={busy}>
      {opsOpened && <div className="swd-legacy" hidden={tab !== "operations"}>{renderOperations?.()}</div>}
      {tab !== "operations" && <>
        {error && <p className="swd-error" role="alert">{error} <button type="button" onClick={load}>ลองอีกครั้ง</button></p>}
        {busy && !data && <p className="swd-loading" role="status">กำลังรวบรวมข้อมูลใบโอน Audit ใบสั่งจอง และเคส…</p>}
        {shown && <>
          {tab === "overview" && <Overview data={shown} visible={visible} go={go} all={all} />}
          {tab === "transfers" && <Transfers data={shown} visible={visible} go={go} />}
          {tab === "orders" && <Orders data={shown} go={go} moduleName={moduleName} />}
          {tab === "shortage" && <Shortage data={shown} visible={visible} go={go} all={all} />}
          {tab === "audit" && <Audit data={shown} visible={visible} go={go} />}
          {tab === "claims" && <Claims data={shown} visible={visible} go={go} all={all} />}
          {tab === "production" && <Production data={shown} visible={visible} go={go} />}
          {tab === "staff" && <Staff data={shown} />}
          {visible.length === 0 && tab !== "orders" && tab !== "staff" && <Empty>ยังไม่มีสาขาในตั้งค่าสโตร์</Empty>}
        </>}
      </>}
    </div>

    <footer className="swd-foot"><span>Hillkoff Store Report · {rangeTitle(range.from, range.to)}</span><span>แสดงผล: {selected ? `${selected.code} ${selected.name}` : "ทุกสาขา"}</span></footer>
  </section>;
}

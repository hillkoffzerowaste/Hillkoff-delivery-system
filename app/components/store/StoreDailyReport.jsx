"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bangkokMonthRange, fmt, lastNDates, pct, thaiDateLabel, thaiMonthLabel } from "../../../lib/storeFormat.js";
import { TIMELINE_TAGS, hoursOf, jobsOf, monthText, personText, teamText, unattributedText } from "../../../lib/storeDailyReport.js";
import "./StoreDailyReport.css";

const REFRESH_MS = 900_000;
const TEXT_BOX_ID = "line-report-text";
const COPY_OK = "คัดลอกรายงานแล้ว · วางในกลุ่ม LINE ได้เลย";
const COPY_FAILED = "เบราว์เซอร์นี้ไม่อนุญาตให้คัดลอกอัตโนมัติ · กรุณาเลือกข้อความในกล่องแล้วคัดลอกเอง";
const TABS = [["team", "ภาพรวมทั้งทีม"], ["person", "รายบุคคล"], ["month", "วัดผลรายเดือน"]];
const TAG_CLASS = {
  [TIMELINE_TAGS.booking]: "is-neutral",
  [TIMELINE_TAGS.online]: "is-neutral",
  [TIMELINE_TAGS.transfer]: "is-ok",
  [TIMELINE_TAGS.transferIncomplete]: "is-danger",
  [TIMELINE_TAGS.audit]: "is-info",
  [TIMELINE_TAGS.resolved]: "is-info-soft",
  [TIMELINE_TAGS.orderCheck]: "is-neutral"
};

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function lastNMonths(todayKey, n) {
  const [year, month] = todayKey.split("-").map(Number);
  return Array.from({ length: n }, (_, offset) => {
    const index = year * 12 + (month - 1) - (n - 1 - offset);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
  });
}

// Current month runs 1..today; earlier months run to their last day.
function monthEndDay(monthKey, todayKey) {
  return monthKey === todayKey.slice(0, 7) ? Number(todayKey.slice(8)) : Number(bangkokMonthRange(monthKey).to.slice(8));
}

function selectTextBox() {
  const box = document.getElementById(TEXT_BOX_ID);
  box.focus();
  box.select();
  return document.execCommand("copy");
}

// Clipboard API first; falls back to selecting the visible textarea. Always resolves to a boolean.
export async function copyText(text, { clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined, execCommand = selectTextBox } = {}) {
  try {
    if (clipboard && typeof clipboard.writeText === "function") {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the selection fallback
  }
  try {
    return Boolean(await execCommand(text));
  } catch {
    return false;
  }
}

function StatCard({ label, value, note, tone }) {
  return <article className={tone ? `sd-card is-${tone}` : "sd-card"}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function TeamView({ data, onPick }) {
  const rows = data.people;
  return <section aria-label="ภาพรวมทั้งทีม" className="sd-section">
    {data.team.people === 0 && !jobsOf(data.team) && !data.team.resolved && !data.unattributed?.orderChecks && <p className="sd-holiday">ไม่มีการบันทึกงานในวันนี้</p>}
    <div className="store-report-kpis sd-kpis">
      <StatCard label="งานรวมทั้งทีม" value={fmt(jobsOf(data.team))} note={`เอกสารที่บันทึก · ${data.team.people} คน`} />
      <StatCard label="ใบสั่งจอง / ออนไลน์" value={`${fmt(data.team.booking)} / ${fmt(data.team.online)}`} note="ใบ" tone="ok" />
      <StatCard label="ใบโอนสินค้า" value={fmt(data.team.transfer)} note={`ไม่ครบ ${data.team.issues} · แก้ไขแล้ว ${data.team.resolved} · ค้าง ${data.team.openIssues}`} tone="problem" />
      <StatCard label="Internal Audit" value={fmt(data.team.auditItems)} note={`รายการ · ${data.team.auditDocs} เอกสาร · ตรง ${pct(data.team.auditItems - data.team.mismatch, data.team.auditItems)}`} tone="info" />
    </div>
    <div className="store-report-table-wrap sd-table-wrap">
      <table className="sd-table sd-table-team" aria-label="สรุปรายบุคคลประจำวัน">
        <thead><tr><th scope="col">ชื่อสโตร์</th><th scope="col">ช่วงเวลาเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน (ไม่ครบ)</th><th scope="col" className="num">แก้ไขปัญหา</th><th scope="col" className="num">Audit (รายการ)</th><th scope="col" className="num">ตรวจออเดอร์*</th><th scope="col" className="num">งานรวม</th><th scope="col">รายคน</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.uid}>
          <th scope="row">{p.name}</th>
          <td>{hoursOf(p)}</td>
          <td className="num">{p.booking}</td>
          <td className="num">{p.online}</td>
          <td className="num">{p.transfer} <span className={p.openIssues ? "sd-issue-open" : "sd-issue"}>({p.issues})</span></td>
          <td className="num">{p.resolved}</td>
          <td className="num">{fmt(p.auditItems)}</td>
          <td className="num">{p.orderChecks}</td>
          <td className="num sd-strong">{jobsOf(p)}</td>
          <td><button type="button" className="secondary" onClick={() => onPick(p.uid)}>ดูรายคน</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    {unattributedText(data.unattributed) && <p className="sd-note">{unattributedText(data.unattributed)}</p>}
    <p className="sd-note">* ตรวจออเดอร์นับจากออเดอร์ที่อัปเดตในวันที่เลือก อาจไม่รวมประวัติของออเดอร์ที่ถูกอัปเดตอีกภายหลัง และไม่นับซ้ำในงานรวม</p>
  </section>;
}

function PersonView({ data, person, dateLabel, today, onPickPerson, onPickDate }) {
  if (!person) return <section aria-label="รายบุคคล" className="sd-section"><p className="sd-holiday">ยังไม่มีพนักงานสโตร์ในระบบ</p></section>;
  const week = data.week.map((day) => ({ day, entry: day.byUid[person.uid] || {} }));
  return <section aria-label="รายบุคคล" className="sd-section">
    <div role="group" aria-label="เลือกพนักงานสโตร์" className="sd-people">
      {data.people.map((p) => <button key={p.uid} type="button" className={p.uid === person.uid ? "sd-person is-active" : "sd-person"} aria-pressed={p.uid === person.uid} onClick={() => onPickPerson(p.uid)}>{p.name}</button>)}
    </div>
    <div className="store-report-kpis sd-kpis">
      <StatCard label={`งานรวม · ${person.name}`} value={jobsOf(person)} note={dateLabel} />
      <StatCard label="ช่วงเวลาเอกสารในระบบ" value={hoursOf(person)} note="จากรายการแรก–รายการสุดท้าย ไม่ใช่เวลาเข้างาน" tone="ok" />
      <StatCard label="ใบโอนที่จัด" value={person.transfer} note={`ไม่ครบ ${person.issues} · ค้าง ${person.openIssues} · แก้ไขปัญหา ${person.resolved}`} tone="problem" />
      <StatCard label="Internal Audit" value={fmt(person.auditItems)} note={`รายการ · ${person.auditDocs} เอกสาร · ตรง ${pct(person.auditItems - person.mismatch, person.auditItems)}`} tone="info" />
    </div>
    <div className="sd-block">
      <h3>ไทม์ไลน์จากประวัติงาน · {person.name}</h3>
      {person.timeline.length ? <ol className="sd-timeline">{person.timeline.map(([time, tag, body], index) => <li key={`${time}-${index}`}>
        <span className="sd-time">{time}</span>
        <span className={`sd-tag ${TAG_CLASS[tag] || "is-neutral"}`}>{tag}</span>
        <span className="sd-text">{body}</span>
      </li>)}</ol> : <p className="muted">ไม่มีการบันทึกงานในวันนี้</p>}
    </div>
    <div className="sd-block">
      <h3>ย้อนหลัง 7 วัน · {person.name}</h3>
      <div className="store-report-table-wrap sd-table-wrap">
        <table className="sd-table sd-table-history" aria-label="ประวัติรายวันของพนักงาน">
          <thead><tr><th scope="col">วันที่</th><th scope="col">ช่วงเวลาเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน</th><th scope="col" className="num">Audit (รายการ)</th><th scope="col" className="num">งานรวม</th><th scope="col">ดู</th></tr></thead>
          <tbody>{week.map(({ day, entry }) => {
            const label = thaiDateLabel(day.date);
            const shown = day.date === data.date;
            return <tr key={day.date} className={shown ? "is-selected" : undefined}>
              <th scope="row">{label.replace(/ \d{4}$/, "")}{day.date === today ? " (วันนี้)" : ""}</th>
              <td>{hoursOf(entry)}</td>
              <td className="num">{entry.booking || 0}</td>
              <td className="num">{entry.online || 0}</td>
              <td className="num">{entry.transfer || 0}</td>
              <td className="num">{fmt(entry.auditItems || 0)}</td>
              <td className="num sd-strong">{entry.jobs || 0}</td>
              <td><button type="button" className="secondary" aria-label={`ดูรายงาน ${label}`} onClick={() => onPickDate(day.date)}>ดูวันนี้</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  </section>;
}

function MonthView({ data }) {
  const rows = data.people.map((m) => ({ m, jobs: jobsOf(m), avg: m.days ? jobsOf(m) / m.days : 0 }));
  const maxAvg = Math.max(0, ...rows.map((row) => row.avg));
  return <section aria-label="วัดผลรายเดือน" className="sd-section">
    <div className="store-report-table-wrap sd-table-wrap">
      <table className="sd-table sd-table-month" aria-label="วัดผลรายเดือนรายบุคคล">
        <thead><tr><th scope="col">ชื่อสโตร์</th><th scope="col" className="num">วันที่มีเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน</th><th scope="col" className="num">Audit</th><th scope="col" className="num">งานรวม</th><th scope="col">เฉลี่ยงาน/วัน</th><th scope="col" className="num">ใบโอนครบ</th><th scope="col" className="num">ปัญหาที่ปิดแล้ว</th><th scope="col" className="num">ตรวจนับ</th><th scope="col" className="num">ความแม่นยำ</th></tr></thead>
        <tbody>{rows.map(({ m, jobs, avg }) => <tr key={m.uid}>
          <th scope="row">{m.name}</th>
          <td className="num">{m.days}</td>
          <td className="num">{fmt(m.booking)}</td><td className="num">{fmt(m.online)}</td><td className="num">{fmt(m.transfer)}</td><td className="num">{fmt(m.auditDocs)}</td>
          <td className="num sd-strong">{fmt(jobs)}</td>
          <td><div className="sd-avg"><div className="sd-bar" aria-hidden="true"><div style={{ width: `${maxAvg ? Math.round((avg / maxAvg) * 100) : 0}%` }} /></div><span>{avg.toFixed(1)}</span></div></td>
          <td className="num">{pct(m.transfer - m.issues, m.transfer)}</td>
          <td className={m.resolved < m.issues ? "num sd-issue-open" : "num sd-resolved-ok"}>{m.resolved} / {m.issues}</td>
          <td className="num">{fmt(m.auditItems)}</td>
          <td className="num">{pct(m.auditItems - m.mismatch, m.auditItems)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {unattributedText(data.unattributed) && <p className="sd-note">{unattributedText(data.unattributed)}</p>}
    <p className="sd-note">ตัวชี้วัดเริ่มต้น: งานรวม = ใบสั่งจอง + ใบขายออนไลน์ + ใบโอนที่จัด + เอกสาร Audit · ใบโอนครบ = ใบโอนที่รับครบ ÷ ใบโอนที่จัด · ปัญหาที่ปิดแล้ว = ใบโอนไม่ครบที่แก้ไขแล้ว ÷ ใบโอนไม่ครบ · ความแม่นยำ = สินค้าตรง ÷ ตรวจนับทั้งหมด</p>
  </section>;
}

export default function StoreDailyReport({ apiFetch, storeLabel = "สโตร์ WH" }) {
  const [today] = useState(bangkokToday);
  const [tab, setTab] = useState("team");
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [personUid, setPersonUid] = useState("");
  const [cache, setCache] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const kind = tab === "month" ? "month" : "date";
  const value = kind === "month" ? month : date;
  const key = `${kind}:${value}`;

  const load = useCallback(async (force) => {
    if (!force && cache[key]) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/store/daily-report?${kind}=${encodeURIComponent(value)}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "โหลดรายงานไม่สำเร็จ");
      setCache((current) => ({ ...current, [key]: json.data }));
      setErrors((current) => ({ ...current, [key]: "" }));
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: error.message || "โหลดรายงานไม่สำเร็จ" }));
    } finally {
      setBusy(false);
    }
  }, [apiFetch, cache, key, kind, value]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(false); }, 0);
    return () => clearTimeout(initial);
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  const dayData = cache[`date:${date}`];
  const monthData = cache[`month:${month}`];
  const active = kind === "month" ? monthData : dayData;
  const people = dayData?.people || [];
  const person = people.find((p) => p.uid === personUid) || people[0];
  const dateOptions = useMemo(() => {
    const keys = lastNDates(today, 7);
    return keys.includes(date) ? keys : [...keys, date].sort();
  }, [today, date]);
  const monthOptions = useMemo(() => lastNMonths(today, 6), [today]);
  const dateLabel = thaiDateLabel(date);

  let line = { title: "", text: "" };
  if (tab === "team" && dayData) line = { title: `ทั้งทีม ${dateLabel}`, text: teamText({ dateKey: date, rows: dayData.people, openIssues: dayData.openIssues, unattributed: dayData.unattributed, storeLabel }) };
  if (tab === "person" && dayData && person) line = { title: `${person.name} ${dateLabel}`, text: personText({ dateKey: date, person, storeLabel }) };
  if (tab === "month" && monthData) line = { title: `สรุปรายเดือน ${thaiMonthLabel(month)}`, text: monthText({ rangeLabel: monthData.rangeLabel, rows: monthData.people, unattributed: monthData.unattributed, storeLabel }) };
  if (line.text) line.text += "\nหมายเหตุ: ใบสั่งจองและออนไลน์นับตามผู้ตรวจสโตร์ล่าสุด · ใบโอนนับตามผู้จัด · เวลาเป็นเวลาบันทึกรายการ";
  if (line.text && kind === "date" && dayData?.openIssuesCapped && tab === "team") line.text += "\nหมายเหตุ: รายการใบโอนค้างแสดงไม่ครบ";
  if (line.text && kind === "date" && dayData?.ordersCapped) line.text += "\nหมายเหตุ: ข้อมูลตรวจออเดอร์ไม่ครบ จึงไม่แสดงรายการตรวจออเดอร์";
  if (!line.title) line.title = tab === "month" ? `สรุปรายเดือน ${thaiMonthLabel(month)}` : tab === "person" ? dateLabel : `ทั้งทีม ${dateLabel}`;
  const rows = Math.min(22, line.text.split("\n").length + 1);

  const choose = (setter) => (next) => { setter(next); setToast(null); };
  const pickTab = choose(setTab);
  const pickPerson = (uid) => { setPersonUid(uid); setToast(null); };
  const openPerson = (uid) => { setPersonUid(uid); setTab("person"); setToast(null); };
  const pickDate = choose(setDate);

  async function copy() {
    const ok = await copyText(line.text);
    setToast({ text: ok ? COPY_OK : COPY_FAILED, tone: ok ? "ok" : "warn" });
  }

  const error = errors[key];
  const loading = !active && !error;
  return <div className="sd-workspace">
    <header className="store-report-header sd-header">
      <div>
        <span className="store-report-eyebrow">DAILY STORE REPORT</span>
        <h2>รายงานการขับเคลื่อนประจำวัน</h2>
        <p>สรุปงานทั้งหมดของ{storeLabel} จากประวัติงานรายวัน · คัดลอกส่งกลุ่ม LINE ได้ · ดูย้อนหลังรายคนและวัดผลรายเดือน</p>
      </div>
      <div className="sd-tools">
        {tab !== "month" && <><label>วันที่<select value={date} onChange={(e) => pickDate(e.target.value)}>{dateOptions.map((d) => <option key={d} value={d}>{thaiDateLabel(d)}{d === today ? " (วันนี้)" : ""}</option>)}</select></label><label>เลือกวันที่ย้อนหลัง<input type="date" value={date} max={today} onChange={(e) => { if (e.target.value) pickDate(e.target.value); }} /></label></>}
        {tab === "month" && <label>เดือน<select value={month} onChange={(e) => { setMonth(e.target.value); setToast(null); }}>{monthOptions.map((m) => <option key={m} value={m}>{thaiMonthLabel(m, { endDay: monthEndDay(m, today) })}</option>)}</select></label>}
        <button type="button" className="secondary" onClick={() => load(true)} disabled={busy}><RefreshCw size={16} /> {busy ? "กำลังโหลด" : "รีเฟรช"}</button>
      </div>
    </header>

    <div role="tablist" aria-label="มุมมองรายงาน" className="sd-tabs">
      {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : undefined} onClick={() => pickTab(id)}>{label}</button>)}
    </div>
    <p className="sd-note">ใบสั่งจองและใบขายออนไลน์แยกตามผู้ตรวจสโตร์ล่าสุดที่ระบุในเอกสาร · ใบโอนแยกตามผู้จัด · ช่วงเวลาเป็นเวลาที่ระบบบันทึกรายการ</p>

    {error && <p role="alert" className="sd-error">{error}</p>}
    {kind === "date" && dayData?.ordersCapped && <p role="status" className="sd-error">ข้อมูลตรวจออเดอร์มีจำนวนมาก จึงไม่แสดงรายการตรวจออเดอร์ในรายงานนี้</p>}
    {kind === "date" && dayData?.openIssuesCapped && <p role="status" className="sd-error">รายการใบโอนค้างมีจำนวนมาก รายการที่แสดงอาจไม่ครบ</p>}
    {loading && <p role="status" className="muted">กำลังโหลดรายงาน...</p>}
    {tab === "team" && dayData && <TeamView data={dayData} onPick={openPerson} />}
    {tab === "person" && dayData && <PersonView data={dayData} person={person} dateLabel={dateLabel} today={today} onPickPerson={pickPerson} onPickDate={pickDate} />}
    {tab === "month" && monthData && <MonthView data={monthData} />}

    <section aria-label="ข้อความส่งกลุ่ม LINE" className="panel sd-line">
      <div className="panel-head">
        <div>
          <h3>ข้อความส่งกลุ่ม LINE · {line.title}</h3>
          <p className="muted">ข้อความเปลี่ยนตามแท็บ วันที่ และคนที่เลือก · กดคัดลอกแล้ววางในกลุ่ม LINE ได้ทันที</p>
        </div>
        <button type="button" className="primary" onClick={copy} disabled={!line.text}>คัดลอกรายงาน</button>
      </div>
      <label className="sd-line-box">ตัวอย่างข้อความ<textarea id={TEXT_BOX_ID} readOnly rows={rows} value={line.text} /></label>
      {toast && <p role="status" className={`sd-toast is-${toast.tone}`}>{toast.text}</p>}
    </section>
  </div>;
}

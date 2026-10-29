"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { bangkokMonthRange, fmt, lastNDates, pct, thaiDateLabel, thaiMonthLabel } from "../../../lib/storeFormat.js";
import { TIMELINE_TAGS, hoursOf, jobsOf, monthText, personText, teamText, unattributedText } from "../../../lib/storeDailyReport.js";
import { WORK_LOG_LIMITS, validateWorkLog, workLogHours } from "../../../lib/storeWorkLog.js";
import { DUTY_LIMITS, dutyText, validateDuty } from "../../../lib/storeDuty.js";
import StorePlanningPanel from "./StorePlanningPanel.jsx";
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
  [TIMELINE_TAGS.orderCheck]: "is-neutral",
  [TIMELINE_TAGS.log]: "is-log"
};

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const bangkokNowHHmm = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
// Only people from the store roster can own a work log; names seen only on old documents are shown but not editable.
const canLogFor = (person) => Boolean(person?.uid) && !person.uid.startsWith("name:");

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
        <thead><tr><th scope="col">ชื่อสโตร์</th><th scope="col">ตำแหน่ง / หน้าที่วันนี้</th><th scope="col">ช่วงเวลาเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน (ไม่ครบ)</th><th scope="col" className="num">แก้ไขปัญหา</th><th scope="col" className="num">Audit (รายการ)</th><th scope="col" className="num">ตรวจออเดอร์*</th><th scope="col" className="num">งานรวม</th><th scope="col" className="num">บันทึกงาน</th><th scope="col">รายคน</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.uid}>
          <th scope="row">{p.name}</th>
          <td className={p.duty?.today ? "sd-duty-cell is-today" : "sd-duty-cell"}>{dutyText(p.duty) || "—"}</td>
          <td>{hoursOf(p)}</td>
          <td className="num">{p.booking}</td>
          <td className="num">{p.online}</td>
          <td className="num">{p.transfer} <span className={p.openIssues ? "sd-issue-open" : "sd-issue"}>({p.issues})</span></td>
          <td className="num">{p.resolved}</td>
          <td className="num">{fmt(p.auditItems)}</td>
          <td className="num">{p.orderChecks}</td>
          <td className="num sd-strong">{jobsOf(p)}</td>
          <td className="num">{p.logCount || 0}</td>
          <td><button type="button" className="secondary" onClick={() => onPick(p.uid)}>ดูรายคน</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <TeamLogs people={rows} />
    {unattributedText(data.unattributed) && <p className="sd-note">{unattributedText(data.unattributed)}</p>}
    <p className="sd-note">* ตรวจออเดอร์นับจากออเดอร์ที่อัปเดตในวันที่เลือก อาจไม่รวมประวัติของออเดอร์ที่ถูกอัปเดตอีกภายหลัง และไม่นับซ้ำในงานรวม</p>
  </section>;
}

function TeamLogs({ people }) {
  const logs = people.flatMap((p) => (p.logs || []).map((log) => ({ ...log, staffName: p.name }))).sort((a, b) => a.start.localeCompare(b.start));
  return <div className="sd-block">
    <h3>บันทึกงานประจำวันของทีม · ใครทำอะไร ที่ไหน เมื่อไหร่ อย่างไร</h3>
    {logs.length ? <div className="store-report-table-wrap sd-table-wrap">
      <table className="sd-table sd-table-logs" aria-label="บันทึกงานประจำวันของทีม">
        <thead><tr><th scope="col">เวลา</th><th scope="col">พนักงาน</th><th scope="col">ทำอะไร</th><th scope="col">ที่ไหน</th><th scope="col">อย่างไร / รายละเอียด</th></tr></thead>
        <tbody>{logs.map((log) => <tr key={log.id}><td className="sd-strong">{workLogHours(log)}</td><th scope="row">{log.staffName}</th><td>{log.activity}</td><td>{log.location || "—"}</td><td className="sd-log-detail">{log.detail || "—"}</td></tr>)}</tbody>
      </table>
    </div> : <p className="muted">ยังไม่มีพนักงานลงบันทึกงานในวันนี้ · ให้พนักงานไปที่แท็บรายบุคคล คลิกชื่อตัวเอง แล้วลงงานที่ทำ</p>}
  </div>;
}

const emptyLog = (date, today) => ({ start: date === today ? bangkokNowHHmm() : "", end: "", activity: "", location: "", detail: "" });

function WorkLogPanel({ apiFetch, person, date, today, onChanged }) {
  const [form, setForm] = useState(() => emptyLog(date, today));
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const future = date > today;
  const reset = () => { setEditing(null); setForm(emptyLog(date, today)); };
  const send = async (method, body) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/store/work-logs", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "บันทึกงานไม่สำเร็จ");
      onChanged();
      return true;
    } catch (e) {
      setError(e.message || "บันทึกงานไม่สำเร็จ");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const submit = async (event) => {
    event.preventDefault();
    const checked = validateWorkLog({ ...form, date, staffId: person.uid });
    if (!checked.ok) return setError(checked.error);
    const body = editing ? { ...checked.value, id: editing.id, baseUpdatedAt: editing.updatedAt } : checked.value;
    if (await send(editing ? "PATCH" : "POST", body)) reset();
  };
  const edit = (log) => { setEditing(log); setForm({ start: log.start, end: log.end, activity: log.activity, location: log.location, detail: log.detail }); setError(""); };
  const remove = (log) => { if (window.confirm(`ลบบันทึกงาน “${log.activity}” หรือไม่?`)) void send("DELETE", { id: log.id, baseUpdatedAt: log.updatedAt }); };
  const field = (name) => ({ value: form[name], onChange: (e) => setForm({ ...form, [name]: e.target.value }) });
  return <div className="sd-block">
    <h3>บันทึกงานประจำวัน · {person.name}</h3>
    <p className="muted">ลงสิ่งที่ทำเพิ่มจากเอกสารในระบบ: ทำอะไร ที่ไหน เวลาไหน และทำอย่างไร · ข้อมูลนี้รวมในรายงานทีม ข้อความ LINE และแดชบอร์ด</p>
    {error && <p role="alert" className="sd-error">{error}</p>}
    {future ? <p className="sd-holiday">ยังไม่ถึงวันนี้ · งานล่วงหน้าให้ใส่ในปฏิทินส่วนตัวด้านล่าง</p> : <form className="sd-log-form" onSubmit={submit}>
      <label>เวลาเริ่ม<input type="time" required {...field("start")} /></label>
      <label>เวลาสิ้นสุด<input type="time" {...field("end")} /></label>
      <label className="sd-log-wide">ทำอะไร<input required maxLength={WORK_LOG_LIMITS.activity} placeholder="เช่น จัดเรียงสินค้าเข้าชั้น" {...field("activity")} /></label>
      <label className="sd-log-wide">ที่ไหน<input maxLength={WORK_LOG_LIMITS.location} placeholder="เช่น คลัง WH ชั้น 2" {...field("location")} /></label>
      <label className="sd-log-full">อย่างไร / รายละเอียด<textarea maxLength={WORK_LOG_LIMITS.detail} placeholder="วิธีทำ ผลลัพธ์ หรือปัญหาที่พบ" {...field("detail")} /></label>
      <div className="sd-log-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "กำลังบันทึก" : editing ? "บันทึกการแก้ไข" : "เพิ่มบันทึกงาน"}</button>{editing && <button type="button" className="secondary" disabled={busy} onClick={reset}>ยกเลิก</button>}</div>
    </form>}
    {person.logs?.length ? <ul className="sd-log-list">{person.logs.map((log) => <li key={log.id}>
      <div><b>{workLogHours(log)} · {log.activity}</b>{log.location && <span> @ {log.location}</span>}{log.detail && <p>{log.detail}</p>}</div>
      <div className="sd-log-actions"><button type="button" className="secondary" disabled={busy} onClick={() => edit(log)}>แก้ไข</button><button type="button" className="secondary danger" disabled={busy} onClick={() => remove(log)}>ลบ</button></div>
    </li>)}</ul> : <p className="muted">ยังไม่มีบันทึกงานในวันนี้</p>}
  </div>;
}

function DutyPanel({ apiFetch, person, date, dateLabel, onChanged }) {
  const duty = person.duty || { position: "", area: "", today: false, standing: { position: "", area: "" } };
  const [day, setDay] = useState(() => ({ position: duty.today ? duty.position : duty.standing.position, area: duty.today ? duty.area : duty.standing.area }));
  const [standing, setStanding] = useState(() => ({ ...duty.standing }));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const send = async (method, body) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/store/duties", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ staffId: person.uid, ...body }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "บันทึกหน้าที่ไม่สำเร็จ");
      onChanged();
    } catch (e) {
      setError(e.message || "บันทึกหน้าที่ไม่สำเร็จ");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const check = (value) => { const result = validateDuty({ ...value, staffId: person.uid }); if (!result.ok) setError(result.error); return result.ok; };
  const saveDay = (event) => { event.preventDefault(); if (check({ ...day, scope: "day", date })) void send("PUT", { ...day, scope: "day", date }); };
  const saveStanding = (event) => { event.preventDefault(); if (check({ ...standing, scope: "default" })) void send("PUT", { ...standing, scope: "default" }); };
  return <div className="sd-block">
    <h3>ตำแหน่งและหน้าที่ · {person.name}</h3>
    <p className={dutyText(duty) ? "sd-duty-now" : "muted"}>{dutyText(duty) ? `${duty.today ? `หน้าที่วันนี้ (${dateLabel})` : "ตำแหน่งประจำ"}: ${dutyText(duty)}` : "ยังไม่ได้กำหนดตำแหน่งหรือหน้าที่ · ใช้กับงานที่ไม่ใช่ใบสั่งจอง ใบขาย หรือใบโอน เช่น หัวหน้าคลังสินค้า"}</p>
    {error && <p role="alert" className="sd-error">{error}</p>}
    <div className="sd-duty-grid">
      <form className="sd-log-form" onSubmit={saveDay} aria-label="หน้าที่วันนี้">
        <b className="sd-log-full">หน้าที่เฉพาะวันที่ {dateLabel}</b>
        <label>ตำแหน่งวันนี้<input maxLength={DUTY_LIMITS.position} placeholder="เช่น หัวหน้าคลังสินค้า" value={day.position} onChange={(e) => setDay({ ...day, position: e.target.value })} /></label>
        <label>รับผิดชอบส่วนไหน<input maxLength={DUTY_LIMITS.area} placeholder="เช่น ตรวจรับสินค้าเข้าคลัง" value={day.area} onChange={(e) => setDay({ ...day, area: e.target.value })} /></label>
        <div className="sd-log-actions"><button type="submit" className="primary" disabled={busy}>บันทึกหน้าที่วันนี้</button>{duty.today && <button type="button" className="secondary" disabled={busy} onClick={() => send("DELETE", { date })}>ใช้ตำแหน่งประจำแทน</button>}</div>
      </form>
      <form className="sd-log-form" onSubmit={saveStanding} aria-label="ตำแหน่งประจำ">
        <b className="sd-log-full">ตำแหน่งประจำ (ใช้ทุกวันที่ไม่ได้กำหนดหน้าที่เฉพาะ)</b>
        <label>ตำแหน่ง<input maxLength={DUTY_LIMITS.position} placeholder="เช่น หัวหน้าคลังสินค้า" value={standing.position} onChange={(e) => setStanding({ ...standing, position: e.target.value })} /></label>
        <label>ส่วนงานที่รับผิดชอบ<input maxLength={DUTY_LIMITS.area} placeholder="เช่น ดูแลคลังสินค้าทั้งหมด" value={standing.area} onChange={(e) => setStanding({ ...standing, area: e.target.value })} /></label>
        <div className="sd-log-actions"><button type="submit" className="secondary" disabled={busy}>บันทึกตำแหน่งประจำ</button></div>
      </form>
    </div>
  </div>;
}

function PersonView({ data, person, dateLabel, today, onPickPerson, onPickDate, apiFetch, onLogsChanged, logVersion }) {
  if (!person) return <section aria-label="รายบุคคล" className="sd-section"><p className="sd-holiday">ยังไม่มีพนักงานสโตร์ในระบบ</p></section>;
  const week = data.week.map((day) => ({ day, entry: day.byUid[person.uid] || {} }));
  return <section aria-label="รายบุคคล" className="sd-section">
    <div className="sd-block">
      <h3>คลิกชื่อตัวเอง เพื่อลงงานประจำวันและดูปฏิทินส่วนตัว</h3>
      <div role="group" aria-label="เลือกพนักงานสโตร์" className="sd-people">
        {data.people.map((p) => <button key={p.uid} type="button" className={p.uid === person.uid ? "sd-person is-active" : "sd-person"} aria-pressed={p.uid === person.uid} onClick={() => onPickPerson(p.uid)}>{p.name}</button>)}
      </div>
    </div>
    <div className="store-report-kpis sd-kpis">
      <StatCard label={`งานรวม · ${person.name}`} value={jobsOf(person)} note={dateLabel} />
      <StatCard label="ช่วงเวลาเอกสารในระบบ" value={hoursOf(person)} note="จากรายการแรก–รายการสุดท้าย ไม่ใช่เวลาเข้างาน" tone="ok" />
      <StatCard label="ใบโอนที่จัด" value={person.transfer} note={`ไม่ครบ ${person.issues} · ค้าง ${person.openIssues} · แก้ไขปัญหา ${person.resolved}`} tone="problem" />
      <StatCard label="Internal Audit" value={fmt(person.auditItems)} note={`รายการ · ${person.auditDocs} เอกสาร · ตรง ${pct(person.auditItems - person.mismatch, person.auditItems)}`} tone="info" />
    </div>
    {canLogFor(person) && <DutyPanel key={`duty:${person.uid}:${data.date}:${dutyText(person.duty)}:${dutyText(person.duty?.standing)}`} apiFetch={apiFetch} person={person} date={data.date} dateLabel={dateLabel} onChanged={onLogsChanged} />}
    <div className="sd-person-grid">
    {canLogFor(person) && <WorkLogPanel key={`${person.uid}:${data.date}`} apiFetch={apiFetch} person={person} date={data.date} today={today} onChanged={onLogsChanged} />}
    <div className="sd-block">
      <h3>ไทม์ไลน์จากประวัติงานและบันทึกงาน · {person.name}</h3>
      {person.timeline.length ? <ol className="sd-timeline">{person.timeline.map(([time, tag, body], index) => <li key={`${time}-${index}`}>
        <span className="sd-time">{time}</span>
        <span className={`sd-tag ${TAG_CLASS[tag] || "is-neutral"}`}>{tag}</span>
        <span className="sd-text">{body}</span>
      </li>)}</ol> : <p className="muted">ไม่มีการบันทึกงานในวันนี้</p>}
    </div>
    </div>
    {canLogFor(person) && <StorePlanningPanel key={person.uid} apiFetch={apiFetch} owner={{ id: person.uid, name: person.name }} date={data.date} onSelectDate={onPickDate} refreshKey={logVersion} />}
    <div className="sd-block">
      <h3>ย้อนหลัง 7 วัน · {person.name}</h3>
      <div className="store-report-table-wrap sd-table-wrap">
        <table className="sd-table sd-table-history" aria-label="ประวัติรายวันของพนักงาน">
          <thead><tr><th scope="col">วันที่</th><th scope="col">ช่วงเวลาเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน</th><th scope="col" className="num">Audit (รายการ)</th><th scope="col" className="num">งานรวม</th><th scope="col" className="num">บันทึกงาน</th><th scope="col">ดู</th></tr></thead>
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
              <td className="num">{entry.logs || 0}</td>
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
        <thead><tr><th scope="col">ชื่อสโตร์</th><th scope="col" className="num">วันที่มีเอกสาร</th><th scope="col" className="num">ใบสั่งจอง</th><th scope="col" className="num">ออนไลน์</th><th scope="col" className="num">ใบโอน</th><th scope="col" className="num">Audit</th><th scope="col" className="num">งานรวม</th><th scope="col">เฉลี่ยงาน/วัน</th><th scope="col" className="num">ใบโอนครบ</th><th scope="col" className="num">ปัญหาที่ปิดแล้ว</th><th scope="col" className="num">ตรวจนับ</th><th scope="col" className="num">ความแม่นยำ</th><th scope="col" className="num">บันทึกงาน</th></tr></thead>
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
          <td className="num">{fmt(m.logs || 0)}</td>
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
  const [logVersion, setLogVersion] = useState(0);

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
  const logsChanged = () => { setLogVersion((n) => n + 1); void load(true); };

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
    {tab === "person" && dayData && <PersonView data={dayData} person={person} dateLabel={dateLabel} today={today} onPickPerson={pickPerson} onPickDate={pickDate} apiFetch={apiFetch} onLogsChanged={logsChanged} logVersion={logVersion} />}
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

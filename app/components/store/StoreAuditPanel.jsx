"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildAuditDaily, computeAuditCounts, summarizeAuditDay, validateAuditInput } from "../../../lib/storeAudit";
import { addDaysToDateKey, bangkokTimeHHmm, fmt, lastNDates, one, pct, thaiDateLabel } from "../../../lib/storeFormat";
import { documentPrefixes, getActiveBranches, lockedNumberPrefix, sampleDocumentNumber } from "../../../lib/storeSettings";
import LockedNumberInput, { runningPart } from "./LockedNumberInput.jsx";
import "./StoreAuditPanel.css";

const AUDITS_URL = "/api/store/audits";
const STAFF_URL = "/api/store/staff";
const sharedAccount = (name) => String(name || "").trim().toLowerCase() === "store";
const DAYS_IN_SUMMARY = 7;
const JSON_HEADERS = { "Content-Type": "application/json" };
const DEFAULT_FIELD = { label: "", show: true, required: false };

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

const accuracyText = (summary) => pct(summary.match, summary.total);

export default function StoreAuditPanel({ apiFetch, settings, profile }) {
  const cfg = settings?.documents?.audit;
  const fields = useMemo(() => {
    const byId = new Map((cfg?.fields || []).map((field) => [field.id, field]));
    return (id) => byId.get(id) || { ...DEFAULT_FIELD, label: id };
  }, [cfg]);
  const branches = useMemo(() => getActiveBranches(settings), [settings]);
  const today = todayKey();

  const emptyForm = useCallback((branchCode = "") => ({
    no: "", noEdited: false, branchCode, zone: "", checker: sharedAccount(profile?.name) ? "" : profile?.name || "", total: "", match: "", note: ""
  }), [profile?.name]);

  const [date, setDate] = useState(today);
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [avgMode, setAvgMode] = useState("active");
  const [form, setForm] = useState(() => emptyForm());
  const [autoNo, setAutoNo] = useState("");
  const [headPrefix, setHeadPrefix] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [staff, setStaff] = useState([]);

  const apiRef = useRef(apiFetch);
  const nextSequence = useRef(0);
  const savingRef = useRef(false);
  const removingRef = useRef(false);
  useEffect(() => { apiRef.current = apiFetch; });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiRef.current(STAFF_URL);
        const json = await readJson(response);
        if (!cancelled && response.ok && json.ok && Array.isArray(json.data)) setStaff(json.data);
      } catch {
        // Without the roster the dropdown keeps the default name only.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const branchCode = branches.some((branch) => branch.code === form.branchCode) ? form.branchCode : branches[0]?.code || "";
  // Only the branch pattern puts the branch into the number, so only then does a branch change need a new number.
  const numberBranch = cfg?.pattern === "branch" ? branchCode : "";
  const prefixes = documentPrefixes(cfg);
  const numberHead = prefixes.includes(headPrefix) ? headPrefix : prefixes[0] || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await apiRef.current(`${AUDITS_URL}?from=${addDaysToDateKey(date, -(DAYS_IN_SUMMARY - 1))}&to=${date}`);
        const json = await readJson(response);
        if (cancelled) return;
        if (!response.ok || !json.ok) throw new Error(json.error || "โหลดข้อมูลตรวจนับไม่สำเร็จ");
        setItems(json.data?.items || []);
        setLoadError("");
      } catch (error) {
        if (!cancelled) setLoadError(error.message || "โหลดข้อมูลตรวจนับไม่สำเร็จ");
      }
    })();
    return () => { cancelled = true; };
  }, [date, reloadTick]);

  const fetchNextNumber = useCallback(async (forBranch, head) => {
    const sequence = (nextSequence.current += 1);
    try {
      const response = await apiRef.current(`${AUDITS_URL}?next=true${forBranch ? `&branchCode=${encodeURIComponent(forBranch)}` : ""}${head ? `&prefix=${encodeURIComponent(head)}` : ""}`);
      const json = await readJson(response);
      if (sequence !== nextSequence.current || !response.ok || !json.ok) return;
      const number = json.data?.documentNumber || "";
      setAutoNo(number);
      setForm((current) => (current.noEdited ? current : { ...current, no: number }));
    } catch {
      // Leave the number blank: the server issues one on save.
    }
  }, []);

  useEffect(() => {
    fetchNextNumber(numberBranch, numberHead);
  }, [numberBranch, numberHead, fetchNextNumber]);

  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value, ...(key === "no" ? { noEdited: true } : {}) }));
    setToast(null);
  };

  const total = Number(form.total);
  const match = Number(form.match);
  const hasNumbers = form.total !== "" && form.match !== "" && Number.isFinite(total) && Number.isFinite(match);
  const { mismatch: liveMismatch } = computeAuditCounts({ total, match });
  const overCount = hasNumbers && liveMismatch < 0;
  const needsNote = hasNumbers && liveMismatch > 0;
  const noteField = fields("note");
  const mismatchText = !hasNumbers ? "—" : overCount ? "เกินจำนวน" : fmt(liveMismatch);
  const accuracyLive = hasNumbers && !overCount ? pct(match, total) : "—";

  const checkerNames = useMemo(() => {
    const names = staff.map((person) => String(person.name || "").trim()).filter((name) => name && !sharedAccount(name));
    // A name already in the form (e.g. the signed-in person's) stays selectable even before the roster loads.
    return [...new Set([...(form.checker ? [form.checker] : []), ...names])];
  }, [staff, form.checker]);

  const dayItems = useMemo(
    () => items.filter((item) => item.serviceDate === date).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [items, date]
  );
  const dayTotals = summarizeAuditDay(dayItems);
  const daily = useMemo(
    () => buildAuditDaily({ audits: items, dates: lastNDates(date, DAYS_IN_SUMMARY), mode: avgMode }),
    [items, date, avgMode]
  );
  const isToday = date === today;
  const dayWord = isToday ? "วันนี้" : "วันที่เลือก";

  const resetForm = () => {
    setForm(emptyForm(branchCode));
    setToast(null);
    fetchNextNumber(numberBranch, numberHead);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    // Always rebuild from today's locked prefix, so a branch change cannot leave the old branch in the number.
    const documentNumber = lockedPrefix && form.no ? `${lockedPrefix}${runningPart(form.no, lockedPrefix)}` : form.no;
    const numberAuto = documentNumber.trim() !== "" && documentNumber === autoNo;
    const body = {
      documentNumber, numberAuto, numberPrefix: numberHead, branchCode, zone: form.zone, checkerName: form.checker, total: form.total, match: form.match, note: form.note
    };
    // The shared store login is not a person, so a checker must be picked whenever the roster is available.
    if (fields("checker").show && staff.length && !form.checker) {
      setToast({ text: "กรุณาเลือกผู้ตรวจนับจากรายชื่อ", tone: "error" });
      return;
    }
    const checked = validateAuditInput(body, { settings, profile });
    if (!checked.ok) {
      setToast({ text: checked.error, tone: "error" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const response = await apiRef.current(AUDITS_URL, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
      const json = await readJson(response);
      if (!response.ok || !json.ok) throw new Error(json.error || "บันทึกผลตรวจนับไม่สำเร็จ");
      setToast({ text: `บันทึก ${json.data?.documentNumber || ""} แล้ว · ยอดรวมวันนี้และค่าเฉลี่ยอัปเดตแล้ว`, tone: "ok" });
      // Keep the checker: the same person usually counts several zones in a row.
      setForm({ ...emptyForm(branchCode), checker: form.checker });
      setDate(todayKey());
      setReloadTick((tick) => tick + 1);
      fetchNextNumber(numberBranch);
    } catch (error) {
      setToast({ text: error.message || "บันทึกผลตรวจนับไม่สำเร็จ", tone: "error" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmRemoval = async (event) => {
    event.preventDefault();
    if (removingRef.current || !removal) return;
    if (!removal.reason.trim()) {
      setToast({ text: "กรุณาระบุเหตุผลในการลบ", tone: "error" });
      return;
    }
    removingRef.current = true;
    setRemoving(true);
    try {
      const response = await apiRef.current(AUDITS_URL, { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ id: removal.id, reason: removal.reason }) });
      const json = await readJson(response);
      if (!response.ok || !json.ok) throw new Error(json.error || "ลบเอกสารตรวจนับไม่สำเร็จ");
      setToast({ text: `ลบ ${removal.no} แล้ว`, tone: "ok" });
      setRemoval(null);
      setReloadTick((tick) => tick + 1);
      fetchNextNumber(numberBranch);
    } catch (error) {
      setToast({ text: error.message || "ลบเอกสารตรวจนับไม่สำเร็จ", tone: "error" });
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  };

  const labelOf = (id, suffix = "") => {
    const field = fields(id);
    return `${field.label}${suffix}${field.required ? " *" : ""}`;
  };
  const sample = cfg ? sampleDocumentNumber(cfg, { branchCode: branchCode || "WH", serviceDate: today }) : "";
  const lockedPrefix = lockedNumberPrefix(cfg, today, branchCode, numberHead);
  const lockedHeads = prefixes.map((prefix) => ({ prefix, head: lockedNumberPrefix(cfg, today, branchCode, prefix) })).filter((item) => item.head);
  // Each head runs its own sequence, so switching heads asks the server for that head's next number.
  const changeHead = (head) => {
    setHeadPrefix(lockedHeads.find((item) => item.head === head)?.prefix || "");
    setAutoNo("");
    setForm((current) => ({ ...current, no: "", noEdited: false }));
  };
  const basisText = avgMode === "calendar" ? `หาร ${daily.basis} วันตามปฏิทิน` : `หาร ${daily.basis} วันที่มีการตรวจ`;

  return (
    <div className="sa-root">
      <header className="store-report-header sa-header">
        <div>
          <span className="store-report-eyebrow">STORE OPERATIONS · โมดูลเสริม</span>
          <h2>Internal Audit สินค้า</h2>
          <p>บันทึกผลตรวจนับสต็อกตามเลขที่เอกสาร เทียบสินค้าตรง / ไม่ตรงกับระบบ และสรุปจำนวนตรวจนับต่อวัน</p>
        </div>
        <label className="sa-field sa-date">
          วันที่
          <input type="date" value={date} max={today} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </label>
      </header>

      {loadError && <p className="sa-toast is-error" role="alert">{loadError}</p>}

      <div className="store-report-kpis sa-kpis">
        <article className="is-docs">
          <span>เอกสารตรวจนับ{dayWord}</span>
          <strong>{fmt(dayTotals.docs)}</strong>
          <small>ใบ</small>
        </article>
        <article className="is-total">
          <span>ตรวจนับทั้งหมด{dayWord}</span>
          <strong>{fmt(dayTotals.total)}</strong>
          <small>รายการ (รวมทุกเอกสาร)</small>
        </article>
        <article className="is-match">
          <span>{fields("match").label}</span>
          <strong>{fmt(dayTotals.match)}</strong>
          <small>ความแม่นยำ {accuracyText(dayTotals)}</small>
        </article>
        <article className="is-mismatch">
          <span>{fields("mismatch").label}</span>
          <strong>{fmt(dayTotals.mismatch)}</strong>
          <small>ต้องตรวจสอบต่อ</small>
        </article>
        <article className="is-average">
          <span>เฉลี่ยตรวจนับต่อวัน</span>
          <strong>{one(daily.avg.total)}</strong>
          <small>รายการ/วัน · 7 วันล่าสุด</small>
        </article>
      </div>

      <section className="panel sa-form" aria-label="บันทึกผลตรวจนับ">
        <div className="panel-head">
          <h2>บันทึกผลตรวจนับ</h2>
          <span>เลขที่เอกสารรันอัตโนมัติ ({sample}) · {lockedPrefix ? "ระบบใส่หัวเลขให้ แก้ได้เฉพาะเลขรัน" : "แก้ได้ก่อนบันทึก"}</span>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="sa-row">
            <label className="sa-field">
              {labelOf("no")}
              <LockedNumberInput id="sa-number" label={fields("no").label} value={form.no} onChange={(value) => setField("no", value)} prefixes={lockedHeads.map((item) => item.head)} prefix={lockedPrefix} onPrefixChange={changeHead} digits={cfg?.digits || 4} sampleText={sample} />
            </label>
            {branches.length ? (
              <label className="sa-field">
                {labelOf("area")}
                <select value={branchCode} onChange={(event) => setField("branchCode", event.target.value)}>
                  {branches.map((branch) => <option key={branch.code} value={branch.code}>{branch.name}</option>)}
                </select>
              </label>
            ) : (
              <p className="sa-toast is-error" role="alert">ยังไม่มีสาขา · ไปที่ตั้งค่าสโตร์ &gt; สาขา เพื่อเพิ่ม</p>
            )}
            {fields("zone").show && (
              <label className="sa-field">
                {labelOf("zone")}
                <input value={form.zone} onChange={(event) => setField("zone", event.target.value)} placeholder="เช่น หมวด A" />
              </label>
            )}
            {fields("checker").show && (
              <label className="sa-field">
                {labelOf("checker")}
                <select value={form.checker} onChange={(event) => setField("checker", event.target.value)}>
                  <option value="">เลือกผู้ตรวจนับ</option>
                  {checkerNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="sa-row sa-numbers">
            <label className="sa-field">
              {labelOf("total", " (รายการ)")}
              <input type="number" min="0" inputMode="numeric" value={form.total} onChange={(event) => setField("total", event.target.value)} placeholder="0" />
            </label>
            <label className="sa-field">
              {labelOf("match", " (รายการ)")}
              <input type="number" min="0" inputMode="numeric" value={form.match} onChange={(event) => setField("match", event.target.value)} placeholder="0" />
            </label>
            <div className={`sa-calc${overCount ? " is-invalid" : needsNote ? " is-warn" : ""}`}>
              <span>{fields("mismatch").label} (คำนวณอัตโนมัติ)</span>
              <strong>{mismatchText}</strong>
            </div>
            <div className="sa-calc">
              <span>ความแม่นยำ</span>
              <strong>{accuracyLive}</strong>
            </div>
          </div>
          {noteField.show && (
            <label className={`sa-field sa-note${needsNote ? " is-warn" : ""}`}>
              {needsNote ? `${noteField.label} * (มีสินค้าไม่ตรง ต้องระบุ)` : labelOf("note")}
              <input
                value={form.note}
                onChange={(event) => setField("note", event.target.value)}
                placeholder="เช่น ไซรัปคาราเมล นับได้ 22 ระบบ 24"
                aria-invalid={needsNote && !form.note.trim() ? "true" : undefined}
              />
            </label>
          )}
          <div className="sa-actions">
            {toast && <p className={`sa-toast ${toast.tone === "error" ? "is-error" : "is-ok"}`} role={toast.tone === "error" ? "alert" : "status"}>{toast.text}</p>}
            <div className="sa-buttons">
              <button type="button" className="secondary" onClick={resetForm} disabled={saving}>ล้างฟอร์ม</button>
              <button type="submit" className="primary" disabled={saving || !branches.length}>{saving ? "กำลังบันทึก..." : "บันทึกผลตรวจนับ"}</button>
            </div>
          </div>
        </form>
      </section>

      <section className="sa-section" aria-label={`เอกสารตรวจนับ${dayWord}`}>
        <h2>เอกสารตรวจนับ{dayWord} · {thaiDateLabel(date)}</h2>
        <div className="sa-table-wrap">
          <table className="sa-table sa-table-day" aria-label={`เอกสารตรวจนับ${dayWord}`}>
            <thead>
              <tr>
                <th scope="col">เลขที่เอกสาร</th>
                <th scope="col">สาขา / หมวดรหัส</th>
                <th scope="col">ผู้ตรวจ / เวลา</th>
                <th scope="col" className="is-num">ตรวจนับ</th>
                <th scope="col" className="is-num">ตรง</th>
                <th scope="col" className="is-num">ไม่ตรง</th>
                <th scope="col" className="is-num">ความแม่นยำ</th>
                <th scope="col">รายการที่ไม่ตรง / หมายเหตุ</th>
                <th scope="col">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {dayItems.length === 0 && (
                <tr><td colSpan={9} className="sa-empty">ยังไม่มีเอกสารตรวจนับ{dayWord}</td></tr>
              )}
              {dayItems.map((audit) => {
                const bad = audit.mismatch > 0;
                return (
                  <tr key={audit.id}>
                    <td><b>{audit.documentNumber}</b></td>
                    <td><div>{audit.branchName}</div><small>{audit.zone || "—"}</small></td>
                    <td><div>{audit.checkerName}</div><small>{bangkokTimeHHmm(audit.createdAt)} น.</small></td>
                    <td className="is-num">{fmt(audit.total)}</td>
                    <td className="is-num is-match">{fmt(audit.match)}</td>
                    <td className="is-num"><span className={`sa-badge${bad ? " is-warn" : ""}`}>{fmt(audit.mismatch)}</span></td>
                    <td className="is-num">{pct(audit.match, audit.total)}</td>
                    <td className={audit.note ? "sa-note-text is-warn" : "sa-note-text"}>{audit.note || "ตรงทั้งหมด"}</td>
                    <td>
                      {profile?.uid && audit.createdByUid === profile.uid
                        ? <button type="button" className="secondary danger sa-delete" onClick={() => setRemoval({ id: audit.id, no: audit.documentNumber, reason: "" })} disabled={removing}>ลบ</button>
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>รวม{dayWord} ({fmt(dayTotals.docs)} เอกสาร)</th>
                <td className="is-num">{fmt(dayTotals.total)}</td>
                <td className="is-num is-match">{fmt(dayTotals.match)}</td>
                <td className="is-num is-warn">{fmt(dayTotals.mismatch)}</td>
                <td className="is-num">{accuracyText(dayTotals)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        {removal && (
          <form className="sa-remove" onSubmit={confirmRemoval} aria-label={`ลบ ${removal.no}`}>
            <label className="sa-field">
              เหตุผลในการลบ {removal.no} *
              <input value={removal.reason} onChange={(event) => setRemoval({ ...removal, reason: event.target.value })} placeholder="เช่น บันทึกผิดสาขา" autoFocus />
            </label>
            <div className="sa-buttons">
              <button type="button" className="secondary" onClick={() => setRemoval(null)} disabled={removing}>ยกเลิก</button>
              <button type="submit" className="primary" disabled={removing}>{removing ? "กำลังลบ..." : "ยืนยันลบ"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="sa-section" aria-label="สรุปตรวจนับรายวัน">
        <div className="sa-section-head">
          <div>
            <h2>สรุปตรวจนับรายวัน · 7 วันล่าสุด</h2>
            <p>ยอดต่อวัน = ผลรวม &quot;ตรวจนับทั้งหมด&quot; ของทุกเอกสารในวันนั้น · เฉลี่ยต่อวัน = ผลรวมทุกวัน ÷ จำนวนวัน</p>
          </div>
          <label className="sa-inline">
            หารด้วย
            <select value={avgMode} onChange={(event) => setAvgMode(event.target.value)}>
              <option value="active">เฉพาะวันที่มีการตรวจนับ</option>
              <option value="calendar">ทุกวันตามปฏิทิน</option>
            </select>
          </label>
        </div>
        <div className="sa-table-wrap">
          <table className="sa-table sa-table-daily" aria-label="สรุปตรวจนับรายวัน">
            <thead>
              <tr>
                <th scope="col">วันที่</th>
                <th scope="col" className="is-num">เอกสาร</th>
                <th scope="col" className="is-num">ตรวจนับทั้งหมด</th>
                <th scope="col" className="is-num">ตรง</th>
                <th scope="col" className="is-num">ไม่ตรง</th>
                <th scope="col" className="is-num">ความแม่นยำ</th>
              </tr>
            </thead>
            <tbody>
              {daily.days.map((day) => (
                <tr key={day.date} className={`${day.date === date ? "is-today" : ""}${day.active ? "" : " is-empty"}`.trim()}>
                  <td><b>{thaiDateLabel(day.date)}{day.date === today ? " (วันนี้)" : ""}</b></td>
                  <td className="is-num">{day.active ? fmt(day.docs) : "—"}</td>
                  <td className="is-num is-strong">{day.active ? fmt(day.total) : "ไม่มีการตรวจนับ"}</td>
                  <td className="is-num">{day.active ? fmt(day.match) : "—"}</td>
                  <td className="is-num">{day.active ? fmt(day.mismatch) : "—"}</td>
                  <td className="is-num">{day.active ? accuracyText(day) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">รวม 7 วัน</th>
                <td className="is-num">{fmt(daily.totals.docs)}</td>
                <td className="is-num">{fmt(daily.totals.total)}</td>
                <td className="is-num is-match">{fmt(daily.totals.match)}</td>
                <td className="is-num is-warn">{fmt(daily.totals.mismatch)}</td>
                <td className="is-num">{accuracyText(daily.totals)}</td>
              </tr>
              <tr className="sa-avg">
                <th scope="row">เฉลี่ยต่อวัน (จำนวนรายการ · {basisText})</th>
                <td className="is-num">{one(daily.avg.docs)}</td>
                <td className="is-num is-strong">{one(daily.avg.total)}</td>
                <td className="is-num">{one(daily.avg.match)}</td>
                <td className="is-num">{one(daily.avg.mismatch)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

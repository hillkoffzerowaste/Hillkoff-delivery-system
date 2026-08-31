"use client";

import { useEffect, useMemo, useState } from "react";
import { getDefaultTrackingCode, OUTSTATION_LABELS_PER_PAGE, replaceOrderLabelItems, validateLabelDraft } from "../../lib/outstationLabels";
import OutstationLabelPreview from "./OutstationLabelPreview";

const CARRIERS = ["Kerry", "Flash", "Nim Express", "NTC", "เมล์เขียว", "นครชัยทัวร์", "นครชัยแอร์", "เปรมประชา", "ศรีขนส่ง", "อื่นๆ"];

function linesToText(lines) {
  return (Array.isArray(lines) ? lines : []).join("\n");
}

function textToLines(value, maxLines) {
  return String(value || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, maxLines);
}

async function responseData(response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || `HTTP ${response.status}`);
  return json.data;
}

function InputField({ label, children }) {
  return <label className="outstation-label-field"><b>{label}</b>{children}</label>;
}

export default function OutstationLabelPrintDialog({ initialItems = [], initialJobId = "", apiFetch, onClose, onPrinted }) {
  const [items, setItems] = useState(() => initialItems.map(item => ({ ...item })));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [recipientHistory, setRecipientHistory] = useState([]);
  const [recipientHistoryCustomerId, setRecipientHistoryCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState(initialJobId);
  const [requestKey, setRequestKey] = useState("");
  const isReprint = Boolean(jobId);
  const current = items[selectedIndex] || items[0] || null;

  useEffect(() => {
    if (!apiFetch) return;
    let cancelled = false;
    apiFetch("/api/outstation-labels/settings")
      .then(responseData)
      .then(sender => {
        if (cancelled) return;
        setItems(previous => previous.map(item => ({ ...item, senderName: sender.name, senderAddressLines: sender.addressLines })));
      })
      .catch(error => { if (!cancelled) setStatus(`โหลดผู้ส่งเริ่มต้นไม่สำเร็จ: ${error.message}`); });
    return () => { cancelled = true; };
  }, [apiFetch]);

  useEffect(() => {
    if (!apiFetch || !current?.customerId) return;
    let cancelled = false;
    apiFetch(`/api/outstation-labels/recipients?customerId=${encodeURIComponent(current.customerId)}`)
      .then(responseData)
      .then(data => {
        if (cancelled) return;
        setRecipientHistory(Array.isArray(data) ? data : []);
        setRecipientHistoryCustomerId(current.customerId);
      })
      .catch(() => {
        if (cancelled) return;
        setRecipientHistory([]);
      });
    return () => { cancelled = true; };
  }, [apiFetch, current?.customerId]);

  const summary = useMemo(() => ({
    orderCount: new Set(items.map(item => item.orderId)).size,
    labelCount: items.length,
    pageCount: Math.ceil(items.length / OUTSTATION_LABELS_PER_PAGE)
  }), [items]);
  const visibleRecipientHistory = recipientHistoryCustomerId === current?.customerId ? recipientHistory : [];
  const currentOrderBoxTotal = items.filter(item => item.orderId === current?.orderId).length;

  function updateCurrent(patch) {
    setItems(previous => previous.map((item, index) => index === selectedIndex ? { ...item, ...patch } : item));
    setJobId("");
    setRequestKey("");
  }

  function updateSender(patch) {
    setItems(previous => previous.map(item => ({ ...item, ...patch })));
    setJobId("");
    setRequestKey("");
  }

  function applyRecipientToOrder(patch) {
    if (!current) return;
    setItems(previous => previous.map(item => item.orderId === current.orderId ? { ...item, ...patch } : item));
    setJobId("");
    setRequestKey("");
  }

  function updateOrderBoxTotal(value) {
    if (!current) return;
    const total = Math.max(1, Math.min(10_000, Math.trunc(Number(value || 1))));
    const nextItems = replaceOrderLabelItems(items, current.orderId, total);
    setItems(nextItems);
    setSelectedIndex(Math.max(0, nextItems.findIndex(item => item.orderId === current.orderId)));
    setJobId("");
    setRequestKey("");
  }

  async function saveSenderDefault() {
    if (!apiFetch || !current) return;
    setBusy(true);
    setStatus("");
    try {
      await responseData(await apiFetch("/api/outstation-labels/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: { name: current.senderName, addressLines: current.senderAddressLines } })
      }));
      setStatus("บันทึกข้อมูลผู้ส่งเริ่มต้นแล้ว");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  async function saveRecipientHistory() {
    if (!apiFetch || !current?.customerId) return setStatus("ออเดอร์นี้ไม่มีรหัสลูกค้าสำหรับบันทึกประวัติ");
    setBusy(true);
    setStatus("");
    try {
      const saved = await responseData(await apiFetch("/api/outstation-labels/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: {
          customerId: current.customerId,
          recipientName: current.recipientName,
          recipientAddressLines: current.recipientAddressLines,
          recipientPhone: current.recipientPhone
        } })
      }));
      setRecipientHistory(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      setStatus("บันทึกชื่อและที่อยู่ผู้รับไว้ใช้ครั้งต่อไปแล้ว");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  function openPreview() {
    const missingSenderIndex = items.findIndex(item => !String(item.senderName || "").trim() || !(item.senderAddressLines || []).some(line => String(line || "").trim()));
    if (missingSenderIndex >= 0) {
      setSelectedIndex(missingSenderIndex);
      setStatus(`ใบที่ ${missingSenderIndex + 1} ยังขาดชื่อหรือที่อยู่ผู้ส่ง`);
      return;
    }
    const invalidIndex = items.findIndex(item => !validateLabelDraft(item).ok);
    if (invalidIndex >= 0) {
      setSelectedIndex(invalidIndex);
      setStatus(`ใบที่ ${invalidIndex + 1} ยังขาดชื่อผู้รับ ที่อยู่ หรือบริษัทขนส่ง`);
      return;
    }
    setStatus("");
    setShowPreview(true);
  }

  async function printLabels() {
    if (!apiFetch || !items.length) return;
    setBusy(true);
    setStatus("");
    try {
      let resolvedJobId = jobId;
      const wasExistingJob = Boolean(resolvedJobId);
      if (!resolvedJobId) {
        const resolvedRequestKey = requestKey || `labels-${globalThis.crypto.randomUUID()}`;
        if (!requestKey) setRequestKey(resolvedRequestKey);
        const job = await responseData(await apiFetch("/api/outstation-labels/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: resolvedRequestKey, items })
        }));
        resolvedJobId = job.id;
        setJobId(job.id);
      }
      window.print();
      await responseData(await apiFetch("/api/outstation-labels/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          wasExistingJob
            ? { jobId: resolvedJobId, status: "reprinted", reason: "พิมพ์ซ้ำจากประวัติการพิมพ์" }
            : { jobId: resolvedJobId, status: "printed", reason: "" }
        )
      }));
      setStatus(wasExistingJob ? "บันทึกการพิมพ์ซ้ำแล้ว" : "บันทึกประวัติการพิมพ์แล้ว");
      onPrinted?.(resolvedJobId);
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  }

  if (!current) return null;

  return (
    <div className="modal-overlay outstation-label-modal-overlay" role="dialog" aria-modal="true" aria-label="จัดทำใบปะหน้าต่างจังหวัด">
      <div className="modal outstation-label-modal">
        <div className="panel-head no-print">
          <div><h2>จัดทำใบปะหน้าต่างจังหวัด</h2><span>{isReprint && "🔁 พิมพ์ซ้ำจากประวัติ · "}{summary.orderCount} ออเดอร์ · {summary.labelCount} กล่อง · {summary.pageCount} หน้า A4</span></div>
          <button type="button" className="secondary" onClick={onClose}>ปิด</button>
        </div>

        {!showPreview ? (
          <div className="outstation-label-editor no-print">
            <aside className="outstation-label-item-list">
              {items.map((item, index) => (
                <button type="button" key={`${item.orderId}-${item.boxIndex}`} className={index === selectedIndex ? "active" : ""} onClick={() => setSelectedIndex(index)}>
                  <b>{item.recipientName || "ไม่ระบุชื่อผู้รับ"}</b><span>กล่อง {item.boxLabel}</span>
                </button>
              ))}
            </aside>
            <div className="outstation-label-form">
              <section>
                <h3>ข้อมูลผู้ส่ง</h3>
                <InputField label="ชื่อผู้ส่ง"><input value={current.senderName || ""} onChange={event => updateSender({ senderName: event.target.value })} /></InputField>
                <InputField label="ที่อยู่ผู้ส่ง"><textarea rows={3} value={linesToText(current.senderAddressLines)} onChange={event => updateSender({ senderAddressLines: textToLines(event.target.value, 3) })} /></InputField>
                <button type="button" className="secondary" disabled={busy} onClick={saveSenderDefault}>บันทึกเป็นผู้ส่งเริ่มต้น</button>
              </section>

              <section>
                <h3>ข้อมูลผู้รับ</h3>
                <InputField label="ประวัติชื่อ/ที่อยู่">
                  <select
                    defaultValue=""
                    disabled={visibleRecipientHistory.length === 0}
                    onChange={event => {
                      const record = visibleRecipientHistory.find(item => item.id === event.target.value);
                      if (record) applyRecipientToOrder({ recipientName: record.recipientName, recipientAddressLines: record.recipientAddressLines, recipientPhone: record.recipientPhone });
                    }}
                  >
                    <option value="">{visibleRecipientHistory.length > 0 ? "เลือกข้อมูลเดิม" : "ยังไม่มีที่อยู่บันทึกไว้"}</option>
                    {visibleRecipientHistory.map(record => <option key={record.id} value={record.id}>{record.recipientName} · {(record.recipientAddressLines || []).join(" ")}</option>)}
                  </select>
                </InputField>
                <InputField label="ชื่อผู้รับ"><input value={current.recipientName || ""} onChange={event => updateCurrent({ recipientName: event.target.value })} /></InputField>
                <InputField label="ที่อยู่ผู้รับ 3–4 บรรทัด"><textarea rows={4} value={linesToText(current.recipientAddressLines)} onChange={event => updateCurrent({ recipientAddressLines: textToLines(event.target.value, 4) })} /></InputField>
                <InputField label="โทรศัพท์"><input value={current.recipientPhone || ""} onChange={event => updateCurrent({ recipientPhone: event.target.value })} /></InputField>
                <div className="outstation-label-inline-actions"><button type="button" className="secondary" onClick={() => applyRecipientToOrder({ recipientName: current.recipientName, recipientAddressLines: current.recipientAddressLines, recipientPhone: current.recipientPhone })}>ใช้กับทุกกล่องของออเดอร์นี้</button><button type="button" className="secondary" disabled={busy} onClick={saveRecipientHistory}>บันทึกไว้ใช้ครั้งต่อไป</button></div>
              </section>

              <section>
                <h3>ข้อมูลขนส่งและ COD</h3>
                <InputField label="จำนวนกล่อง"><input type="number" min="1" max="10000" value={currentOrderBoxTotal || 1} onChange={event => updateOrderBoxTotal(event.target.value)} /></InputField>
                <InputField label="บริษัทขนส่ง"><input list="outstation-carriers" value={current.carrier || ""} onChange={event => updateCurrent({ carrier: event.target.value, trackingCode: current.trackingCode || getDefaultTrackingCode(event.target.value) })} /><datalist id="outstation-carriers">{CARRIERS.map(carrier => <option key={carrier} value={carrier} />)}</datalist></InputField>
                <InputField label="รหัสขนส่ง"><input value={current.trackingCode || ""} onChange={event => updateCurrent({ trackingCode: event.target.value })} placeholder="เว้นว่างไว้กรอกภายหลังได้" /></InputField>
                <label className="outstation-label-checkbox"><input type="checkbox" checked={Boolean(current.codEnabled)} onChange={event => updateCurrent({ codEnabled: event.target.checked })} /> มี COD</label>
                {current.codEnabled && <><InputField label="ยอด COD"><input type="number" min="0" value={current.codAmount || ""} onChange={event => updateCurrent({ codAmount: Number(event.target.value || 0) })} /></InputField><InputField label="รายละเอียด COD"><input value={current.codDetail || ""} onChange={event => updateCurrent({ codDetail: event.target.value })} /></InputField></>}
              </section>
            </div>
          </div>
        ) : <OutstationLabelPreview items={items} onEditItem={index => { setSelectedIndex(index); setShowPreview(false); }} />}

        {status && <p className="outstation-label-status no-print">{status}</p>}
        <div className="outstation-label-actions no-print">
          {showPreview ? <><button type="button" className="secondary" onClick={() => setShowPreview(false)}>กลับไปแก้ไข</button><button type="button" className="primary" disabled={busy} onClick={printLabels}>{busy ? "กำลังเตรียมพิมพ์…" : isReprint ? "พิมพ์ซ้ำ" : "พิมพ์ใบปะหน้า"}</button></> : <><button type="button" className="secondary" onClick={onClose}>ยกเลิก</button><button type="button" className="primary" onClick={openPreview}>ดูตัวอย่างก่อนพิมพ์</button></>}
        </div>
      </div>
    </div>
  );
}

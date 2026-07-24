"use client";

import { useEffect, useId, useRef, useState } from "react";

async function responseData(response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error || `HTTP ${response.status}`);
  return json.data;
}

export default function OutstationQrScannerDialog({ apiFetch, onClose, onScanned }) {
  const cameraId = `outstation-qr-camera-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const scannerRef = useRef(null);
  const lastPayloadRef = useRef({ value: "", at: 0 });
  const [manualValue, setManualValue] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function stopCamera() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch {}
    try { await scanner.clear(); } catch {}
    setCameraActive(false);
  }

  useEffect(() => () => { stopCamera(); }, []);

  async function submitPayload(rawValue) {
    const qrPayload = String(rawValue || "").trim();
    if (!qrPayload || busy) return;
    const now = Date.now();
    if (lastPayloadRef.current.value === qrPayload && now - lastPayloadRef.current.at < 1400) return;
    lastPayloadRef.current = { value: qrPayload, at: now };
    setBusy(true);
    setStatus("");
    try {
      const data = await responseData(await apiFetch("/api/outstation-dispatch/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrPayload })
      }));
      setManualValue("");
      setStatus(data.duplicate
        ? `${data.order.customerName || data.order.id} สแกนแล้ว · ${data.scannedCount}/${data.expectedCount} กล่อง`
        : data.complete
          ? `${data.order.customerName || data.order.id} ส่งสำเร็จ · ${data.scannedCount}/${data.expectedCount} กล่อง`
          : `${data.order.customerName || data.order.id} · ${data.scannedCount}/${data.expectedCount} กล่อง`);
      onScanned?.(data.order);
    } catch (error) {
      setStatus(`สแกนไม่สำเร็จ: ${error.message}`);
    } finally { setBusy(false); }
  }

  async function startCamera() {
    if (cameraActive || busy) return;
    setStatus("");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(cameraId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 240, height: 240 } }, decodedText => submitPayload(decodedText), () => {});
      setCameraActive(true);
    } catch (error) {
      await stopCamera();
      setStatus(`เปิดกล้องไม่สำเร็จ: ${error?.message || "กรุณาอนุญาตใช้กล้อง หรือกรอกรหัส QR"}`);
    }
  }

  return (
    <div className="modal-overlay outstation-qr-scanner-overlay" role="dialog" aria-modal="true" aria-label="สแกนส่งมอบขนส่ง">
      <div className="modal outstation-qr-scanner-dialog">
        <div className="panel-head"><div><h2>สแกนส่งมอบขนส่ง</h2><span>สแกนได้ทุกกล่อง ระบบค้นหาออเดอร์ให้อัตโนมัติ</span></div><button type="button" className="secondary" onClick={async () => { await stopCamera(); onClose?.(); }}>ปิด</button></div>
        <div id={cameraId} className="outstation-qr-camera" />
        <div className="outstation-qr-scanner-actions">
          <button type="button" className="primary" disabled={cameraActive || busy} onClick={startCamera}>เปิดกล้องสแกน QR</button>
          {cameraActive && <button type="button" className="secondary" onClick={stopCamera}>หยุดกล้อง</button>}
        </div>
        <form className="outstation-qr-manual" onSubmit={event => { event.preventDefault(); submitPayload(manualValue); }}>
          <label><b>กรอกรหัส QR</b><input value={manualValue} onChange={event => setManualValue(event.target.value)} placeholder="HKO1|DO-...|1|3" autoComplete="off" /></label>
          <button type="submit" className="secondary" disabled={busy || !manualValue.trim()}>บันทึกการสแกน</button>
        </form>
        {status && <p className="outstation-qr-scan-status" aria-live="polite">{status}</p>}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Database,
  Download,
  Fuel,
  Gauge,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Users
} from "lucide-react";
import { canCorrectVehicleOdometer } from "../../lib/vehicleOdometerCorrection";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
const emptyVehicle = { id: "", assetCode: "", plate: "", vehicleType: "", brand: "", model: "", responsiblePerson: "", department: "", active: true };
const emptyDriver = { name: "", phone: "", phoneDigits: "", driverId: "", active: true };
const emptyReport = { rows: [], summary: {}, dataQuality: {}, vehicles: [] };
const REPORT_VIEWS = [
  { key: "summary", label: "สรุป", description: "ภาพรวมการใช้รถ", Icon: Gauge },
  { key: "daily", label: "รายวัน", description: "เลขไมล์และออเดอร์แต่ละวัน", Icon: CalendarDays },
  { key: "monthly", label: "รายเดือน", description: "สรุประยะทางและค่าใช้จ่าย", Icon: ChartNoAxesCombined },
  { key: "fuel", label: "น้ำมัน", description: "รายการและยอดเติมน้ำมัน", Icon: Fuel },
  { key: "master", label: "จัดการข้อมูล", description: "รถ ผู้ครอบครอง และคนขับ", Icon: Database }
];
const REPORT_VIEW_KEYS = new Set(["summary", "daily", "monthly", "fuel"]);

export default function VehicleInspectionReport({ apiFetch, role, email = "" }) {
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), vehicleId: "", driverId: "" });
  const [appliedFilters, setAppliedFilters] = useState(null);
  const [report, setReport] = useState(emptyReport);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [activeView, setActiveView] = useState("");
  const [reportLoaded, setReportLoaded] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [driverForm, setDriverForm] = useState(emptyDriver);
  const [correction, setCorrection] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const canCorrect = canCorrectVehicleOdometer({ role, email });

  async function loadOptions() {
    try {
      const [vehicleRes, driverRes] = await Promise.all([
        apiFetch("/api/vehicle-master?includeInactive=true"),
        apiFetch("/api/driver-master")
      ]);
      const [vehicleJson, driverJson] = await Promise.all([vehicleRes.json(), driverRes.json()]);
      if (vehicleRes.ok && vehicleJson.ok) setVehicles(vehicleJson.data || []);
      if (driverRes.ok && driverJson.ok) setDrivers(driverJson.data || []);
    } catch {
      setStatus("❌ โหลดตัวเลือกรถและคนขับไม่สำเร็จ");
    }
  }

  async function selectView(key) {
    setActiveView(key);
    setReportLoaded(false);
    setAppliedFilters(null);
    setSelected([]);
    setStatus("");
    await loadOptions();
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setReportLoaded(false);
    setAppliedFilters(null);
    setSelected([]);
  }

  async function loadReport(filterOverride = filters) {
    if (!filterOverride.from || !filterOverride.to) return setStatus("❌ กรุณาเลือกช่วงวันที่ให้ครบ");
    if (filterOverride.from > filterOverride.to) return setStatus("❌ วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด");
    setLoading(true);
    setStatus("");
    try {
      const response = await apiFetch("/api/vehicle-report/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filterOverride)
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "โหลดรายงานไม่สำเร็จ");
      setReport(json.data || emptyReport);
      setVehicles(json.data?.vehicles || vehicles);
      setAppliedFilters({ ...filterOverride });
      setReportLoaded(true);
      setSelected([]);
    } catch (error) {
      setReportLoaded(false);
      setStatus(`❌ ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }

  const allSelected = report.rows.length > 0 && report.rows.every((row) => selected.includes(row.id));
  const monthly = useMemo(() => {
    const map = new Map();
    for (const row of report.rows) {
      const month = String(row.serviceDate || "").slice(0, 7);
      const item = map.get(month) || { month, distanceKm: 0, fuelLiters: 0, fuelAmount: 0, deliveredOrders: 0, cityOrders: 0, outstationOrders: 0 };
      for (const field of ["distanceKm", "fuelLiters", "fuelAmount", "deliveredOrders", "cityOrders", "outstationOrders"]) item[field] += Number(row[field]) || 0;
      map.set(month, item);
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [report.rows]);

  async function exportCsv(selectedOnly) {
    if (!appliedFilters) return;
    const response = await apiFetch("/api/vehicle-report/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...appliedFilters, selectedIds: selectedOnly ? selected : [] })
    });
    if (!response.ok) return setStatus("❌ ส่งออกรายงานไม่สำเร็จ");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vehicle-report-${appliedFilters.from}-${appliedFilters.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveMaster(type) {
    const isVehicle = type === "vehicle";
    const body = isVehicle ? vehicleForm : driverForm;
    const response = await apiFetch(isVehicle ? "/api/vehicle-master" : "/api/driver-master", {
      method: body.id || body.phoneDigits ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    setStatus(response.ok && json.ok ? "✅ บันทึกข้อมูลแล้ว" : `❌ ${json.error || "บันทึกไม่สำเร็จ"}`);
    if (response.ok) {
      setVehicleForm(emptyVehicle);
      setDriverForm(emptyDriver);
      await loadOptions();
    }
  }

  async function disableMaster(type, item) {
    if (!globalThis.confirm?.("ยืนยันปิดใช้งานรายการนี้? ประวัติเดิมจะยังคงอยู่")) return;
    const response = await apiFetch(type === "vehicle" ? "/api/vehicle-master" : "/api/driver-master", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type === "vehicle" ? { id: item.id } : { phoneDigits: item.phoneDigits || item.id })
    });
    setStatus(response.ok ? "✅ ปิดใช้งานแล้ว" : "❌ ปิดใช้งานไม่สำเร็จ");
    if (response.ok) await loadOptions();
  }

  function openCorrection(row, eventType) {
    const isStart = eventType === "start";
    const eventId = isStart ? row.odometerStartEventId : row.odometerEndEventId;
    const odometer = isStart ? row.odometerStart : row.odometerEnd;
    if (!eventId) return;
    setCorrection({ eventId, eventType, odometer: String(odometer ?? ""), reason: "", row });
  }

  async function saveCorrection() {
    if (!correction) return;
    setLoading(true);
    setStatus("");
    try {
      const response = await apiFetch("/api/vehicle-report/odometer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: correction.eventId,
          odometer: Number(correction.odometer),
          reason: correction.reason
        })
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "แก้เลขไมล์ไม่สำเร็จ");
      setCorrection(null);
      await loadReport(appliedFilters || filters);
      setStatus("✅ แก้เลขไมล์และบันทึกประวัติแล้ว");
    } catch (error) {
      setStatus(`❌ ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }

  const summaryCards = [
    ["รถที่มีข้อมูล", report.summary.vehicles || 0, Truck],
    ["ระยะทางรวม", `${Number(report.summary.distanceKm || 0).toLocaleString()} กม.`, Gauge],
    ["ออเดอร์รวม", report.summary.deliveredOrders || 0, Users],
    ["น้ำมันรวม", `${Number(report.summary.fuelLiters || 0).toLocaleString()} ลิตร`, Fuel]
  ];

  const renderRows = (allowCorrection) => (
    <section className="panel">
      <div className="panel-head">
        <h2>{activeView === "fuel" ? "การเติมน้ำมัน" : "การใช้รถรายวัน"}</h2>
        <span>{report.rows.length} รายการ</span>
      </div>
      <div className="report-actions">
        <button className="secondary" disabled={!selected.length} onClick={() => exportCsv(true)}><Download size={16} /> ส่งออกที่เลือก ({selected.length})</button>
        <button className="primary" onClick={() => exportCsv(false)}><Download size={16} /> ส่งออกทั้งหมดตามตัวกรอง</button>
      </div>
      {report.rows.length === 0 ? <p className="muted">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p> : <div className="vehicle-report-table">
        <div className="vehicle-report-row vehicle-report-head"><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? report.rows.map((row) => row.id) : [])} /><span>วันที่/รถ</span><span>คนขับ</span><span>เลขไมล์</span><span>ระยะทาง</span><span>ออเดอร์</span><span>น้ำมัน</span><span>ตรวจรถ</span></div>
        {report.rows.map((row) => <div className="vehicle-report-row" key={row.id}>
          <input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected((items) => event.target.checked ? [...new Set([...items, row.id])] : items.filter((id) => id !== row.id))} />
          <span><b>{row.serviceDate}</b><small>{row.plate || row.vehicleId}</small></span>
          <span>{row.driverName || row.driverId || "-"}</span>
          <span>
            <b>{row.odometerStart ?? "-"} → {row.odometerEnd ?? "-"}</b>
            {allowCorrection && canCorrect && <small className="odometer-edit-actions">
              {row.odometerStartEventId && <button type="button" onClick={() => openCorrection(row, "start")}>แก้เลขเริ่ม</button>}
              {row.odometerEndEventId && <button type="button" onClick={() => openCorrection(row, "end")}>แก้เลขสิ้นสุด</button>}
            </small>}
          </span>
          <span>{Number(row.distanceKm || 0).toLocaleString()} กม.</span>
          <span>{row.deliveredOrders} ({row.cityOrders}/{row.outstationOrders})</span>
          <span>{row.fuelLiters} ลิตร<br />{Number(row.fuelAmount || 0).toLocaleString()} บาท</span>
          <span>{row.inspectionStatus === "completed" ? "ตรวจแล้ว" : "ยังไม่ตรวจ"}{row.autoClosed && <small>ปิดงานอัตโนมัติ</small>}</span>
        </div>)}
      </div>}
    </section>
  );

  return <div className="vehicle-report-workspace">
    <section className="panel vehicle-report-hero">
      <div><h2>รายงานการตรวจรถและการใช้รถ</h2><p>เลือกดูข้อมูลเป็นหน้า กำหนดช่วงเวลา แล้วจึงแสดงรายละเอียดที่ต้องการ</p></div>
    </section>

    <nav className="vehicle-report-tabs" role="tablist" aria-label="เมนูรายงานตรวจรถ">
      {REPORT_VIEWS.map(({ key, label, description, Icon }) => <button
        type="button"
        role="tab"
        aria-selected={activeView === key}
        key={key}
        className={`vehicle-report-menu-card ${activeView === key ? "is-active" : "is-inactive"}`}
        onClick={() => selectView(key)}
      >
        <Icon size={23} />
        <b>{label}</b>
        <span>{description}</span>
      </button>)}
    </nav>

    {!activeView && <section className="panel vehicle-report-empty"><Gauge size={30} /><h3>เลือกเมนูรายงาน</h3><p>กดการ์ดด้านบนเพื่อเลือกหน้าที่ต้องการดู</p></section>}

    {REPORT_VIEW_KEYS.has(activeView) && <>
      <section className="panel vehicle-report-filter">
        <label>ตั้งแต่วันที่<input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
        <label>ถึงวันที่<input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
        <label>รถ<select value={filters.vehicleId} onChange={(event) => updateFilter("vehicleId", event.target.value)}><option value="">ทุกคัน</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.assetCode}</option>)}</select></label>
        <label>คนขับ<select value={filters.driverId} onChange={(event) => updateFilter("driverId", event.target.value)}><option value="">ทุกคน</option>{drivers.map((driver) => <option key={driver.driverId || driver.id} value={driver.driverId}>{driver.name}</option>)}</select></label>
        <button type="button" className="primary vehicle-report-apply" disabled={loading} onClick={() => loadReport()}>{loading ? "กำลังโหลด..." : "แสดงรายงาน"}</button>
      </section>
      {!reportLoaded && <section className="panel vehicle-report-empty"><CalendarDays size={28} /><h3>เลือกช่วงเวลาแล้วกดแสดงรายงาน</h3><p>ระบบจะโหลดเฉพาะข้อมูลตามตัวกรองนี้</p></section>}
    </>}

    {reportLoaded && activeView === "summary" && <>
      <section className="analytics-cards vehicle-report-cards">{summaryCards.map(([label, value, Icon]) => <div key={label}><Icon size={20} /><span>{label}</span><b>{value}</b></div>)}</section>
      <section className="panel vehicle-data-quality"><b>คุณภาพการเชื่อมข้อมูลย้อนหลัง</b><span>กำกวม {report.dataQuality.ambiguousOrders || 0} ออเดอร์ · ไม่พบการใช้รถ {report.dataQuality.unallocatedOrders || 0} ออเดอร์</span><small>ระบบไม่เดาทะเบียนรถให้กับข้อมูลที่ยืนยันไม่ได้</small></section>
      {renderRows(true)}
    </>}
    {reportLoaded && activeView === "daily" && renderRows(true)}
    {reportLoaded && activeView === "fuel" && renderRows(false)}
    {reportLoaded && activeView === "monthly" && <section className="panel">
      <div className="panel-head"><h2>สรุปรอบเดือน</h2><span>{monthly.length} เดือน</span></div>
      {monthly.length === 0 ? <p className="muted">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p> : monthly.map((row) => <div className="driver-load-row" key={row.month}><div><b>{row.month}</b><span>ตัวเมือง {row.cityOrders} · ต่างจังหวัด {row.outstationOrders}</span></div><strong>{row.deliveredOrders} ออเดอร์ · {row.distanceKm.toLocaleString()} กม. · {row.fuelAmount.toLocaleString()} บาท</strong></div>)}
    </section>}

    {activeView === "master" && <div className="vehicle-master-grid">
      <section className="panel">
        <div className="panel-head"><h2>รถและผู้ครอบครองทรัพย์สิน</h2><span>{vehicles.length} คัน</span></div>
        <div className="form-grid two"><input placeholder="รหัสทรัพย์สิน" value={vehicleForm.assetCode} onChange={(event) => setVehicleForm((value) => ({ ...value, id: event.target.value, assetCode: event.target.value }))} /><input placeholder="ทะเบียนรถ" value={vehicleForm.plate} onChange={(event) => setVehicleForm((value) => ({ ...value, plate: event.target.value }))} /><input placeholder="ยี่ห้อ" value={vehicleForm.brand} onChange={(event) => setVehicleForm((value) => ({ ...value, brand: event.target.value }))} /><input placeholder="รุ่น" value={vehicleForm.model} onChange={(event) => setVehicleForm((value) => ({ ...value, model: event.target.value }))} /><input placeholder="ผู้ครอบครองทรัพย์สิน" value={vehicleForm.responsiblePerson} onChange={(event) => setVehicleForm((value) => ({ ...value, responsiblePerson: event.target.value }))} /><input placeholder="หน่วยงาน" value={vehicleForm.department} onChange={(event) => setVehicleForm((value) => ({ ...value, department: event.target.value }))} /></div>
        <button className="primary" onClick={() => saveMaster("vehicle")}><Plus size={16} /> บันทึกรถ</button>
        {vehicles.map((vehicle) => <div className="driver-load-row" key={vehicle.id}><div><b>{vehicle.plate} · {vehicle.assetCode}</b><span>{vehicle.responsiblePerson || "-"} · {vehicle.active === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></div><div><button className="secondary" onClick={() => setVehicleForm(vehicle)}><Pencil size={14} /></button> <button className="secondary danger" onClick={() => disableMaster("vehicle", vehicle)}><Trash2 size={14} /></button></div></div>)}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>คนขับ</h2><span>{drivers.length} คน</span></div>
        <div className="form-grid two"><input placeholder="ชื่อคนขับ" value={driverForm.name} onChange={(event) => setDriverForm((value) => ({ ...value, name: event.target.value }))} /><input placeholder="เบอร์โทร" value={driverForm.phone} onChange={(event) => setDriverForm((value) => ({ ...value, phone: event.target.value, phoneDigits: event.target.value.replace(/\D/g, "") }))} /></div>
        <button className="primary" onClick={() => saveMaster("driver")}><Plus size={16} /> บันทึกคนขับ</button>
        {drivers.map((driver) => <div className="driver-load-row" key={driver.id}><div><b>{driver.name}</b><span>{driver.phone || driver.phoneDigits} · {driver.active === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></div><div><button className="secondary" onClick={() => setDriverForm(driver)}><Pencil size={14} /></button> <button className="secondary danger" onClick={() => disableMaster("driver", driver)}><Trash2 size={14} /></button></div></div>)}
      </section>
    </div>}

    {correction && <div className="vehicle-odometer-modal" role="presentation">
      <section className="panel" role="dialog" aria-modal="true" aria-labelledby="odometer-correction-title">
        <div className="panel-head"><h2 id="odometer-correction-title">แก้เลขไมล์{correction.eventType === "start" ? "เริ่มต้น" : "สิ้นสุด"}</h2><span>{correction.row.serviceDate}</span></div>
        <p><b>{correction.row.plate || correction.row.vehicleId}</b> · {correction.row.driverName || correction.row.driverId || "-"}</p>
        <label className="field-label">เลขไมล์ที่ถูกต้อง *</label>
        <input type="number" min="1" max="10000000" value={correction.odometer} onChange={(event) => setCorrection((value) => ({ ...value, odometer: event.target.value }))} />
        <label className="field-label">เหตุผลที่แก้ไข *</label>
        <textarea rows={3} value={correction.reason} onChange={(event) => setCorrection((value) => ({ ...value, reason: event.target.value }))} placeholder="ระบุสาเหตุที่เลขไมล์เดิมไม่ถูกต้อง" />
        <div className="report-actions"><button className="secondary" onClick={() => setCorrection(null)}>ยกเลิก</button><button className="primary" disabled={loading || !correction.reason.trim()} onClick={saveCorrection}>บันทึกการแก้ไข</button></div>
      </section>
    </div>}

    {status && <p className="muted" role="status">{status}</p>}
    <small className="muted">สิทธิ์ปัจจุบัน: {role}</small>
  </div>;
}

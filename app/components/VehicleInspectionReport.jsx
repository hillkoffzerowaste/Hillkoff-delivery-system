"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Fuel, Gauge, Pencil, Plus, RefreshCw, Trash2, Truck, Users } from "lucide-react";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
const emptyVehicle = { id: "", assetCode: "", plate: "", vehicleType: "", brand: "", model: "", responsiblePerson: "", department: "", active: true };
const emptyDriver = { name: "", phone: "", phoneDigits: "", driverId: "", active: true };

export default function VehicleInspectionReport({ apiFetch, role }) {
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), vehicleId: "", driverId: "" });
  const [report, setReport] = useState({ rows: [], summary: {}, dataQuality: {}, vehicles: [] });
  const [drivers, setDrivers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [tab, setTab] = useState("summary");
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [driverForm, setDriverForm] = useState(emptyDriver);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus("");
    try {
      const [reportRes, driverRes] = await Promise.all([
        apiFetch("/api/vehicle-report/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(filters) }),
        apiFetch("/api/driver-master")
      ]);
      const reportJson = await reportRes.json();
      const driverJson = await driverRes.json();
      if (!reportRes.ok || !reportJson.ok) throw new Error(reportJson.error || "โหลดรายงานไม่สำเร็จ");
      setReport(reportJson.data);
      if (driverJson.ok) setDrivers(driverJson.data || []);
    } catch (error) {
      setStatus(`❌ ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filters]);

  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);
  const allSelected = report.rows.length > 0 && report.rows.every((row) => selected.includes(row.id));
  const monthly = useMemo(() => {
    const map = new Map();
    for (const row of report.rows) {
      const month = row.serviceDate.slice(0, 7);
      const item = map.get(month) || { month, distanceKm: 0, fuelLiters: 0, fuelAmount: 0, deliveredOrders: 0, cityOrders: 0, outstationOrders: 0 };
      for (const field of ["distanceKm", "fuelLiters", "fuelAmount", "deliveredOrders", "cityOrders", "outstationOrders"]) item[field] += Number(row[field]) || 0;
      map.set(month, item);
    }
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [report.rows]);

  async function exportCsv(selectedOnly) {
    const res = await apiFetch("/api/vehicle-report/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...filters, selectedIds: selectedOnly ? selected : [] })
    });
    if (!res.ok) return setStatus("❌ ส่งออกรายงานไม่สำเร็จ");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `vehicle-report-${filters.from}-${filters.to}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  async function saveMaster(type) {
    const isVehicle = type === "vehicle";
    const body = isVehicle ? vehicleForm : driverForm;
    const res = await apiFetch(isVehicle ? "/api/vehicle-master" : "/api/driver-master", {
      method: body.id || body.phoneDigits ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const json = await res.json();
    setStatus(res.ok && json.ok ? "✅ บันทึกข้อมูลแล้ว" : `❌ ${json.error || "บันทึกไม่สำเร็จ"}`);
    if (res.ok) { setVehicleForm(emptyVehicle); setDriverForm(emptyDriver); await load(); }
  }

  async function disableMaster(type, item) {
    if (!globalThis.confirm?.("ยืนยันปิดใช้งานรายการนี้? ประวัติเดิมจะยังคงอยู่")) return;
    const res = await apiFetch(type === "vehicle" ? "/api/vehicle-master" : "/api/driver-master", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type === "vehicle" ? { id: item.id } : { phoneDigits: item.phoneDigits || item.id })
    });
    setStatus(res.ok ? "✅ ปิดใช้งานแล้ว" : "❌ ปิดใช้งานไม่สำเร็จ");
    if (res.ok) await load();
  }

  const cards = [
    ["รถที่มีข้อมูล", report.summary.vehicles || 0, Truck],
    ["ระยะทางรวม", `${Number(report.summary.distanceKm || 0).toLocaleString()} กม.`, Gauge],
    ["ออเดอร์รวม", report.summary.deliveredOrders || 0, Users],
    ["น้ำมันรวม", `${Number(report.summary.fuelLiters || 0).toLocaleString()} ลิตร`, Fuel]
  ];

  return <div className="vehicle-report-workspace">
    <section className="panel vehicle-report-hero">
      <div><h2>รายงานการตรวจรถและการใช้รถ</h2><p>สรุปเลขไมล์ การใช้งานรายวัน/รายเดือน น้ำมัน คนขับ ออเดอร์ และพื้นที่จัดส่ง</p></div>
      <button className="secondary" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? "กำลังโหลด" : "รีเฟรช"}</button>
    </section>
    <section className="panel vehicle-report-filter">
      <label>ตั้งแต่วันที่<input type="date" value={filters.from} onChange={(e) => setFilters((value) => ({ ...value, from: e.target.value }))} /></label>
      <label>ถึงวันที่<input type="date" value={filters.to} onChange={(e) => setFilters((value) => ({ ...value, to: e.target.value }))} /></label>
      <label>รถ<select value={filters.vehicleId} onChange={(e) => setFilters((value) => ({ ...value, vehicleId: e.target.value }))}><option value="">ทุกคัน</option>{report.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.assetCode}</option>)}</select></label>
      <label>คนขับ<select value={filters.driverId} onChange={(e) => setFilters((value) => ({ ...value, driverId: e.target.value }))}><option value="">ทุกคน</option>{drivers.map((driver) => <option key={driver.driverId || driver.id} value={driver.driverId}>{driver.name}</option>)}</select></label>
    </section>
    <section className="analytics-cards vehicle-report-cards">{cards.map(([label, value, Icon]) => <div key={label}><Icon size={20} /><span>{label}</span><b>{value}</b></div>)}</section>
    <section className="panel vehicle-data-quality">
      <b>คุณภาพการเชื่อมข้อมูลย้อนหลัง</b>
      <span>กำกวม {report.dataQuality.ambiguousOrders || 0} ออเดอร์ · ไม่พบการใช้รถ {report.dataQuality.unallocatedOrders || 0} ออเดอร์</span>
      <small>ระบบไม่เดาทะเบียนรถให้กับข้อมูลที่ยืนยันไม่ได้</small>
    </section>
    <nav className="vehicle-report-tabs" role="tablist" aria-label="เมนูรายงานตรวจรถ">
      {["summary", "daily", "monthly", "fuel", "master"].map((key) => <button type="button" role="tab" aria-selected={tab === key} key={key} className={`report-tab ${tab === key ? "is-active" : "is-inactive"}`} onClick={() => setTab(key)}>{({ summary: "สรุป", daily: "รายวัน", monthly: "รายเดือน", fuel: "น้ำมัน", master: "จัดการข้อมูล" })[key]}</button>)}
    </nav>
    {["summary", "daily", "fuel"].includes(tab) && <section className="panel">
      <div className="panel-head"><h2>{tab === "fuel" ? "การเติมน้ำมัน" : "การใช้รถรายวัน"}</h2><span>{report.rows.length} รายการ</span></div>
      <div className="report-actions"><button className="secondary" disabled={!selected.length} onClick={() => exportCsv(true)}><Download size={16} /> ส่งออกที่เลือก ({selected.length})</button><button className="primary" onClick={() => exportCsv(false)}><Download size={16} /> ส่งออกทั้งหมดตามตัวกรอง</button></div>
      <div className="vehicle-report-table">
        <div className="vehicle-report-row vehicle-report-head"><input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? report.rows.map((row) => row.id) : [])} /><span>วันที่/รถ</span><span>คนขับ</span><span>เลขไมล์</span><span>ระยะทาง</span><span>ออเดอร์</span><span>น้ำมัน</span><span>ตรวจรถ</span></div>
        {report.rows.map((row) => <div className="vehicle-report-row" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected((items) => e.target.checked ? [...new Set([...items, row.id])] : items.filter((id) => id !== row.id))} /><span><b>{row.serviceDate}</b><small>{row.plate || row.vehicleId}</small></span><span>{row.driverName || row.driverId || "-"}</span><span>{row.odometerStart ?? "-"} → {row.odometerEnd ?? "-"}</span><span>{row.distanceKm.toLocaleString()} กม.</span><span>{row.deliveredOrders} ({row.cityOrders}/{row.outstationOrders})</span><span>{row.fuelLiters} ลิตร<br />{row.fuelAmount.toLocaleString()} บาท</span><span>{row.inspectionStatus === "completed" ? "ตรวจแล้ว" : "ยังไม่ตรวจ"}{row.autoClosed && <small>ปิดงานอัตโนมัติ</small>}</span></div>)}
      </div>
    </section>}
    {tab === "monthly" && <section className="panel"><div className="panel-head"><h2>สรุปรอบเดือน</h2><span>{monthly.length} เดือน</span></div>{monthly.map((row) => <div className="driver-load-row" key={row.month}><div><b>{row.month}</b><span>ตัวเมือง {row.cityOrders} · ต่างจังหวัด {row.outstationOrders}</span></div><strong>{row.deliveredOrders} ออเดอร์ · {row.distanceKm.toLocaleString()} กม. · {row.fuelAmount.toLocaleString()} บาท</strong></div>)}</section>}
    {tab === "master" && <div className="vehicle-master-grid">
      <section className="panel"><div className="panel-head"><h2>รถและผู้ครอบครองทรัพย์สิน</h2><span>{report.vehicles.length} คัน</span></div><div className="form-grid two"><input placeholder="รหัสทรัพย์สิน" value={vehicleForm.assetCode} onChange={(e) => setVehicleForm((v) => ({ ...v, id: e.target.value, assetCode: e.target.value }))} /><input placeholder="ทะเบียนรถ" value={vehicleForm.plate} onChange={(e) => setVehicleForm((v) => ({ ...v, plate: e.target.value }))} /><input placeholder="ยี่ห้อ" value={vehicleForm.brand} onChange={(e) => setVehicleForm((v) => ({ ...v, brand: e.target.value }))} /><input placeholder="รุ่น" value={vehicleForm.model} onChange={(e) => setVehicleForm((v) => ({ ...v, model: e.target.value }))} /><input placeholder="ผู้ครอบครองทรัพย์สิน" value={vehicleForm.responsiblePerson} onChange={(e) => setVehicleForm((v) => ({ ...v, responsiblePerson: e.target.value }))} /><input placeholder="หน่วยงาน" value={vehicleForm.department} onChange={(e) => setVehicleForm((v) => ({ ...v, department: e.target.value }))} /></div><button className="primary" onClick={() => saveMaster("vehicle")}><Plus size={16} /> บันทึกรถ</button>{report.vehicles.map((vehicle) => <div className="driver-load-row" key={vehicle.id}><div><b>{vehicle.plate} · {vehicle.assetCode}</b><span>{vehicle.responsiblePerson || "-"} · {vehicle.active === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></div><div><button className="secondary" onClick={() => setVehicleForm(vehicle)}><Pencil size={14} /></button> <button className="secondary danger" onClick={() => disableMaster("vehicle", vehicle)}><Trash2 size={14} /></button></div></div>)}</section>
      <section className="panel"><div className="panel-head"><h2>คนขับ</h2><span>{drivers.length} คน</span></div><div className="form-grid two"><input placeholder="ชื่อคนขับ" value={driverForm.name} onChange={(e) => setDriverForm((v) => ({ ...v, name: e.target.value }))} /><input placeholder="เบอร์โทร" value={driverForm.phone} onChange={(e) => setDriverForm((v) => ({ ...v, phone: e.target.value, phoneDigits: e.target.value.replace(/\D/g, "") }))} /></div><button className="primary" onClick={() => saveMaster("driver")}><Plus size={16} /> บันทึกคนขับ</button>{drivers.map((driver) => <div className="driver-load-row" key={driver.id}><div><b>{driver.name}</b><span>{driver.phone || driver.phoneDigits} · {driver.active === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></div><div><button className="secondary" onClick={() => setDriverForm(driver)}><Pencil size={14} /></button> <button className="secondary danger" onClick={() => disableMaster("driver", driver)}><Trash2 size={14} /></button></div></div>)}</section>
    </div>}
    {status && <p className="muted">{status}</p>}
    <small className="muted">สิทธิ์ปัจจุบัน: {role}</small>
  </div>;
}

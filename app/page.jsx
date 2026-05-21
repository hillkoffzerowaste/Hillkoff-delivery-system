"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FolderSync,
  MapPinned,
  MessageSquareWarning,
  Navigation,
  PackagePlus,
  Search,
  Star,
  Store,
  Truck,
  UserCheck,
  Settings
} from "lucide-react";

const STORE_KEY = "hillkoff-delivery-ops:v2";

const DRIVERS = [
  { id: "D1", name: "Somchai", plate: "ชม 2145", zone: "เมืองเชียงใหม่", phone: "081-000-1001" },
  { id: "D2", name: "Wichai", plate: "ชม 6732", zone: "สันกำแพง / ดอยสะเก็ด", phone: "081-000-1002" },
  { id: "D3", name: "Anan", plate: "ชม 8291", zone: "หางดง / สันป่าตอง", phone: "081-000-1003" },
  { id: "D4", name: "Thanawat", plate: "ชม 1187", zone: "ลำพูน / ลำปาง", phone: "081-000-1004" },
  { id: "D5", name: "Kitti", plate: "ชม 4428", zone: "แม่ริม / เชียงราย", phone: "081-000-1005" }
];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUS = ["รอคนขับรับ", "กำลังส่ง", "ส่งสำเร็จ", "ติดปัญหา"];
const statusColor = { "รอคนขับรับ": "#92400e", "กำลังส่ง": "#1d4ed8", "ส่งสำเร็จ": "#166534", "ติดปัญหา": "#b91c1c" };

const initialCustomers = [
  { id: "C001", name: "Ristr8to Lab", contact: "คุณเมย์", phone: "053-000-101", zone: "เมืองเชียงใหม่", address: "นิมมาน ซอย 3", mapUrl: "https://maps.google.com/?q=Ristr8to+Lab+Chiang+Mai", note: "รับสินค้าเช้า / มีเอกสารวางบิล" },
  { id: "C002", name: "Graph Cafe", contact: "คุณต้น", phone: "053-000-102", zone: "เมืองเชียงใหม่", address: "ช้างม่อย", mapUrl: "https://maps.google.com/?q=Graph+Cafe+Chiang+Mai", note: "โทรก่อนถึง 10 นาที" },
  { id: "C003", name: "Lamphun Coffee Hub", contact: "คุณอ้อม", phone: "053-000-201", zone: "ลำพูน", address: "เมืองลำพูน", mapUrl: "https://maps.google.com/?q=Lamphun+Coffee", note: "รับ COD และใบกำกับภาษี" },
  { id: "C004", name: "Mae Rim Garden", contact: "คุณบอย", phone: "053-000-301", zone: "แม่ริม", address: "แม่ริม", mapUrl: "https://maps.google.com/?q=Mae+Rim+Chiang+Mai", note: "จอดหน้าร้านได้" }
];

const initialOrders = [
  { id: "DO-260522-001", customerId: "C001", customerName: "Ristr8to Lab", zone: "เมืองเชียงใหม่", address: "นิมมาน ซอย 3", mapUrl: "https://maps.google.com/?q=Ristr8to+Lab+Chiang+Mai", window: "09:00-10:30", boxes: 6, cod: 3850, driverId: "", status: "รอคนขับรับ", photo: "", checkInAt: "", deliveredAt: "", complaint: "", salesNote: "เมล็ดกาแฟ + syrup", createdAt: new Date().toISOString() },
  { id: "DO-260522-002", customerId: "C002", customerName: "Graph Cafe", zone: "เมืองเชียงใหม่", address: "ช้างม่อย", mapUrl: "https://maps.google.com/?q=Graph+Cafe+Chiang+Mai", window: "10:00-12:00", boxes: 4, cod: 2600, driverId: "", status: "รอคนขับรับ", photo: "", checkInAt: "", deliveredAt: "", complaint: "", salesNote: "เก็บบิลเดิมกลับ", createdAt: new Date().toISOString() },
  { id: "DO-260522-003", customerId: "C003", customerName: "Lamphun Coffee Hub", zone: "ลำพูน", address: "เมืองลำพูน", mapUrl: "https://maps.google.com/?q=Lamphun+Coffee", window: "13:00-15:00", boxes: 12, cod: 11800, driverId: "", status: "รอคนขับรับ", photo: "", checkInAt: "", deliveredAt: "", complaint: "", salesNote: "COD เงินสด", createdAt: new Date().toISOString() }
];

function defaultState() {
  return {
    customers: initialCustomers,
    orders: initialOrders,
    google: {
      webAppUrl: "",
      sheetUrl: "https://docs.google.com/spreadsheets/",
      driveFolderUrl: "https://drive.google.com/drive/folders/",
      mapsNote: "ใช้ Google Maps link ในข้อมูลลูกค้า และเก็บรูปยืนยันเข้า Google Drive ในเฟสถัดไป"
    }
  };
}

function readState() {
  if (typeof window === "undefined") return defaultState();
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? JSON.parse(saved) : defaultState();
  } catch {
    return defaultState();
  }
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function todayText() {
  return new Date().toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

function Stat({ icon: Icon, label, value, sub, tone = "#166534" }) {
  return (
    <div className="card stat-card">
      <div className="stat-icon" style={{ color: tone, background: `${tone}17` }}><Icon size={20} /></div>
      <div>
        <div className="muted">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="small">{sub}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("sales");
  const [state, setState] = useState(defaultState);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("C001");
  const [driverId, setDriverId] = useState("D1");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [orderForm, setOrderForm] = useState({ window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
  const [syncStatus, setSyncStatus] = useState("Local mode");

  useEffect(() => setState(readState()), []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);

  const customers = state.customers;
  const orders = state.orders;
  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId) || customers[0];
  const driverOrders = orders.filter(order => order.driverId === driverId || (!order.driverId && order.status === "รอคนขับรับ"));

  const report = useMemo(() => {
    const delivered = orders.filter(order => order.status === "ส่งสำเร็จ");
    const complaints = orders.filter(order => order.complaint);
    const cod = orders.reduce((sum, order) => sum + Number(order.cod || 0), 0);
    const driverScore = DRIVERS.map(driver => {
      const jobs = orders.filter(order => order.driverId === driver.id);
      const done = jobs.filter(order => order.status === "ส่งสำเร็จ").length;
      const issues = jobs.filter(order => order.status === "ติดปัญหา" || order.complaint).length;
      const photos = jobs.filter(order => order.photo).length;
      const score = Math.max(1, Math.min(100, 70 + done * 6 + photos * 3 - issues * 12));
      return { ...driver, jobs: jobs.length, done, issues, score };
    });
    return { delivered: delivered.length, complaints, cod, driverScore };
  }, [orders]);

  const filteredCustomers = customers.filter(customer => [customer.name, customer.phone, customer.zone, customer.address].join(" ").toLowerCase().includes(customerQuery.toLowerCase()));

  const saveCustomer = () => {
    if (!customerForm.name.trim()) return;
    const id = `C${String(customers.length + 1).padStart(3, "0")}`;
    const nextCustomer = { id, ...customerForm, name: customerForm.name.trim() };
    setState(prev => ({ ...prev, customers: [nextCustomer, ...prev.customers] }));
    setSelectedCustomerId(id);
    setCustomerForm({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  };

  const createOrder = () => {
    if (!selectedCustomer) return;
    const id = `DO-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(orders.length + 1).padStart(3, "0")}`;
    const nextOrder = {
      id,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      zone: selectedCustomer.zone,
      address: selectedCustomer.address,
      mapUrl: selectedCustomer.mapUrl,
      window: orderForm.window,
      boxes: Number(orderForm.boxes || 0),
      cod: Number(orderForm.cod || 0),
      driverId: "",
      status: "รอคนขับรับ",
      photo: "",
      checkInAt: "",
      deliveredAt: "",
      complaint: "",
      salesNote: orderForm.salesNote,
      createdAt: new Date().toISOString()
    };
    setState(prev => ({ ...prev, orders: [nextOrder, ...prev.orders] }));
    setOrderForm({ window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setTab("driver");
  };

  const updateOrder = (id, patch) => setState(prev => ({ ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) }));
  const setGoogle = patch => setState(prev => ({ ...prev, google: { ...prev.google, ...patch } }));

  const syncToGoogle = async () => {
    if (!state.google.webAppUrl) {
      setSyncStatus("กรุณาใส่ Google Apps Script Web App URL ก่อน");
      setTab("settings");
      return;
    }
    setSyncStatus("กำลัง sync ไป Google Sheets...");
    try {
      const response = await fetch(state.google.webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "sync", customers: state.customers, orders: state.orders })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Google sync failed");
      setSyncStatus(`Sync สำเร็จ ${new Date().toLocaleTimeString("th-TH")}`);
    } catch (error) {
      setSyncStatus(`Sync ไม่สำเร็จ: ${error.message}`);
    }
  };

  const loadFromGoogle = async () => {
    if (!state.google.webAppUrl) {
      setSyncStatus("กรุณาใส่ Google Apps Script Web App URL ก่อน");
      setTab("settings");
      return;
    }
    setSyncStatus("กำลังโหลดข้อมูลจาก Google Sheets...");
    try {
      const response = await fetch(state.google.webAppUrl);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Google load failed");
      setState(prev => ({
        ...prev,
        customers: data.data?.customers?.length ? data.data.customers : prev.customers,
        orders: data.data?.orders?.length ? data.data.orders.map(order => ({ ...order, boxes: Number(order.boxes || 0), cod: Number(order.cod || 0) })) : prev.orders
      }));
      setSyncStatus(`โหลดข้อมูลสำเร็จ ${new Date().toLocaleTimeString("th-TH")}`);
    } catch (error) {
      setSyncStatus(`โหลดไม่สำเร็จ: ${error.message}`);
    }
  };

  const uploadPod = async (order, file) => {
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    updateOrder(order.id, { photo: file.name });
    if (!state.google.webAppUrl) return;
    try {
      setSyncStatus("กำลังอัปโหลดรูปเข้า Google Drive...");
      const response = await fetch(state.google.webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "uploadPod", orderId: order.id, fileName: file.name, dataUrl })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "POD upload failed");
      updateOrder(order.id, { photo: data.fileUrl });
      setSyncStatus("อัปโหลดรูปเข้า Google Drive สำเร็จ");
    } catch (error) {
      setSyncStatus(`อัปโหลดรูปไม่สำเร็จ แต่เก็บชื่อไฟล์ไว้แล้ว: ${error.message}`);
    }
  };

  const acceptOrder = id => updateOrder(id, { driverId, status: "กำลังส่ง" });
  const checkIn = id => updateOrder(id, { checkInAt: new Date().toLocaleString("th-TH") });
  const confirmPhoto = id => updateOrder(id, { photo: `POD-${id}.jpg` });
  const completeOrder = id => updateOrder(id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH") });

  const totals = {
    jobs: orders.length,
    waiting: orders.filter(order => order.status === "รอคนขับรับ").length,
    active: orders.filter(order => order.status === "กำลังส่ง").length,
    done: orders.filter(order => order.status === "ส่งสำเร็จ").length
  };

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">HK</div>
          <div><strong>Hillkoff</strong><span>Delivery System</span></div>
        </div>
        <nav>
          <button className={tab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><Store size={18} /> Sales Dashboard</button>
          <button className={tab === "driver" ? "active" : ""} onClick={() => setTab("driver")}><Truck size={18} /> Driver App</button>
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><ClipboardList size={18} /> Daily Reports</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={18} /> Settings</button>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>เชียงใหม่และจังหวัดใกล้เคียง · {todayText()}</p>
            <h1>{tab === "sales" ? "Sales Delivery Dashboard" : tab === "driver" ? "Driver Realtime Orders" : "Daily Report & Service Quality"}</h1>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={loadFromGoogle}><FolderSync size={16} /> Load</button>
            <button className="primary" onClick={syncToGoogle}><FileSpreadsheet size={16} /> Sync Google</button>
          </div>
        </header>
        <div className="sync-banner">{syncStatus}</div>

        <div className="stats">
          <Stat icon={PackagePlus} label="ออเดอร์วันนี้" value={`${totals.jobs} งาน`} sub="ฝ่ายขายเปิดงานส่ง" />
          <Stat icon={UserCheck} label="รอคนขับรับ" value={`${totals.waiting} งาน`} sub="เด้งเข้าหน้าคนขับ" tone="#92400e" />
          <Stat icon={Navigation} label="กำลังส่ง" value={`${totals.active} งาน`} sub="เช็คอินได้จากหน้างาน" tone="#1d4ed8" />
          <Stat icon={CheckCircle2} label="ส่งสำเร็จ" value={`${totals.done} งาน`} sub="ต้องมีหลักฐานรูปถ่าย" tone="#166534" />
        </div>

        {tab === "sales" && (
          <div className="sales-grid">
            <section className="panel">
              <div className="panel-head"><h2>ข้อมูลลูกค้าเก่า</h2><span>{customers.length} ร้าน</span></div>
              <label className="search"><Search size={16} /><input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="ค้นหาชื่อลูกค้า เบอร์โทร พื้นที่" /></label>
              <div className="customer-list">
                {filteredCustomers.map(customer => (
                  <button key={customer.id} className={`customer-card ${selectedCustomerId === customer.id ? "selected" : ""}`} onClick={() => setSelectedCustomerId(customer.id)}>
                    <strong>{customer.name}</strong>
                    <span>{customer.contact} · {customer.phone}</span>
                    <span>{customer.zone} · {customer.address}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เปิดออเดอร์ส่งของ</h2><span>ไม่ต้องพิมพ์ลูกค้าซ้ำ</span></div>
              {selectedCustomer && (
                <div className="customer-detail">
                  <div><b>{selectedCustomer.name}</b><p>{selectedCustomer.contact} · {selectedCustomer.phone}</p><p>{selectedCustomer.address}</p></div>
                  <a href={selectedCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เปิด Google Map</a>
                </div>
              )}
              <div className="form-grid">
                <input value={orderForm.window} onChange={e => setOrderForm(p => ({ ...p, window: e.target.value }))} placeholder="ช่วงเวลาส่ง" />
                <input value={orderForm.boxes} onChange={e => setOrderForm(p => ({ ...p, boxes: e.target.value }))} type="number" placeholder="จำนวนกล่อง" />
                <input value={orderForm.cod} onChange={e => setOrderForm(p => ({ ...p, cod: e.target.value }))} type="number" placeholder="COD" />
              </div>
              <textarea value={orderForm.salesNote} onChange={e => setOrderForm(p => ({ ...p, salesNote: e.target.value }))} placeholder="รายละเอียดสินค้า / หมายเหตุฝ่ายขาย" rows={3} />
              <button className="primary wide" onClick={createOrder}><PackagePlus size={18} /> ส่งออเดอร์เข้าคิวคนขับ</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เพิ่มลูกค้าใหม่</h2><span>บันทึกไว้ใช้ครั้งถัดไป</span></div>
              <div className="form-grid two">
                <input value={customerForm.name} onChange={e => setCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อร้าน/ลูกค้า" />
                <input value={customerForm.contact} onChange={e => setCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="ผู้ติดต่อ" />
                <input value={customerForm.phone} onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" />
                <select value={customerForm.zone} onChange={e => setCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <input value={customerForm.address} onChange={e => setCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="ที่อยู่/ย่าน" />
              <input value={customerForm.mapUrl} onChange={e => setCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Google Map link" />
              <textarea value={customerForm.note} onChange={e => setCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="หมายเหตุประจำลูกค้า" rows={3} />
              <button className="secondary wide" onClick={saveCustomer}>บันทึกลูกค้า</button>
            </section>
          </div>
        )}

        {tab === "driver" && (
          <div className="driver-grid">
            <section className="panel">
              <div className="panel-head"><h2>เลือกคนขับ</h2><span>5 คน</span></div>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}>{DRIVERS.map(driver => <option key={driver.id} value={driver.id}>{driver.name} · {driver.plate}</option>)}</select>
              <div className="driver-summary">
                {DRIVERS.filter(driver => driver.id === driverId).map(driver => <div key={driver.id}><b>{driver.name}</b><p>{driver.zone}</p><p>{driver.phone}</p></div>)}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>ออเดอร์เรียลไทม์</h2><span>{driverOrders.length} งาน</span></div>
              <div className="order-feed">
                {driverOrders.map(order => (
                  <article key={order.id} className="order-card">
                    <div className="order-main">
                      <div>
                        <div className="order-title"><strong>{order.customerName}</strong><span style={{ color: statusColor[order.status] }}>{order.status}</span></div>
                        <p>{order.address} · {order.zone}</p>
                        <p>{order.window} · {order.boxes} กล่อง · COD {money(order.cod)} บาท</p>
                        {order.salesNote && <p>หมายเหตุ: {order.salesNote}</p>}
                      </div>
                      <a className="map-link" href={order.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> Map</a>
                    </div>
                    <div className="action-row">
                      {!order.driverId && <button onClick={() => acceptOrder(order.id)}><UserCheck size={16} /> รับออเดอร์</button>}
                      <button onClick={() => checkIn(order.id)}><Navigation size={16} /> เช็คอินร้าน</button>
                      <label className="upload-btn"><Camera size={16} /> ถ่ายรูปยืนยัน<input type="file" accept="image/*" capture="environment" onChange={e => uploadPod(order, e.target.files?.[0])} /></label>
                      <button onClick={() => completeOrder(order.id)}><CheckCircle2 size={16} /> ส่งสำเร็จ</button>
                    </div>
                    <div className="proof-row">
                      <span>เช็คอิน: {order.checkInAt || "-"}</span>
                      <span>รูปยืนยัน: {order.photo || "-"}</span>
                      <span>ปิดงาน: {order.deliveredAt || "-"}</span>
                    </div>
                    <textarea value={order.complaint} onChange={e => updateOrder(order.id, { complaint: e.target.value, status: e.target.value ? "ติดปัญหา" : order.status })} placeholder="บันทึกร้องเรียน/ปัญหาหน้างาน" rows={2} />
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "reports" && (
          <div className="report-grid">
            <section className="panel">
              <div className="panel-head"><h2>รายงานประจำวัน</h2><span>Google Sheets-ready</span></div>
              <div className="report-lines">
                <p>ออเดอร์ทั้งหมด <b>{orders.length}</b> งาน</p>
                <p>ส่งสำเร็จ <b>{report.delivered}</b> งาน</p>
                <p>COD รวม <b>{money(report.cod)}</b> บาท</p>
                <p>ร้องเรียน/ปัญหา <b>{report.complaints.length}</b> รายการ</p>
              </div>
              <div className="google-box">
                <b>Google Integration Plan</b>
                <p>Sheets: เก็บ customers, orders, driver_logs, complaints</p>
                <p>Drive: เก็บรูป POD ตามเลขออเดอร์</p>
                <p>Maps: เปิดเส้นทางจาก mapUrl ของลูกค้า</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>คะแนนคนขับ</h2><span>จากงานสำเร็จ รูปยืนยัน และปัญหา</span></div>
              {report.driverScore.map(driver => (
                <div key={driver.id} className="score-row">
                  <div><b>{driver.name}</b><span>{driver.jobs} งาน · สำเร็จ {driver.done} · ปัญหา {driver.issues}</span></div>
                  <strong><Star size={16} /> {driver.score}</strong>
                </div>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>การร้องเรียน</h2><span>{report.complaints.length} รายการ</span></div>
              {report.complaints.length === 0 ? <div className="empty"><MessageSquareWarning size={22} /> ยังไม่มีรายการร้องเรียน</div> : report.complaints.map(order => (
                <div key={order.id} className="complaint-card">
                  <b>{order.customerName}</b>
                  <p>{order.complaint}</p>
                  <span>{order.id}</span>
                </div>
              ))}
            </section>
          </div>
        )}

        {tab === "settings" && (
          <div className="settings-grid">
            <section className="panel">
              <div className="panel-head"><h2>Google Connection</h2><span>Sheets · Drive · Maps</span></div>
              <label className="field-label">Google Apps Script Web App URL</label>
              <input value={state.google.webAppUrl || ""} onChange={e => setGoogle({ webAppUrl: e.target.value })} placeholder="https://script.google.com/macros/s/.../exec" />
              <div className="settings-actions">
                <button className="secondary" onClick={loadFromGoogle}><FolderSync size={16} /> โหลดจาก Google</button>
                <button className="primary" onClick={syncToGoogle}><FileSpreadsheet size={16} /> Sync ไป Google</button>
              </div>
              <div className="google-box">
                <b>สิ่งที่ต้องมีเพื่อใช้งานจริง</b>
                <p>1. Google Apps Script Web App URL จากไฟล์ `google-apps-script/Code.gs`</p>
                <p>2. Google Sheet จะถูกสร้างอัตโนมัติเมื่อ sync ครั้งแรก</p>
                <p>3. Google Drive folder สำหรับรูปส่งสำเร็จจะถูกสร้างตอนอัปโหลดรูปครั้งแรก</p>
                <p>4. Google Maps ใช้ link ที่ฝ่ายขายใส่ในข้อมูลลูกค้า</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>Data Tables</h2><span>พร้อมลง Google Sheets</span></div>
              <div className="report-lines">
                <p>customers: <b>{customers.length}</b> records</p>
                <p>orders: <b>{orders.length}</b> records</p>
                <p>complaints: <b>{report.complaints.length}</b> records</p>
                <p>drivers: <b>{DRIVERS.length}</b> fixed profiles</p>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

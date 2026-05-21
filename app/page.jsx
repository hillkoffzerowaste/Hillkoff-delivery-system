"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  PackageCheck,
  Plus,
  Route,
  Search,
  Truck,
  UserRound,
  WalletCards
} from "lucide-react";

const STORAGE_KEY = "hillkoff-delivery-system:v1";

const DRIVERS = [
  { id: "D1", name: "สมชาย", vehicle: "รถกระบะ 4 ล้อ", plate: "ชม 2145", capacity: 900, zone: "เมืองเชียงใหม่" },
  { id: "D2", name: "วิชัย", vehicle: "รถตู้ทึบ", plate: "ชม 6732", capacity: 1200, zone: "สันกำแพง / ดอยสะเก็ด" },
  { id: "D3", name: "อนันต์", vehicle: "รถกระบะคอก", plate: "ชม 8291", capacity: 1000, zone: "หางดง / สันป่าตอง" },
  { id: "D4", name: "ธนวัฒน์", vehicle: "รถตู้เย็น", plate: "ชม 1187", capacity: 750, zone: "ลำพูน / ลำปาง" },
  { id: "D5", name: "กิตติ", vehicle: "รถกระบะ 4 ล้อ", plate: "ชม 4428", capacity: 900, zone: "แม่ริม / เชียงราย" }
];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUSES = ["รอจัดส่ง", "จัดคิวแล้ว", "กำลังส่ง", "ส่งสำเร็จ", "ติดปัญหา"];
const STATUS_COLORS = {
  "รอจัดส่ง": "#92400e",
  "จัดคิวแล้ว": "#1d4ed8",
  "กำลังส่ง": "#7c3aed",
  "ส่งสำเร็จ": "#166534",
  "ติดปัญหา": "#b91c1c"
};

const sampleOrders = [
  ["CM-260522-001", "Ristr8to Lab", "นิมมาน", "เมืองเชียงใหม่", "09:00-10:30", 42, 3850, "D1", "กำลังส่ง"],
  ["CM-260522-002", "Graph Cafe", "ช้างม่อย", "เมืองเชียงใหม่", "10:00-12:00", 28, 2600, "D1", "จัดคิวแล้ว"],
  ["CM-260522-003", "Akha Ama", "สันติธรรม", "เมืองเชียงใหม่", "13:00-15:00", 55, 4200, "D1", "รอจัดส่ง"],
  ["CM-260522-004", "Transit Number 8", "สันกำแพง", "สันกำแพง", "09:30-11:30", 80, 9100, "D2", "จัดคิวแล้ว"],
  ["CM-260522-005", "Mae On Roastery", "แม่ออน", "สันกำแพง", "11:30-14:00", 64, 7200, "D2", "กำลังส่ง"],
  ["CM-260522-006", "Doi Saket Coffee", "ดอยสะเก็ด", "ดอยสะเก็ด", "14:00-16:00", 72, 6800, "D2", "รอจัดส่ง"],
  ["CM-260522-007", "Hang Dong Bistro", "หางดง", "หางดง", "09:00-11:00", 96, 10500, "D3", "จัดคิวแล้ว"],
  ["CM-260522-008", "Baan Tawai Cafe", "บ้านถวาย", "หางดง", "11:00-13:00", 40, 3600, "D3", "รอจัดส่ง"],
  ["CM-260522-009", "San Pa Tong Mart", "สันป่าตอง", "สันป่าตอง", "13:00-16:30", 120, 13200, "D3", "รอจัดส่ง"],
  ["CM-260522-010", "Lamphun Coffee Hub", "เมืองลำพูน", "ลำพูน", "10:00-12:00", 100, 11800, "D4", "กำลังส่ง"],
  ["CM-260522-011", "Lampang Beans", "เมืองลำปาง", "ลำปาง", "13:00-17:00", 160, 18400, "D4", "จัดคิวแล้ว"],
  ["CM-260522-012", "Mae Rim Garden", "แม่ริม", "แม่ริม", "09:00-11:00", 75, 8300, "D5", "ส่งสำเร็จ"],
  ["CM-260522-013", "Mon Jam Cafe", "แม่ริม", "แม่ริม", "11:00-14:00", 48, 5200, "D5", "กำลังส่ง"],
  ["CM-260522-014", "Chiang Rai Partner", "เมืองเชียงราย", "เชียงราย", "15:00-18:00", 180, 20500, "D5", "จัดคิวแล้ว"],
  ["CM-260522-015", "Warorot Wholesale", "กาดหลวง", "เมืองเชียงใหม่", "08:30-10:00", 65, 7400, "D1", "ส่งสำเร็จ"],
  ["CM-260522-016", "Chang Phueak Store", "ช้างเผือก", "เมืองเชียงใหม่", "10:30-12:00", 22, 1900, "", "รอจัดส่ง"],
  ["CM-260522-017", "Sansai Cafe", "สันทราย", "เมืองเชียงใหม่", "13:30-15:30", 37, 3300, "", "รอจัดส่ง"],
  ["CM-260522-018", "Pa Daet Coffee", "ป่าแดด", "เมืองเชียงใหม่", "15:00-17:00", 45, 4700, "", "รอจัดส่ง"],
  ["CM-260522-019", "Mae Hia Market", "แม่เหียะ", "เมืองเชียงใหม่", "16:00-18:00", 58, 6100, "", "รอจัดส่ง"],
  ["CM-260522-020", "Phayao Dealer", "เมืองพะเยา", "พะเยา", "14:00-18:00", 130, 14500, "", "รอจัดส่ง"]
].map(([id, customer, area, zone, window, weight, cod, driverId, status]) => ({
  id,
  customer,
  area,
  zone,
  window,
  weight,
  cod,
  driverId,
  status,
  note: "",
  docs: Math.random() > 0.45,
  priority: weight >= 120 || zone === "เชียงราย" || zone === "ลำปาง" ? "ด่วน" : "ปกติ"
}));

function money(value) {
  return value.toLocaleString("th-TH");
}

function loadOrders() {
  if (typeof window === "undefined") return sampleOrders;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : sampleOrders;
  } catch {
    return sampleOrders;
  }
}

function nextStatus(status) {
  const index = STATUSES.indexOf(status);
  return STATUSES[Math.min(index + 1, STATUSES.length - 1)];
}

function StatCard({ icon: Icon, label, value, sub, tone = "#166534" }) {
  return (
    <div className="card stat-card">
      <div className="stat-icon" style={{ background: `${tone}16`, color: tone }}><Icon size={20} /></div>
      <div>
        <div className="muted">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="small">{sub}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [orders, setOrders] = useState(sampleOrders);
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("ทั้งหมด");
  const [status, setStatus] = useState("ทั้งหมด");
  const [newOrder, setNewOrder] = useState({ customer: "", area: "", zone: "เมืองเชียงใหม่", window: "09:00-12:00", weight: "", cod: "" });

  useEffect(() => {
    setOrders(loadOrders());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(order => {
      const text = [order.id, order.customer, order.area, order.zone, order.driverId, order.status].join(" ").toLowerCase();
      return (!q || text.includes(q)) && (zone === "ทั้งหมด" || order.zone === zone) && (status === "ทั้งหมด" || order.status === status);
    });
  }, [orders, query, zone, status]);

  const totals = useMemo(() => ({
    jobs: orders.length,
    done: orders.filter(o => o.status === "ส่งสำเร็จ").length,
    active: orders.filter(o => o.status === "กำลังส่ง").length,
    problem: orders.filter(o => o.status === "ติดปัญหา").length,
    cod: orders.reduce((sum, o) => sum + o.cod, 0),
    weight: orders.reduce((sum, o) => sum + o.weight, 0)
  }), [orders]);

  const driverLoads = useMemo(() => DRIVERS.map(driver => {
    const jobs = orders.filter(order => order.driverId === driver.id);
    const weight = jobs.reduce((sum, order) => sum + order.weight, 0);
    const done = jobs.filter(order => order.status === "ส่งสำเร็จ").length;
    return { ...driver, jobs, weight, done, load: Math.round((weight / driver.capacity) * 100) };
  }), [orders]);

  const updateOrder = (id, patch) => setOrders(prev => prev.map(order => order.id === id ? { ...order, ...patch } : order));

  const autoAssign = () => {
    setOrders(prev => {
      const loads = Object.fromEntries(DRIVERS.map(driver => [driver.id, prev.filter(order => order.driverId === driver.id).reduce((sum, order) => sum + order.weight, 0)]));
      return prev.map(order => {
        if (order.driverId) return order;
        const preferred = DRIVERS.find(driver => driver.zone.includes(order.zone) || order.zone.includes(driver.zone.split(" / ")[0]));
        const driver = preferred && loads[preferred.id] + order.weight <= preferred.capacity
          ? preferred
          : [...DRIVERS].sort((a, b) => loads[a.id] - loads[b.id])[0];
        loads[driver.id] += order.weight;
        return { ...order, driverId: driver.id, status: "จัดคิวแล้ว" };
      });
    });
  };

  const addOrder = () => {
    if (!newOrder.customer.trim()) return;
    const id = `CM-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(orders.length + 1).padStart(3, "0")}`;
    setOrders(prev => [{
      id,
      customer: newOrder.customer.trim(),
      area: newOrder.area.trim() || newOrder.zone,
      zone: newOrder.zone,
      window: newOrder.window,
      weight: Number(newOrder.weight || 0),
      cod: Number(newOrder.cod || 0),
      driverId: "",
      status: "รอจัดส่ง",
      note: "",
      docs: false,
      priority: Number(newOrder.weight || 0) >= 120 ? "ด่วน" : "ปกติ"
    }, ...prev]);
    setNewOrder({ customer: "", area: "", zone: "เมืองเชียงใหม่", window: "09:00-12:00", weight: "", cod: "" });
  };

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">HK</div>
          <div>
            <strong>Hillkoff</strong>
            <span>Delivery System</span>
          </div>
        </div>
        <nav>
          <a className="active"><ClipboardList size={18} /> Dispatch</a>
          <a><Route size={18} /> Routes</a>
          <a><Truck size={18} /> Drivers</a>
          <a><WalletCards size={18} /> COD</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>เชียงใหม่และจังหวัดใกล้เคียง</p>
            <h1>Daily Dispatch Board</h1>
          </div>
          <button className="primary" onClick={autoAssign}><Route size={18} /> จัดคิวอัตโนมัติ</button>
        </header>

        <div className="stats">
          <StatCard icon={PackageCheck} label="งานวันนี้" value={`${totals.jobs} เจ้า`} sub="เป้าหมาย 20-30 เจ้า/วัน" />
          <StatCard icon={Truck} label="กำลังส่ง" value={`${totals.active} งาน`} sub={`${totals.done} งานส่งสำเร็จ`} tone="#7c3aed" />
          <StatCard icon={WalletCards} label="COD รวม" value={`${money(totals.cod)} บาท`} sub="รอปิดรอบกับคนขับ" tone="#1d4ed8" />
          <StatCard icon={AlertTriangle} label="ติดปัญหา" value={`${totals.problem} งาน`} sub={`${totals.weight} กก. รวมทั้งหมด`} tone="#b91c1c" />
        </div>

        <div className="grid">
          <section className="panel drivers-panel">
            <div className="panel-head">
              <h2>Driver Load</h2>
              <span>5 คนขับ</span>
            </div>
            {driverLoads.map(driver => (
              <div key={driver.id} className="driver-card">
                <div className="driver-top">
                  <div className="avatar"><UserRound size={18} /></div>
                  <div>
                    <strong>{driver.name}</strong>
                    <p>{driver.vehicle} · {driver.plate}</p>
                  </div>
                  <span className="job-pill">{driver.jobs.length} งาน</span>
                </div>
                <div className="loadbar"><span style={{ width: `${Math.min(driver.load, 100)}%`, background: driver.load > 100 ? "#b91c1c" : "#166534" }} /></div>
                <div className="driver-meta">
                  <span>{driver.zone}</span>
                  <b>{driver.weight}/{driver.capacity} กก.</b>
                </div>
              </div>
            ))}
          </section>

          <section className="panel orders-panel">
            <div className="panel-head">
              <h2>Delivery Orders</h2>
              <span>{filtered.length} รายการ</span>
            </div>

            <div className="filters">
              <label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาลูกค้า พื้นที่ เลขงาน" /></label>
              <select value={zone} onChange={e => setZone(e.target.value)}>
                <option>ทั้งหมด</option>
                {ZONES.map(item => <option key={item}>{item}</option>)}
              </select>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option>ทั้งหมด</option>
                {STATUSES.map(item => <option key={item}>{item}</option>)}
              </select>
            </div>

            <div className="add-row">
              <input value={newOrder.customer} onChange={e => setNewOrder(p => ({ ...p, customer: e.target.value }))} placeholder="ชื่อลูกค้า" />
              <input value={newOrder.area} onChange={e => setNewOrder(p => ({ ...p, area: e.target.value }))} placeholder="ย่าน/อำเภอ" />
              <select value={newOrder.zone} onChange={e => setNewOrder(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(item => <option key={item}>{item}</option>)}</select>
              <input value={newOrder.weight} onChange={e => setNewOrder(p => ({ ...p, weight: e.target.value }))} placeholder="กก." type="number" />
              <input value={newOrder.cod} onChange={e => setNewOrder(p => ({ ...p, cod: e.target.value }))} placeholder="COD" type="number" />
              <button onClick={addOrder}><Plus size={16} /></button>
            </div>

            <div className="table">
              {filtered.map(order => {
                const driver = DRIVERS.find(item => item.id === order.driverId);
                return (
                  <article key={order.id} className="order-card">
                    <div className="order-main">
                      <div>
                        <div className="order-title">
                          <strong>{order.customer}</strong>
                          {order.priority === "ด่วน" && <span className="urgent">ด่วน</span>}
                        </div>
                        <p><MapPin size={14} /> {order.area} · {order.zone}</p>
                        <p><Clock3 size={14} /> {order.window} · {order.weight} กก. · COD {money(order.cod)} บาท</p>
                      </div>
                      <div className="order-actions">
                        <select value={order.driverId} onChange={e => updateOrder(order.id, { driverId: e.target.value, status: e.target.value ? "จัดคิวแล้ว" : "รอจัดส่ง" })}>
                          <option value="">ยังไม่ assign</option>
                          {DRIVERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <button className="status-btn" style={{ color: STATUS_COLORS[order.status] }} onClick={() => updateOrder(order.id, { status: nextStatus(order.status) })}>
                          <CheckCircle2 size={16} /> {order.status}
                        </button>
                      </div>
                    </div>
                    <div className="order-foot">
                      <span>{order.id}</span>
                      <span>{driver ? `${driver.name} · ${driver.plate}` : "รอจัดคนขับ"}</span>
                      <span>{order.docs ? "มีเอกสารส่งคืน" : "ไม่มีเอกสาร"}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

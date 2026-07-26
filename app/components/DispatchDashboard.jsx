"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Trash2 } from "lucide-react";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const cardLabels = {
  created: "ออเดอร์วันที่เลือก", waitingDriver: "รอคนขับรับ", activeDelivery: "กำลังจัดส่ง", delivered: "ส่งสำเร็จ",
  routeTasks: "งานเส้นทาง", chiangmaiWaiting: "เชียงใหม่รอจัดส่งวันนี้", chiangmaiBacklog: "เชียงใหม่ค้างส่งจากวันก่อน", outstationWaiting: "ต่างจังหวัดรอจัดส่ง"
};
const cardDescriptions = {
  chiangmaiWaiting: "คนขับบริษัท · สร้างในวันที่เลือก · ยังส่งไม่สำเร็จ",
  chiangmaiBacklog: "คนขับบริษัท · สร้างก่อนวันที่เลือก · ยังส่งไม่สำเร็จ"
};

export default function DispatchDashboard({ apiFetch, role, onDeleteOrder, onResetOrders }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [data, setData] = useState({ cards: {}, orders: [], driverLoads: [], availableDates: [] });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/orders/dispatch-dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedDate }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "โหลดแดชบอร์ดไม่สำเร็จ");
      setData(json.data);
    } finally { setLoading(false); }
  }, [apiFetch, selectedDate]);
  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(); }, 300_000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [load]);
  const orders = useMemo(() => data.orders.filter((order) => {
    const haystack = [order.id, order.customerName, order.zone, order.address, order.driverName].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (status === "all" || order.status === status);
  }), [data.orders, query, status]);
  return <div className="dispatch-dashboard-new">
    <section className="panel dispatch-dashboard-toolbar"><div><h2>แดชบอร์ดการจัดส่ง</h2><p>ตัวกรองอิงจากวันที่สร้างออเดอร์</p></div><label>วันที่สร้างออเดอร์<input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></label><button className="secondary" onClick={load}><RefreshCw size={16} /> {loading ? "กำลังโหลด" : "รีเฟรช"}</button>{role === "admin" && <button className="secondary" onClick={onResetOrders}>รีเซ็ตออเดอร์</button>}</section>
    <section className="analytics-cards dispatch-eight-cards">{Object.entries(cardLabels).map(([key, label]) => <div key={key}><span>{label}</span><b>{data.cards[key] || 0}</b>{cardDescriptions[key] && <small>{cardDescriptions[key]}</small>}</div>)}</section>
    <div className="dispatch-grid"><section className="panel"><div className="panel-head"><h2>ออเดอร์วันที่ {selectedDate}</h2><span>{orders.length} งาน</span></div><div className="filters dispatch-filters"><label className="search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาออเดอร์ ลูกค้า พื้นที่ คนขับ" /></label><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">ทุกสถานะ</option>{[...new Set(data.orders.map((order) => order.status).filter(Boolean))].map((value) => <option key={value}>{value}</option>)}</select><input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} /></div><div className="dispatch-table">{orders.map((order) => <article key={order.id} className="dispatch-row"><div><b>{order.id}</b><span>สร้าง {order.createdDate}</span></div><div><b>{order.customerName}</b><span>{order.zone} · {order.address}</span></div><div><b>{order.status}</b><span>{order.driverName || "ยังไม่รับงาน"}</span></div><strong>{Number(order.cod || 0).toLocaleString()} บาท</strong><button className="secondary danger" aria-label={`ลบออเดอร์ ${order.id}`} onClick={async () => { await onDeleteOrder(order.id); await load(); }}><Trash2 size={14} /></button></article>)}</div></section>
      <section className="panel"><div className="panel-head"><h2>ออเดอร์ปัจจุบันแบบรายวัน</h2><span>{selectedDate}</span></div>{data.driverLoads.length ? data.driverLoads.map((driver) => <div className="driver-load-row" key={driver.driverId}><div><b>{driver.driverName || driver.driverId}</b><span>{driver.plate || "ยังไม่ผูกรถ"} · ตัวเมือง {driver.city} · ต่างจังหวัด {driver.outstation}</span></div><strong>{driver.total} งาน<br /><small>รอ {driver.waiting} · กำลังส่ง {driver.active} · สำเร็จ {driver.delivered}</small></strong></div>) : <p className="muted">ยังไม่มีออเดอร์ที่ผูกคนขับในวันที่เลือก</p>}</section>
    </div>
  </div>;
}

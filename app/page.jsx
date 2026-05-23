"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
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
  Users,
  Settings
} from "lucide-react";

const STORE_KEY = "hillkoff-delivery-ops:v2";
const DEFAULT_GOOGLE_ENDPOINT = "/api/google";

const initialDrivers = [
  { id: "D1", name: "Somchai", plate: "ชม 2145", zone: "เมืองเชียงใหม่", phone: "081-000-1001", lat: 18.7883, lng: 98.9853 },
  { id: "D2", name: "Wichai", plate: "ชม 6732", zone: "สันกำแพง / ดอยสะเก็ด", phone: "081-000-1002", lat: 18.9256, lng: 99.0853 },
  { id: "D3", name: "Anan", plate: "ชม 8291", zone: "หางดง / สันป่าตอง", phone: "081-000-1003", lat: 18.8564, lng: 99.0456 },
  { id: "D4", name: "Thanawat", plate: "ชม 1187", zone: "ลำพูน / ลำปาง", phone: "081-000-1004", lat: 18.5745, lng: 99.5025 },
  { id: "D5", name: "Kitti", plate: "ชม 4428", zone: "แม่ริม / เชียงราย", phone: "081-000-1005", lat: 19.2244, lng: 99.8585 }
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
    drivers: initialDrivers,
    auth: { role: "", name: "", phone: "", driverId: "" },
    loginHistory: [],
    onlineDrivers: {},
    driverLocations: {},
    google: {
      webAppUrl: DEFAULT_GOOGLE_ENDPOINT,
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
    const parsed = saved ? JSON.parse(saved) : defaultState();
    return {
      ...defaultState(),
      ...parsed,
      drivers: parsed.drivers?.length ? parsed.drivers : defaultState().drivers,
      auth: { ...defaultState().auth, ...(parsed.auth || {}) },
      loginHistory: parsed.loginHistory || [],
      onlineDrivers: parsed.onlineDrivers || {},
      driverLocations: parsed.driverLocations || {},
      google: {
        ...defaultState().google,
        ...(parsed.google || {}),
        webAppUrl: parsed.google?.webAppUrl || DEFAULT_GOOGLE_ENDPOINT
      }
    };
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
  const [loginForm, setLoginForm] = useState({ role: "sales", name: "", phone: "" });
  const [rememberPhone, setRememberPhone] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("hillkoff-last-phone");
    if (saved) {
      setLoginForm(p => ({ ...p, phone: saved }));
      setRememberPhone(true);
    }
  }, []);
  const [driverForm, setDriverForm] = useState({ firstName: "", lastName: "", phone: "", vehicle: "รถยนต์", plate: "", zone: "เมืองเชียงใหม่" });
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderZoneFilter, setOrderZoneFilter] = useState("all");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [orderForm, setOrderForm] = useState({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
  const [syncStatus, setSyncStatus] = useState("Local mode");

  useEffect(() => setState(readState()), []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }, [state]);
  useEffect(() => {
    if (state.auth?.driverId) setDriverId(state.auth.driverId);
  }, [state.auth?.driverId]);

  const customers = state.customers;
  const orders = state.orders;
  const drivers = state.drivers?.length ? state.drivers : initialDrivers;
  const auth = state.auth || {};
  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId) || customers[0];
  const driverOrders = orders.filter(order => order.driverId === driverId || (!order.driverId && order.status === "รอคนขับรับ"));

  const report = useMemo(() => {
    const delivered = orders.filter(order => order.status === "ส่งสำเร็จ");
    const complaints = orders.filter(order => order.complaint);
    const cod = orders.reduce((sum, order) => sum + Number(order.cod || 0), 0);
    const driverScore = drivers.map(driver => {
      const jobs = orders.filter(order => order.driverId === driver.id);
      const done = jobs.filter(order => order.status === "ส่งสำเร็จ").length;
      const issues = jobs.filter(order => order.status === "ติดปัญหา" || order.complaint).length;
      const photos = jobs.filter(order => order.photo).length;
      const score = Math.max(1, Math.min(100, 70 + done * 6 + photos * 3 - issues * 12));
      return { ...driver, jobs: jobs.length, done, issues, score };
    });
    return { delivered: delivered.length, complaints, cod, driverScore };
  }, [orders, drivers]);

  const filteredCustomers = customers.filter(customer => [customer.name, customer.phone, customer.zone, customer.address].join(" ").toLowerCase().includes(customerQuery.toLowerCase()));
  const filteredOrders = orders.filter(order => {
    const queryText = [order.id, order.customerName, order.phone, order.zone, order.address, order.salesNote].join(" ").toLowerCase();
    const matchesQuery = queryText.includes(orderQuery.toLowerCase());
    const matchesStatus = orderStatusFilter === "all" || order.status === orderStatusFilter;
    const matchesZone = orderZoneFilter === "all" || order.zone === orderZoneFilter;
    return matchesQuery && matchesStatus && matchesZone;
  });

  const saveCustomer = async () => {
    if (!customerForm.name.trim()) return;
    const id = `C${String(customers.length + 1).padStart(3, "0")}`;
    const nextCustomer = { id, ...customerForm, name: customerForm.name.trim() };
    const nextState = { ...state, customers: [nextCustomer, ...state.customers] };
    setState(nextState);
    setSelectedCustomerId(id);
    setCustomerForm({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
    
    if (state.google.webAppUrl) {
      setSyncStatus("⏳ กำลัง sync ลูกค้าใหม่ไป Google Sheets...");
      try {
        const params = new URLSearchParams();
        params.append("action", "sync");
        params.append("customers", JSON.stringify(nextState.customers));
        params.append("orders", JSON.stringify(nextState.orders));
        params.append("drivers", JSON.stringify(nextState.drivers || []));
        
        await fetch(state.google.webAppUrl, { method: "POST", body: params });
        setSyncStatus(`✅ บันทึกลูกค้า "${nextCustomer.name}" และ sync Google สำเร็จ ${new Date().toLocaleTimeString("th-TH")}`);
      } catch (error) {
        setSyncStatus(`⚠️ บันทึกลูกค้า "${nextCustomer.name}" แล้ว แต่ sync Google ไม่สำเร็จ: ${error.message}`);
      }
    } else {
      setSyncStatus(`✅ บันทึกลูกค้า "${nextCustomer.name}" สำเร็จ (ยังไม่ได้ตั้ง Google)`);
    }
  };

  const setAuth = authPatch => setState(prev => ({ ...prev, auth: { ...(prev.auth || {}), ...authPatch } }));

  const loginSales = async () => {
    if (!loginForm.name.trim() || !loginForm.phone.trim()) return;
    if (rememberPhone) {
      localStorage.setItem("hillkoff-last-phone", loginForm.phone.trim());
    } else {
      localStorage.removeItem("hillkoff-last-phone");
    }
    const loginEntry = {
      id: `L${Date.now()}`,
      role: "sales",
      name: loginForm.name.trim(),
      phone: loginForm.phone.trim(),
      loginAt: new Date().toLocaleString("th-TH"),
      loginTime: new Date().getTime()
    };
    setAuth({ role: "sales", name: loginForm.name.trim(), phone: loginForm.phone.trim(), driverId: "" });
    setState(prev => ({
      ...prev,
      loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100)
    }));
    setTab("sales");
    await loadFromGoogle();
  };

  const loginDriver = async () => {
    if (!loginForm.phone.trim()) return;
    const phone = loginForm.phone.trim();
    if (rememberPhone) {
      localStorage.setItem("hillkoff-last-phone", phone);
    } else {
      localStorage.removeItem("hillkoff-last-phone");
    }
    let latestDrivers = state.drivers || [];
    try {
      const response = await fetch(state.google.webAppUrl || DEFAULT_GOOGLE_ENDPOINT);
      const data = await response.json();
      if (data.ok) {
        latestDrivers = data.data?.drivers?.length ? data.data.drivers : latestDrivers;
        setState(prev => ({
          ...prev,
          customers: data.data?.customers?.length ? data.data.customers : prev.customers,
          orders: data.data?.orders?.length ? data.data.orders.map(order => ({ ...order, boxes: Number(order.boxes || 0), cod: Number(order.cod || 0) })) : prev.orders,
          drivers: latestDrivers
        }));
      }
    } catch {
      // Keep local driver list available if Google is temporarily unreachable.
    }
    const found = latestDrivers.find(driver => String(driver.phone).trim() === phone);
    if (found) {
      const loginEntry = {
        id: `L${Date.now()}`,
        role: "driver",
        name: found.name,
        phone,
        driverId: found.id,
        loginAt: new Date().toLocaleString("th-TH"),
        loginTime: new Date().getTime()
      };
      setDriverId(found.id);
      setAuth({ role: "driver", name: found.name, phone, driverId: found.id });
      setState(prev => ({
        ...prev,
        loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100),
        onlineDrivers: { ...prev.onlineDrivers, [found.id]: new Date().getTime() }
      }));
      setTab("driver");
      return;
    }
    setDriverForm(prev => ({ ...prev, phone }));
    setAuth({ role: "driver-register", name: "", phone, driverId: "" });
  };

  const registerDriver = async () => {
    if (!driverForm.firstName.trim() || !driverForm.phone.trim() || !driverForm.plate.trim()) return;
    const nextDriver = {
      id: `D${Date.now()}`,
      firstName: driverForm.firstName.trim(),
      lastName: driverForm.lastName.trim(),
      name: `${driverForm.firstName.trim()} ${driverForm.lastName.trim()}`.trim(),
      phone: driverForm.phone.trim(),
      vehicle: driverForm.vehicle.trim(),
      plate: driverForm.plate.trim(),
      zone: driverForm.zone,
      lat: 18.7883,
      lng: 98.9853,
      createdAt: new Date().toISOString()
    };
    const loginEntry = {
      id: `L${Date.now()}`,
      role: "driver",
      name: nextDriver.name,
      phone: nextDriver.phone,
      driverId: nextDriver.id,
      loginAt: new Date().toLocaleString("th-TH"),
      loginTime: new Date().getTime()
    };
    const nextDrivers = [nextDriver, ...(state.drivers || [])];
    setState(prev => ({
      ...prev,
      drivers: nextDrivers,
      auth: { role: "driver", name: nextDriver.name, phone: nextDriver.phone, driverId: nextDriver.id },
      loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100),
      onlineDrivers: { ...prev.onlineDrivers, [nextDriver.id]: new Date().getTime() }
    }));
    setDriverId(nextDriver.id);
    setDriverForm({ firstName: "", lastName: "", phone: "", vehicle: "รถยนต์", plate: "", zone: "เมืองเชียงใหม่" });
    setTab("driver");
    try {
      const params = new URLSearchParams();
      params.append("action", "sync");
      params.append("customers", JSON.stringify(state.customers));
      params.append("orders", JSON.stringify(state.orders));
      params.append("drivers", JSON.stringify(nextDrivers));
      
      await fetch(state.google.webAppUrl || DEFAULT_GOOGLE_ENDPOINT, { method: "POST", body: params });
      setSyncStatus(`✅ ลงทะเบียนคนขับ "${nextDriver.name}" และ sync Google สำเร็จ`);
    } catch {
      setSyncStatus(`⚠️ ลงทะเบียนคนขับ "${nextDriver.name}" แล้ว แต่ sync Google ไม่สำเร็จ`);
    }
  };

  const logout = () => {
    setState(prev => {
      const updated = { ...prev.onlineDrivers };
      if (auth.driverId) delete updated[auth.driverId];
      return { ...prev, onlineDrivers: updated };
    });
    setAuth({ role: "", name: "", phone: "", driverId: "" });
  };

  const createOrder = () => {
    let customer = selectedCustomer;
    
    if (orderForm.customerName.trim()) {
      customer = customers.find(c => c.name.toLowerCase().includes(orderForm.customerName.toLowerCase())) || selectedCustomer;
    }
    
    if (!customer) return;
    const id = `DO-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(orders.length + 1).padStart(3, "0")}`;
    const nextOrder = {
      id,
      customerId: customer.id,
      customerName: customer.name,
      zone: customer.zone,
      address: customer.address,
      mapUrl: customer.mapUrl,
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
    setOrderForm({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setTab("driver");
  };

  const updateOrder = (id, patch) => setState(prev => ({ ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) }));
  const setGoogle = patch => setState(prev => ({ ...prev, google: { ...prev.google, ...patch } }));
  const assignDriver = (id, nextDriverId) => updateOrder(id, {
    driverId: nextDriverId,
    status: nextDriverId ? "กำลังส่ง" : "รอคนขับรับ"
  });

  const syncToGoogle = async () => {
    if (!state.google.webAppUrl) {
      setSyncStatus("🔴 กรุณาใส่ Google Apps Script Web App URL ก่อน");
      setTab("settings");
      return;
    }
    setSyncStatus("⏳ กำลัง sync ไป Google Sheets...");
    try {
      // ใช้ API proxy (server-to-server ไม่มี CORS issue)
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webAppUrl: state.google.webAppUrl,
          action: "sync",
          customers: state.customers,
          orders: state.orders,
          drivers: state.drivers || []
        })
      });
      
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Sync failed");
      
      // รอแล้วโหลดข้อมูลกลับ
      await new Promise(resolve => setTimeout(resolve, 1500));
      await loadFromGoogle();
      
      setSyncStatus(`✅ Sync สำเร็จ! ${new Date().toLocaleTimeString("th-TH")} (${state.customers.length} ลูกค้า, ${state.orders.length} ออเดอร์)`);
    } catch (error) {
      setSyncStatus(`❌ Sync ไม่สำเร็จ: ${error.message}`);
    }
  };

  const loadFromGoogle = async () => {
    if (!state.google.webAppUrl) {
      setSyncStatus("🔴 กรุณาใส่ Google Apps Script Web App URL ก่อน");
      setTab("settings");
      return;
    }
    setSyncStatus("⏳ กำลังโหลดข้อมูลจาก Google Sheets...");
    try {
      // ใช้ API proxy (server-to-server ไม่มี CORS issue)
      const response = await fetch(`/api/sync?webAppUrl=${encodeURIComponent(state.google.webAppUrl)}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Google load failed");
      
      // บันทึก Sheet URL ถ้ามี
      const newState = {
        customers: data.data?.customers?.length ? data.data.customers : state.customers,
        orders: data.data?.orders?.length ? data.data.orders.map(order => ({ ...order, boxes: Number(order.boxes || 0), cod: Number(order.cod || 0) })) : state.orders,
        drivers: data.data?.drivers?.length ? data.data.drivers : state.drivers
      };
      
      setState(prev => ({
        ...prev,
        ...newState,
        google: { ...prev.google, ...(data.sheetUrl ? { sheetUrl: data.sheetUrl } : {}) }
      }));
      
      setSyncStatus(`✅ โหลดข้อมูลสำเร็จ ${new Date().toLocaleTimeString("th-TH")}`);
    } catch (error) {
      setSyncStatus(`❌ โหลดไม่สำเร็จ: ${error.message}`);
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
  const checkIn = id => {
    const order = orders.find(o => o.id === id);
    const driver = drivers.find(d => d.id === driverId);
    const checkInTime = new Date().toLocaleString("th-TH");
    updateOrder(id, { checkInAt: checkInTime });
    
    if (driver) {
      setState(prev => ({
        ...prev,
        driverLocations: {
          ...prev.driverLocations,
          [driverId]: {
            driverId: driverId,
            driverName: driver.name,
            driverPhone: driver.phone,
            plate: driver.plate,
            zone: driver.zone,
            orderId: id,
            customerName: order?.customerName,
            address: order?.address,
            checkInTime: checkInTime,
            timestamp: new Date().getTime()
          }
        }
      }));
    }
  };
  const confirmPhoto = id => updateOrder(id, { photo: `POD-${id}.jpg` });
  const completeOrder = id => {
    if (window.confirm("ยืนยันส่งสำเร็จหรือไม่? ตรวจสอบว่าได้รับเงินและมีรูปยืนยันแล้ว")) {
      updateOrder(id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH") });
    }
  };

  const [mapZoom, setMapZoom] = useState(1);

  const generateDailyReport = () => {
    const today = new Date().toLocaleDateString("th-TH");
    const todayOrders = orders.filter(o => new Date(o.createdAt || o.assignedAt).toLocaleDateString("th-TH") === today);
    const driverStats = {};
    let totalCOD = 0;

    todayOrders.forEach(order => {
      totalCOD += Number(order.cod || 0);
      if (order.driverId) {
        if (!driverStats[order.driverId]) {
          const driver = (state.drivers || []).find(d => d.id === order.driverId);
          driverStats[order.driverId] = {
            name: driver?.name || "ไม่ทราบ",
            plate: driver?.plate || "-",
            zone: driver?.zone || "-",
            phone: driver?.phone || "-",
            total: 0,
            completed: 0,
            active: 0,
            failed: 0,
            cod: 0,
            checkins: []
          };
        }
        driverStats[order.driverId].total += 1;
        driverStats[order.driverId].cod += Number(order.cod || 0);
        driverStats[order.driverId][order.status === "ส่งสำเร็จ" ? "completed" : order.status === "กำลังส่ง" ? "active" : "failed"] += 1;
      }
    });

    Object.keys(state.driverLocations || {}).forEach(driverId => {
      if (driverStats[driverId]) {
        const loc = state.driverLocations[driverId];
        driverStats[driverId].checkins.push({
          address: loc.address,
          time: new Date(loc.timestamp).toLocaleTimeString("th-TH"),
          customer: loc.customerName
        });
      }
    });

    let report = `\n${"═".repeat(60)}\n`;
    report += `📋 รายงานการส่งของประจำวัน\n`;
    report += `วันที่: ${today}\n`;
    report += `เวลาสร้างรายงาน: ${new Date().toLocaleString("th-TH")}\n`;
    report += `${"═".repeat(60)}\n\n`;
    
    report += `📊 สรุปข้อมูลรวมทั้งวัน:\n`;
    report += `${"─".repeat(60)}\n`;
    report += `  📦 ออเดอร์ทั้งหมด: ${todayOrders.length} งาน\n`;
    report += `  ✅ สำเร็จ: ${todayOrders.filter(o => o.status === "ส่งสำเร็จ").length} งาน\n`;
    report += `  🟡 กำลังส่ง: ${todayOrders.filter(o => o.status === "กำลังส่ง").length} งาน\n`;
    report += `  ⏳ รอรับ: ${todayOrders.filter(o => o.status === "รอคนขับรับ").length} งาน\n`;
    report += `  ❌ ติดปัญหา: ${todayOrders.filter(o => o.status === "ติดปัญหา").length} งาน\n`;
    report += `  💰 รวม COD: ${money(totalCOD)} บาท\n\n`;

    report += `👥 ข้อมูลรายคนขับ:\n`;
    report += `${"─".repeat(60)}\n`;
    
    Object.entries(driverStats).forEach(([driverId, stats]) => {
      report += `\n🚗 ${stats.name}\n`;
      report += `  📱 เบอร์โทร: ${stats.phone}\n`;
      report += `  🏎️ เพลต: ${stats.plate}\n`;
      report += `  📍 โซน: ${stats.zone}\n`;
      report += `  ────────────────────────────────────────\n`;
      report += `  📦 ออเดอร์รวม: ${stats.total} งาน\n`;
      report += `     ✅ สำเร็จ: ${stats.completed} งาน\n`;
      report += `     🟡 กำลังส่ง: ${stats.active} งาน\n`;
      report += `     ❌ ไม่สำเร็จ: ${stats.failed} งาน\n`;
      report += `  💰 COD รวม: ${money(stats.cod)} บาท\n`;
      report += `  ⏱️ ประสิทธิภาพ: ${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}%\n`;
      
      if (stats.checkins.length > 0) {
        report += `  📌 จุดเช็คอิน (${stats.checkins.length} จุด):\n`;
        stats.checkins.slice(0, 8).forEach((c, idx) => {
          report += `     ${idx + 1}. ${c.time} - ${c.customer}\n`;
          report += `        📍 ${c.address}\n`;
        });
        if (stats.checkins.length > 8) report += `     ... และอีก ${stats.checkins.length - 8} จุด\n`;
      }
    });

    report += `\n${"═".repeat(60)}\n`;
    report += `📌 หมายเหตุ:\n`;
    report += `  • รายงานนี้สร้างจากระบบ Hillkoff Delivery System\n`;
    report += `  • ข้อมูลเป็นอัตเวลา ณ เวลาสร้างรายงาน\n`;
    report += `  • ตรวจสอบเลขที่ออเดอร์และ COD ก่อนตัดสิน\n`;
    report += `${"═".repeat(60)}\n`;
    
    return report;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("คัดลอกรายงานสำเร็จ!");
    }).catch(() => {
      alert("คัดลอกไม่สำเร็จ กรุณาลองใหม่");
    });
  };

  const totals = {
    jobs: orders.length,
    waiting: orders.filter(order => order.status === "รอคนขับรับ").length,
    active: orders.filter(order => order.status === "กำลังส่ง").length,
    done: orders.filter(order => order.status === "ส่งสำเร็จ").length
  };

  if (!auth.role || auth.role === "driver-register") {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="brand login-brand">
            <img className="brand-mark" src="/delivery-logo.svg" alt="Hillkoff Delivery" />
            <div><strong>Hillkoff</strong><span>Delivery System</span></div>
          </div>
          {auth.role !== "driver-register" ? (
            <>
              <div className="panel-head"><h1>เข้าสู่ระบบ</h1><span>Google Sheets connected</span></div>
              <div className="segmented">
                <button className={loginForm.role === "sales" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "sales" }))}>ฝ่ายขาย</button>
                <button className={loginForm.role === "driver" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "driver" }))}>คนขับ</button>
              </div>
              {loginForm.role === "sales" && <input value={loginForm.name} onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อผู้ใช้งานฝ่ายขาย" />}
              <input value={loginForm.phone} onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)} />
                จดจำเบอร์โทรในครั้งต่อไป
              </label>
              <button className="primary wide" onClick={loginForm.role === "sales" ? loginSales : loginDriver}>
                {loginForm.role === "sales" ? "เข้าหน้าแดชบอร์ดฝ่ายขาย" : "เข้าสู่ระบบคนขับ"}
              </button>
              <p className="login-note">ระบบจะโหลดข้อมูลลูกค้า ออเดอร์ และคนขับจาก Google Sheets หลังล็อกอิน</p>
            </>
          ) : (
            <>
              <div className="panel-head"><h1>ลงทะเบียนคนขับ</h1><span>ครั้งแรกเท่านั้น</span></div>
              <div className="form-grid two">
                <input value={driverForm.firstName} onChange={e => setDriverForm(p => ({ ...p, firstName: e.target.value }))} placeholder="ชื่อ" />
                <input value={driverForm.lastName} onChange={e => setDriverForm(p => ({ ...p, lastName: e.target.value }))} placeholder="สกุล" />
                <input value={driverForm.phone} onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" />
                <input value={driverForm.vehicle} onChange={e => setDriverForm(p => ({ ...p, vehicle: e.target.value }))} placeholder="รถที่ใช้" />
                <input value={driverForm.plate} onChange={e => setDriverForm(p => ({ ...p, plate: e.target.value }))} placeholder="ทะเบียนรถ" />
                <select value={driverForm.zone} onChange={e => setDriverForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <button className="primary wide" onClick={registerDriver}>บันทึกและเข้าใช้งานคนขับ</button>
              <button className="secondary wide" onClick={logout}>กลับไปหน้า Login</button>
            </>
          )}
        </section>
      </main>
    );
  }

  const displayTab = auth.role === "driver" ? "driver" : tab;

  return (
    <main>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/delivery-logo.svg" alt="Hillkoff Delivery" />
          <div><strong>Hillkoff</strong><span>Delivery System</span></div>
        </div>
        <nav>
          {auth.role !== "driver" && (
            <>
              <button className={displayTab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><Store size={18} /> Sales Dashboard</button>
              <button className={displayTab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}><Users size={18} /> Dispatch Dashboard</button>
            </>
          )}
          {auth.role === "driver" && (
            <button className={displayTab === "driver" ? "active" : ""} onClick={() => setTab("driver")}><Truck size={18} /> Driver App</button>
          )}
          {auth.role !== "driver" && (
            <>
              <button className={displayTab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><ClipboardList size={18} /> Daily Reports</button>
              <button className={displayTab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={18} /> Settings</button>
            </>
          )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>เชียงใหม่และจังหวัดใกล้เคียง · {todayText()}</p>
            <h1>{displayTab === "sales" ? "Sales Delivery Dashboard" : displayTab === "dispatch" ? "Dispatch Work Dashboard" : displayTab === "driver" ? "Driver Realtime Orders" : displayTab === "settings" ? "System Settings" : "Daily Report & Service Quality"}</h1>
          </div>
          <div className="top-actions">
            <span className="google-status">{auth.role === "driver" ? "คนขับ" : "ฝ่ายขาย"}: {auth.name || auth.phone}</span>
            <button className="secondary" onClick={loadFromGoogle}><FolderSync size={16} /> Load</button>
            <button className="primary" onClick={syncToGoogle}><FileSpreadsheet size={16} /> Sync Google</button>
            <button className="secondary" onClick={logout}>ออก</button>
          </div>
        </header>
        <div className="sync-banner">{syncStatus}</div>

        <div className="stats">
          <Stat icon={PackagePlus} label="ออเดอร์วันนี้" value={`${totals.jobs} งาน`} sub="ฝ่ายขายเปิดงานส่ง" />
          <Stat icon={UserCheck} label="รอคนขับรับ" value={`${totals.waiting} งาน`} sub="เด้งเข้าหน้าคนขับ" tone="#92400e" />
          <Stat icon={Navigation} label="กำลังส่ง" value={`${totals.active} งาน`} sub="เช็คอินได้จากหน้างาน" tone="#1d4ed8" />
          <Stat icon={CheckCircle2} label="ส่งสำเร็จ" value={`${totals.done} งาน`} sub="ต้องมีหลักฐานรูปถ่าย" tone="#166534" />
        </div>

        {displayTab === "sales" && (
          <div className="sales-grid">
            {state.google.sheetUrl && (
              <section className="panel" style={{ gridColumn: "1 / -1", background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <div>
                    <b>📊 ลิงค์ Google Sheets</b>
                    <p style={{ fontSize: "12px", color: "#666", margin: "4px 0" }}>คลิกเพื่อดูข้อมูลลูกค้าที่บันทึกไว้ และดาวน์โหลดรายงาน</p>
                  </div>
                  <a href={state.google.sheetUrl} target="_blank" rel="noreferrer" className="primary" style={{ whiteSpace: "nowrap" }}>
                    <FileSpreadsheet size={16} style={{ marginRight: "6px" }} /> เปิด Sheet
                  </a>
                </div>
              </section>
            )}
            {syncStatus && syncStatus !== "Local mode" && (
              <section className="panel" style={{ gridColumn: "1 / -1", background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>✓ {syncStatus}</p>
              </section>
            )}
            <section className="panel" style={{ gridColumn: "1 / -1", background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div className="panel-head"><h2>🟢 คนขับออนไลน์ตอนนี้</h2><span>{Object.keys(state.onlineDrivers || {}).length} คน</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted" style={{ gridColumn: "1 / -1" }}>ยังไม่มีคนขับออนไลน์</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const onlineTime = Math.floor((new Date().getTime() - (state.onlineDrivers?.[driver.id] || 0)) / 60000);
                    return (
                      <div key={driver.id} style={{ background: "white", padding: "12px", borderRadius: "6px", border: "1px solid #dcfce7", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#22c55e", marginBottom: "4px" }}>🟢 {driver.name}</div>
                        <small style={{ color: "#666" }}>{driver.plate}</small><br />
                        <small style={{ color: "#999" }}>{driver.zone}</small><br />
                        <small style={{ color: "#16a34a", marginTop: "4px", display: "block" }}>Online {onlineTime}m ago</small>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
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
              <div className="panel-head"><h2>เปิดออเดอร์ส่งของ</h2><span>พิมพ์ชื่อลูกค้าหรือเลือกจากรายชื่อ</span></div>
              <label className="search"><Search size={16} /><input value={orderForm.customerName} onChange={e => setOrderForm(p => ({ ...p, customerName: e.target.value }))} placeholder="พิมพ์ชื่อลูกค้า (autocomplete)" /></label>
              {orderForm.customerName && (
                <div className="customer-list">
                  {customers.filter(c => c.name.toLowerCase().includes(orderForm.customerName.toLowerCase())).slice(0, 5).map(c => (
                    <button key={c.id} className="customer-card" onClick={() => { setOrderForm(p => ({ ...p, customerName: c.name })); setSelectedCustomerId(c.id); }}>
                      <strong>{c.name}</strong>
                      <span>{c.phone} · {c.zone}</span>
                    </button>
                  ))}
                </div>
              )}
              {(() => {
                const foundCustomer = customers.find(c => c.name.toLowerCase() === orderForm.customerName.toLowerCase()) || selectedCustomer;
                return foundCustomer ? (
                  <div className="customer-detail">
                    <div><b>{foundCustomer.name}</b><p>{foundCustomer.contact} · {foundCustomer.phone}</p><p>{foundCustomer.address}</p></div>
                    <a href={foundCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เปิด Google Map</a>
                  </div>
                ) : null;
              })()}
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

            <section className="panel">
              <div className="panel-head"><h2>📍 ตำแหน่งคนขับล่าสุด</h2><span>{Object.keys(state.driverLocations || {}).length} คนเช็คอินแล้ว</span></div>
              {Object.keys(state.driverLocations || {}).length === 0 ? (
                <p className="muted">ยังไม่มีคนขับเช็คอิน</p>
              ) : (
                Object.values(state.driverLocations || {})
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map(location => (
                    <div key={location.driverId} style={{ padding: "12px", borderBottom: "1px solid #eee", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <div>
                          <b style={{ fontSize: "14px", color: "#1a5490" }}>🚗 {location.driverName}</b>
                          <p style={{ margin: "4px 0", fontSize: "12px" }}>📱 {location.driverPhone} · {location.plate}</p>
                          <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>🏪 {location.customerName}</p>
                          <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>📌 {location.address}</p>
                          <p style={{ margin: "4px 0", fontSize: "11px", color: "#999" }}>⏰ เช็คอิน: {location.checkInTime}</p>
                        </div>
                        <span style={{ background: "#166534", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>🟢 Online</span>
                      </div>
                    </div>
                  ))
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📦 สรุปการส่งของ</h2><span>กำลังส่ง {orders.filter(o => o.status === "กำลังส่ง").length} + สำเร็จ {orders.filter(o => o.status === "ส่งสำเร็จ").length}</span></div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1, background: "#fef3c7", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #f59e0b" }}>
                  <small style={{ color: "#92400e" }}>⏳ กำลังส่ง</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#f59e0b" }}>{orders.filter(o => o.status === "กำลังส่ง").length}</b>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #22c55e" }}>
                  <small style={{ color: "#166534" }}>✓ สำเร็จ</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#22c55e" }}>{orders.filter(o => o.status === "ส่งสำเร็จ").length}</b>
                </div>
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {orders.filter(o => o.status === "กำลังส่ง" || o.status === "ส่งสำเร็จ").length === 0 ? (
                  <p className="muted">ยังไม่มีการส่ง</p>
                ) : (
                  orders.filter(o => o.status === "กำลังส่ง" || o.status === "ส่งสำเร็จ").sort((a, b) => (a.status === "กำลังส่ง" ? -1 : 1)).map(order => {
                    const driver = drivers.find(d => d.id === order.driverId);
                    return (
                      <div key={order.id} style={{ padding: "10px", borderBottom: "1px solid #eee", fontSize: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                          <b style={{ color: order.status === "กำลังส่ง" ? "#f59e0b" : "#22c55e" }}>{order.id}</b>
                          <span style={{ background: order.status === "กำลังส่ง" ? "#fef3c7" : "#f0fdf4", color: order.status === "กำลังส่ง" ? "#92400e" : "#166534", padding: "2px 6px", borderRadius: "3px", fontSize: "11px" }}>{order.status === "กำลังส่ง" ? "⏳ ส่งไป" : "✓ เสร็จ"}</span>
                        </div>
                        <p style={{ margin: "2px 0", color: "#333" }}>{order.customerName}</p>
                        <p style={{ margin: "2px 0", color: "#666" }}>{order.address}</p>
                        <p style={{ margin: "2px 0", color: "#999" }}>🚗 {driver?.name || "ยังไม่มอบหมาย"}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {displayTab === "dispatch" && (
          <div className="dispatch-grid">
            <section className="panel">
              <div className="panel-head"><h2>คิวงานส่งของ</h2><span>{filteredOrders.length} งาน</span></div>
              <div className="filters dispatch-filters">
                <label className="search"><Search size={16} /><input value={orderQuery} onChange={e => setOrderQuery(e.target.value)} placeholder="ค้นหาเลขงาน ลูกค้า พื้นที่ หมายเหตุ" /></label>
                <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                  <option value="all">ทุกสถานะ</option>
                  {STATUS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <select value={orderZoneFilter} onChange={e => setOrderZoneFilter(e.target.value)}>
                  <option value="all">ทุกพื้นที่</option>
                  {ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </div>
              <div className="dispatch-table">
                <div className="dispatch-head">
                  <span>งาน</span>
                  <span>ลูกค้า/พื้นที่</span>
                  <span>คนขับ</span>
                  <span>สถานะ</span>
                  <span>COD</span>
                </div>
                {filteredOrders.map(order => {
                  const assignedDriver = drivers.find(driver => driver.id === order.driverId);
                  return (
                    <article key={order.id} className="dispatch-row">
                      <div><b>{order.id}</b><span>{order.window} · {order.boxes} กล่อง</span></div>
                      <div><b>{order.customerName}</b><span>{order.zone} · {order.address}</span>{order.complaint && <span style={{ marginLeft: "8px", background: "#fca5a5", color: "#7f1d1d", padding: "2px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: "bold" }}>⚠️ {order.complaint}</span>}</div>
                      <select value={order.driverId} onChange={e => assignDriver(order.id, e.target.value)}>
                        <option value="">รอคนขับรับเอง</option>
                        {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name} · {driver.plate}</option>)}
                      </select>
                      <div className="status-stack">
                        <span className="status-chip" style={{ color: statusColor[order.status], background: `${statusColor[order.status]}14` }}>{order.status}</span>
                        <small>{assignedDriver ? assignedDriver.name : "ยังไม่มอบหมาย"}</small>
                      </div>
                      <strong>{money(order.cod)} บาท</strong>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>โหลดงานคนขับ</h2><span>วันนี้</span></div>
              {report.driverScore.map(driver => {
                const driverJobs = orders.filter(order => order.driverId === driver.id && order.status !== "ส่งสำเร็จ");
                return (
                  <div key={driver.id} className="driver-load-row">
                    <div>
                      <b>{driver.name}</b>
                      <span>{driver.plate} · {driver.zone}</span>
                    </div>
                    <strong>{driverJobs.length} งาน</strong>
                  </div>
                );
              })}
              <div className="google-box">
                <b>วิธีใช้งานเร็ว</b>
                <p>ฝ่ายขายสร้างออเดอร์จากหน้า Sales แล้วงานจะเข้าคิวนี้ทันที</p>
                <p>แอดมินเลือกคนขับจากคอลัมน์คนขับ หรือปล่อยให้คนขับกดรับเองจากหน้า Driver</p>
              </div>
            </section>
          </div>
        )}

        {displayTab === "driver" && (
          <div className="driver-grid">
            <section className="panel">
              <div className="panel-head"><h2>เลือกคนขับ</h2><span>{drivers.length} คน</span></div>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name} · {driver.plate}</option>)}</select>
              <div className="driver-summary">
                {drivers.filter(driver => driver.id === driverId).map(driver => <div key={driver.id}><b>{driver.name}</b><p>{driver.zone}</p><p>{driver.phone}</p></div>)}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📊 ออเดอร์วันนี้</h2><span>{driverOrders.length} งาน</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ background: "#f0f9ff", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #0ea5e9" }}>
                  <small style={{ color: "#666" }}>กำลังส่ง</small>
                  <b style={{ fontSize: "18px", color: "#0ea5e9" }}>{driverOrders.filter(o => o.status !== "ส่งสำเร็จ").length} งาน</b>
                </div>
                <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #22c55e" }}>
                  <small style={{ color: "#666" }}>สำเร็จ</small>
                  <b style={{ fontSize: "18px", color: "#22c55e" }}>{driverOrders.filter(o => o.status === "ส่งสำเร็จ").length} งาน</b>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", height: "24px", borderRadius: "4px", overflow: "hidden", background: "#f3f4f6" }}>
                <div style={{ 
                  flex: driverOrders.filter(o => o.status !== "ส่งสำเร็จ").length, 
                  background: "#fbbf24", 
                  minWidth: driverOrders.filter(o => o.status !== "ส่งสำเร็จ").length > 0 ? "8px" : "0"
                }}></div>
                <div style={{ 
                  flex: driverOrders.filter(o => o.status === "ส่งสำเร็จ").length, 
                  background: "#22c55e", 
                  minWidth: driverOrders.filter(o => o.status === "ส่งสำเร็จ").length > 0 ? "8px" : "0"
                }}></div>
              </div>
              {driverOrders.length === 0 ? (
                <p className="muted">ยังไม่มีออเดอร์วันนี้</p>
              ) : (
                <div style={{ fontSize: "12px", color: "#666" }}>
                  <p style={{ margin: "0 0 8px 0" }}>✓ สำเร็จ: {driverOrders.filter(o => o.status === "ส่งสำเร็จ").length}/{driverOrders.length}</p>
                  <p style={{ margin: "0" }}>⏳ กำลังส่ง: {driverOrders.filter(o => o.status !== "ส่งสำเร็จ").length}/{driverOrders.length}</p>
                </div>
              )}
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
                    <div style={{ marginTop: "12px", marginBottom: "12px" }}>
                      <small style={{ color: "#666", display: "block", marginBottom: "8px" }}>เลือกหรือพิมพ์หมายเหตุปัญหา:</small>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                        <button style={{ padding: "6px 10px", fontSize: "12px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "4px", cursor: "pointer" }} onClick={() => updateOrder(order.id, { complaint: "ของไม่ครบ", status: "ติดปัญหา" })}>ของไม่ครบ</button>
                        <button style={{ padding: "6px 10px", fontSize: "12px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "4px", cursor: "pointer" }} onClick={() => updateOrder(order.id, { complaint: "ลูกค้าโอนตาม", status: "ติดปัญหา" })}>ลูกค้าโอนตาม</button>
                        <button style={{ padding: "6px 10px", fontSize: "12px", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "4px", cursor: "pointer" }} onClick={() => updateOrder(order.id, { complaint: "ได้ของผิด", status: "ติดปัญหา" })}>ได้ของผิด</button>
                        <button style={{ padding: "6px 10px", fontSize: "12px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer" }} onClick={() => updateOrder(order.id, { complaint: "", status: order.status !== "ติดปัญหา" ? order.status : "กำลังส่ง" })}>ยกเลิก</button>
                      </div>
                    </div>
                    <textarea value={order.complaint} onChange={e => updateOrder(order.id, { complaint: e.target.value, status: e.target.value ? "ติดปัญหา" : order.status })} placeholder="หรือพิมพ์หมายเหตุอื่นๆ..." rows={2} style={{ fontSize: "13px" }} />
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {displayTab === "reports" && (
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

        {displayTab === "settings" && (
          <div className="settings-grid">
            <section className="panel">
              <div className="panel-head"><h2>🟢 Online Status</h2><span>{Object.keys(state.onlineDrivers || {}).length} online</span></div>
              <div className="report-lines">
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted">ไม่มีคนขับออนไลน์</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const lastSeen = state.onlineDrivers?.[driver.id];
                    const timeDiff = Math.floor((new Date().getTime() - lastSeen) / 60000);
                    return (
                      <p key={driver.id}><b>🟢 {driver.name}</b><br/><small>{driver.plate} ({driver.zone}) - {timeDiff}m ago</small></p>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📍 Driver Locations</h2><span>Mini Map with Zoom</span></div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className="secondary" onClick={() => setMapZoom(Math.max(0.5, mapZoom - 0.2))} style={{ padding: "6px 12px", fontSize: "14px" }}>➖ Zoom Out</button>
                <button className="secondary" onClick={() => setMapZoom(Math.min(2, mapZoom + 0.2))} style={{ padding: "6px 12px", fontSize: "14px" }}>➕ Zoom In</button>
                <span style={{ flex: 1, textAlign: "right", lineHeight: "32px", fontSize: "12px", color: "#666" }}>Zoom: {(mapZoom * 100).toFixed(0)}%</span>
              </div>
              <div style={{ width: "100%", height: "380px", background: "#fafafa", borderRadius: "8px", position: "relative", border: "1px solid #ddd", overflow: "auto" }}>
                <svg width={400 * mapZoom} height={300 * mapZoom} viewBox="0 0 400 300" style={{ background: "linear-gradient(135deg, #e8f4f8 0%, #f0fafb 100%)" }}>
                  {/* Header */}
                  <text x="200" y="25" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1a5490">🗺️ เชียงใหม่ - แผนที่โซนการส่ง</text>
                  
                  {/* Zone boundaries - grid layout */}
                  <g fill="none" stroke="#ddd" strokeWidth="2" strokeDasharray="4">
                    {/* Grid lines */}
                    <line x1="0" y1="80" x2="400" y2="80" />
                    <line x1="0" y1="160" x2="400" y2="160" />
                    <line x1="133" y1="50" x2="133" y2="250" />
                    <line x1="267" y1="50" x2="267" y2="250" />
                  </g>

                  {/* Zone boxes with labels */}
                  <rect x="10" y="50" width="110" height="100" fill="#e3f2fd" opacity="0.5" stroke="#1976d2" strokeWidth="2" rx="4" />
                  <text x="65" y="105" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1976d2">แม่ริม</text>

                  <rect x="145" y="50" width="110" height="100" fill="#f3e5f5" opacity="0.5" stroke="#7b1fa2" strokeWidth="2" rx="4" />
                  <text x="200" y="105" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7b1fa2">เมืองเชียงใหม่</text>

                  <rect x="280" y="50" width="110" height="100" fill="#fce4ec" opacity="0.5" stroke="#c2185b" strokeWidth="2" rx="4" />
                  <text x="335" y="105" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#c2185b">ดอยสะเก็ด</text>

                  <rect x="10" y="160" width="110" height="100" fill="#f1f8e9" opacity="0.5" stroke="#558b2f" strokeWidth="2" rx="4" />
                  <text x="65" y="215" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#558b2f">สันกำแพง</text>

                  <rect x="145" y="160" width="110" height="100" fill="#fff3e0" opacity="0.5" stroke="#e65100" strokeWidth="2" rx="4" />
                  <text x="200" y="215" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#e65100">ลำพูน</text>

                  <rect x="280" y="160" width="110" height="100" fill="#fef5e7" opacity="0.5" stroke="#f9a825" strokeWidth="2" rx="4" />
                  <text x="335" y="215" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#f9a825">หางดง</text>

                  {/* Driver markers with pulse effect */}
                  {Object.keys(state.onlineDrivers || {}).length > 0 ? (
                    drivers.filter(d => state.onlineDrivers?.[d.id]).map((driver, idx) => {
                      const positions = [
                        { x: 65, y: 85 }, { x: 200, y: 100 }, { x: 335, y: 90 },
                        { x: 65, y: 200 }, { x: 200, y: 210 }, { x: 335, y: 195 }
                      ];
                      const pos = positions[idx % positions.length];
                      return (
                        <g key={driver.id}>
                          <circle cx={pos.x} cy={pos.y} r="14" fill="#ff4444" opacity="0.9"/>
                          <circle cx={pos.x} cy={pos.y} r="18" fill="none" stroke="#ff4444" strokeWidth="2" opacity="0.3"/>
                          <circle cx={pos.x} cy={pos.y} r="22" fill="none" stroke="#ff4444" strokeWidth="1" opacity="0.2"/>
                          <text x={pos.x} y={pos.y + 28} textAnchor="middle" fontSize="9" fill="#333" fontWeight="bold">{driver.name}</text>
                          <text x={pos.x} y={pos.y + 38} textAnchor="middle" fontSize="8" fill="#666">{driver.plate}</text>
                        </g>
                      );
                    })
                  ) : (
                    <text x="200" y="150" textAnchor="middle" fontSize="14" fill="#999">📍 ไม่มีคนขับออนไลน์</text>
                  )}
                </svg>
              </div>
              <div className="google-box" style={{ marginTop: "16px" }}>
                <b>👥 สถานะคนขับ</b>
                {drivers.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#999" }}>ยังไม่มีคนขับ</p>
                ) : (
                  drivers.map(d => (
                    <p key={d.id} style={{ fontSize: "12px", margin: "6px 0", padding: "6px", background: state.onlineDrivers?.[d.id] ? "#e8f5e9" : "#f5f5f5", borderRadius: "4px" }}>
                      <b>{state.onlineDrivers?.[d.id] ? "🟢" : "⚫"} {d.name}</b>
                      <br />
                      <small>📱 {d.phone} · {d.plate} · {d.zone}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📋 Login History</h2><span>{(state.loginHistory || []).length} entries</span></div>
              <div className="report-lines" style={{ maxHeight: "400px", overflowY: "auto" }}>
                {(state.loginHistory || []).length === 0 ? (
                  <p className="muted">ยังไม่มีการล็อกอิน</p>
                ) : (
                  state.loginHistory.slice(0, 20).map(entry => (
                    <p key={entry.id} style={{ fontSize: "13px", paddingBottom: "8px", borderBottom: "1px solid #eee" }}>
                      <b>{entry.name}</b> ({entry.role === "driver" ? "🚗 Driver" : "📦 Sales"}) <br/>
                      <small>📱 {entry.phone}</small> <br/>
                      <small>⏰ {entry.loginAt}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📋 รายงานประจำวัน</h2><span>สรุปข้อมูลการส่งของทั้งวัน</span></div>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                copyToClipboard(report);
              }}><FileText size={16} /> สร้างรายงานและคัดลอก</button>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                const element = document.createElement("a");
                element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(report));
                element.setAttribute("download", `Hillkoff-Report-${new Date().toLocaleDateString("th-TH")}.txt`);
                element.style.display = "none";
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              }}><Download size={16} /> ดาวน์โหลดเป็นไฟล์</button>
            </section>

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
                <p>drivers: <b>{drivers.length}</b> records</p>
                <p>login_entries: <b>{(state.loginHistory || []).length}</b> records</p>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
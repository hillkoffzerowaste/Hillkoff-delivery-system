"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
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

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let supabase = null;

if (typeof window !== "undefined" && supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const initialDrivers = [
  { id: "D1", name: "Somchai", plate: "ชม 2145", zone: "เมืองเชียงใหม่", phone: "081-000-1001", lat: 18.7883, lng: 98.9853 },
  { id: "D2", name: "Wichai", plate: "ชม 6732", zone: "สันกำแพง / ดอยสะเก็ด", phone: "081-000-1002", lat: 18.9256, lng: 99.0853 },
  { id: "D3", name: "Anan", plate: "ชม 8291", zone: "หางดง / สันป่าตอง", phone: "081-000-1003", lat: 18.8564, lng: 99.0456 },
  { id: "D4", name: "Thanawat", plate: "ชม 1187", zone: "ลำพูน / ลำปาง", phone: "081-000-1004", lat: 18.5745, lng: 99.5025 },
  { id: "D5", name: "Kitti", plate: "ชม 4428", zone: "แม่ริม / เชียงราย", phone: "081-000-1005", lat: 19.2244, lng: 99.8585 }
];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUS = ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ", "ติดปัญหา", "ยกเลิก", "กลับมา"];
const statusColor = { "รอคนขับรับ": "#92400e", "กำลังส่ง": "#1d4ed8", "กำลังจัดส่ง": "#f59e0b", "ส่งสำเร็จ": "#166534", "ติดปัญหา": "#b91c1c", "ยกเลิก": "#dc2626", "กลับมา": "#22c55e" };

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
    auth: { role: "", name: "", phone: "", driverId: "", email: "" },
    loginHistory: [],
    onlineDrivers: {},
    driverLocations: {},
    lastSyncTime: null
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
      driverLocations: parsed.driverLocations || {}
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
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });

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
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  useEffect(() => setState(readState()), []);
  
  // Real-time subscription to Supabase changes
  useEffect(() => {
    if (!supabase) return;
    
    const channels = [];
    
    // Subscribe to orders changes
    channels.push(
      supabase
        .channel("orders_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          async () => {
            const { data } = await supabase.from("orders").select("*");
            setState(prev => ({ ...prev, orders: data || [] }));
          }
        )
        .subscribe()
    );
    
    // Subscribe to customers changes
    channels.push(
      supabase
        .channel("customers_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers" },
          async () => {
            const { data } = await supabase.from("customers").select("*");
            setState(prev => ({ ...prev, customers: data || [] }));
          }
        )
        .subscribe()
    );
    
    // Subscribe to drivers changes
    channels.push(
      supabase
        .channel("drivers_changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "drivers" },
          async () => {
            const { data } = await supabase.from("drivers").select("*");
            setState(prev => ({ ...prev, drivers: data || [] }));
          }
        )
        .subscribe()
    );
    
    // Cleanup subscriptions
    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, []);
  
  const syncToSupabase = async (currentState) => {
    if (!supabase) return;
    try {
      // Sync auth state for cross-device awareness
      if (currentState.auth?.phone && currentState.auth?.role) {
        await supabase.from("auth_state").upsert({
          phone: currentState.auth.phone,
          role: currentState.auth.role,
          name: currentState.auth.name || "",
          driver_id: currentState.auth.driverId || "",
          online: true,
          last_seen: new Date().toISOString()
        }, { onConflict: "phone" }).throwOnError();
      }
      // Sync customers
      if (currentState.customers?.length) {
        for (const customer of currentState.customers) {
          await supabase.from("customers").upsert(customer, { onConflict: "id" });
        }
      }
      // Sync orders
      if (currentState.orders?.length) {
        for (const order of currentState.orders) {
          await supabase.from("orders").upsert(order, { onConflict: "id" });
        }
      }
      // Sync drivers
      if (currentState.drivers?.length) {
        for (const driver of currentState.drivers) {
          await supabase.from("drivers").upsert(driver, { onConflict: "id" });
        }
      }
      // Sync login history
      if (currentState.loginHistory?.length) {
        const recentLogins = currentState.loginHistory.slice(0, 5);
        for (const entry of recentLogins) {
          await supabase.from("login_history").insert(entry).throwOnError().catch(() => {});
        }
      }
    } catch (error) {
      console.log("Supabase sync error:", error.message);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(STORE_KEY, JSON.stringify(state));
    // Auto-sync to Supabase on any data change
    syncToSupabase(state);
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
    setSyncStatus(`✅ บันทึกลูกค้า "${nextCustomer.name}" สำเร็จ`);
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
    const newAuthState = { role: "sales", name: loginForm.name.trim(), phone: loginForm.phone.trim(), driverId: "" };
    setAuth(newAuthState);
    const updatedState = {
      ...state,
      auth: newAuthState,
      loginHistory: [loginEntry, ...(state.loginHistory || [])].slice(0, 100)
    };
    setState(updatedState);
    // Sync auth state to Supabase
    if (supabase) {
      try {
        await supabase.from("auth_sessions").insert([{
          user_phone: loginForm.phone.trim(),
          role: "sales",
          name: loginForm.name.trim(),
          login_at: new Date().toISOString()
        }]).throwOnError();
      } catch (error) {
        console.log("Auth sync error:", error.message);
      }
    }
    setTab("sales");
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
    // Load latest data from Supabase on login
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("drivers")
          .select("*");
        if (!error && data?.length) {
          latestDrivers = data;
          setState(prev => ({
            ...prev,
            drivers: latestDrivers
          }));
        }
      } catch {
        // Fall back to local drivers list
      }
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
      const newAuthState = { role: "driver", name: found.name, phone, driverId: found.id };
      setAuth(newAuthState);
      const updatedState = {
        ...state,
        auth: newAuthState,
        loginHistory: [loginEntry, ...(state.loginHistory || [])].slice(0, 100),
        onlineDrivers: { ...state.onlineDrivers, [found.id]: new Date().getTime() }
      };
      setState(updatedState);
      // Sync auth state to Supabase
      if (supabase) {
        try {
          await supabase.from("auth_sessions").insert([{
            user_phone: phone,
            role: "driver",
            name: found.name,
            driver_id: found.id,
            login_at: new Date().toISOString()
          }]).throwOnError();
        } catch (error) {
          console.log("Auth sync error:", error.message);
        }
      }
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
    // Sync new driver to Supabase
    if (supabase) {
      try {
        await supabase.from("drivers").upsert(nextDriver, { onConflict: "id" }).throwOnError();
        await supabase.from("auth_sessions").insert([{
          user_phone: nextDriver.phone,
          role: "driver",
          name: nextDriver.name,
          driver_id: nextDriver.id,
          login_at: new Date().toISOString()
        }]).throwOnError();
        setSyncStatus(`✅ ลงทะเบียนคนขับ "${nextDriver.name}" สำเร็จ`);
      } catch (error) {
        setSyncStatus(`⚠️ ลงทะเบียนคนขับ "${nextDriver.name}" แล้ว (Supabase sync: ${error.message})`);
      }
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
      customerPhone: customer.phone,
      zone: customer.zone,
      address: customer.address,
      mapUrl: customer.mapUrl,
      window: orderForm.window,
      boxes: Number(orderForm.boxes || 0),
      cod: Number(orderForm.cod || 0),
      driverId: "",
      driverName: "",
      salesName: auth.name,
      salesPhone: auth.phone,
      status: "รอคนขับรับ",
      photo: "",
      checkInAt: "",
      deliveredAt: "",
      complaint: "",
      salesNote: orderForm.salesNote,
      createdAt: new Date().toISOString()
    };
    setPendingOrder(nextOrder);
    setShowOrderConfirm(true);
  };

  const confirmOrder = () => {
    if (!pendingOrder) return;
    setState(prev => ({ ...prev, orders: [pendingOrder, ...prev.orders] }));
    setOrderForm({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setShowOrderConfirm(false);
    setPendingOrder(null);
    setTab("driver");
  };

  const deleteOrder = (orderId) => {
    if (confirm("❌ ลบออเดอร์นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้")) {
      setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    }
  };

  const updateOrder = (id, patch) => setState(prev => ({ ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) }));
  const updateCustomer = (id, patch) => {
    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? { ...c, ...patch } : c) }));
    setEditingCustomerId(null);
  };
  const assignDriver = (id, nextDriverId) => updateOrder(id, {
    driverId: nextDriverId,
    status: nextDriverId ? "กำลังส่ง" : "รอคนขับรับ"
  });

  const uploadPod = async (order, file) => {
    if (!file) return;
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    updateOrder(order.id, { photo: file.name });
    try {
      setSyncStatus("กำลังเก็บรูป POD ไว้ท้องถิ่น...");
      // Photos are stored locally and synced to Supabase via syncToSupabase
      setSyncStatus("✅ บันทึกรูป POD สำเร็จ");
    } catch (error) {
      setSyncStatus(`บันทึกรูปไม่สำเร็จ: ${error.message}`);
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
              <div className="panel-head"><h1>เข้าสู่ระบบ</h1><span>ใช้ Supabase</span></div>
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
              <p className="login-note">ระบบจะโหลดข้อมูลลูกค้า ออเดอร์ และคนขับจาก Supabase หลังล็อกอิน</p>
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
    <>
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
          <>
            <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
              <button className="secondary" onClick={() => {
                const pwd = prompt("🔒 กรุณาใส่รหัสเพื่อรีเซ็ตแดชบอร์ด:\n(รหัส: 2532)");
                if (pwd === "2532") {
                  setState(prev => ({ ...prev, orders: [] }));
                  alert("✅ รีเซ็ตแดชบอร์ดสำเร็จ! ทั้งหมดกลับเป็น 0");
                } else if (pwd !== null) {
                  alert("❌ รหัสไม่ถูกต้อง");
                }
              }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>🔄 รีเซ็ตแดชบอร์ด</button>
            </div>
            <div className="sales-grid">
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

              {selectedCustomer && (
                <div style={{ marginTop: "16px", padding: "12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #dcfce7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                    <div>
                      <b style={{ fontSize: "14px", display: "block" }}>{selectedCustomer.name}</b>
                      <small style={{ color: "#666" }}>📞 {selectedCustomer.phone}</small><br/>
                      <small style={{ color: "#666" }}>👤 {selectedCustomer.contact}</small><br/>
                      <small style={{ color: "#666" }}>📍 {selectedCustomer.zone}</small><br/>
                      <small style={{ color: "#666" }}>{selectedCustomer.address}</small>
                    </div>
                  </div>
                  <button className="secondary" style={{ width: "100%", padding: "8px", fontSize: "12px" }} onClick={() => {
                    setEditingCustomerId(selectedCustomer.id);
                    setEditCustomerForm(selectedCustomer);
                  }}>✏️ แก้ไขข้อมูล</button>
                </div>
              )}
            </section>

            {editingCustomerId && (
              <section className="panel" style={{ background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <div className="panel-head"><h2>✏️ แก้ไขข้อมูลลูกค้า</h2><span>หมายเลข: {editingCustomerId}</span></div>
                <div className="form-grid">
                  <input value={editCustomerForm.name} onChange={e => setEditCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อร้าน/ลูกค้า" />
                  <input value={editCustomerForm.contact} onChange={e => setEditCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="ผู้ติดต่อ" />
                  <input value={editCustomerForm.phone} onChange={e => setEditCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" />
                  <select value={editCustomerForm.zone} onChange={e => setEditCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
                </div>
                <input value={editCustomerForm.address} onChange={e => setEditCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="ที่อยู่/ย่าน" />
                <input value={editCustomerForm.mapUrl} onChange={e => setEditCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
                <textarea value={editCustomerForm.note} onChange={e => setEditCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="หมายเหตุประจำลูกค้า" rows={3} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button className="secondary" onClick={() => setEditingCustomerId(null)}>ยกเลิก</button>
                  <button className="primary" onClick={() => updateCustomer(editingCustomerId, editCustomerForm)}>💾 บันทึก</button>
                </div>
              </section>
            )}

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
                    <a href={foundCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เปิดแผนที่</a>
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
              <input value={customerForm.mapUrl} onChange={e => setCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
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
                  .map(location => {
                    const currentOrder = orders.find(o => o.driverId === location.driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง"));
                    const customer = currentOrder ? customers.find(c => c.name === currentOrder.customerName) : null;
                    return (
                      <div key={location.driverId} style={{ padding: "12px", borderBottom: "1px solid #eee", marginBottom: "8px", background: "#f0f9ff", borderRadius: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <div>
                            <b style={{ fontSize: "14px", color: "#1a5490" }}>🚗 {location.driverName}</b>
                            <p style={{ margin: "4px 0", fontSize: "12px" }}>📱 {location.driverPhone} · {location.plate}</p>
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#059669", fontWeight: "bold" }}>🏪 {location.customerName}</p>
                            {customer && <p style={{ margin: "4px 0", fontSize: "11px", color: "#0891b2" }}>👤 ติดต่อ: {customer.contact}</p>}
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>📌 {location.address}</p>
                            {currentOrder && <p style={{ margin: "4px 0", fontSize: "11px", color: "#7c2d12", background: "#fed7aa", padding: "2px 6px", borderRadius: "3px", display: "inline-block" }}>📦 สถานะ: {currentOrder.status}</p>}
                            <p style={{ margin: "4px 0", fontSize: "11px", color: "#999" }}>⏰ เช็คอิน: {location.checkInTime}</p>
                          </div>
                          <span style={{ background: "#166534", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>🟢 Online</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📝 ออเดอร์ใหม่</h2><span>รอคนขับรับ {orders.filter(o => o.status === "รอคนขับรับ").length}</span></div>
              {orders.filter(o => o.status === "รอคนขับรับ").length === 0 ? (
                <p className="muted">ไม่มีออเดอร์ใหม่</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {orders.filter(o => o.status === "รอคนขับรับ").map(order => (
                    <div key={order.id} style={{ background: "#fef9e7", padding: "10px", borderRadius: "6px", borderLeft: "4px solid #f59e0b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: "13px" }}>{order.id} · {order.customerName}</b>
                        <small style={{ color: "#666" }}>{order.zone} · {order.boxes} กล่อง · ฿{money(order.cod)}</small>
                      </div>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px", marginLeft: "8px" }} onClick={() => deleteOrder(order.id)}>🗑️ ลบ</button>
                    </div>
                  ))}
                </div>
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
            </>
          )}

        {displayTab === "dispatch" && (
          <div className="dispatch-grid">
            <section className="panel">
              <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
                <button className="secondary" onClick={() => {
                  const pwd = prompt("🔒 กรุณาใส่รหัสเพื่อรีเซ็ตแดชบอร์ด:\n(รหัส: 2532)");
                  if (pwd === "2532") {
                    setState(prev => ({ ...prev, orders: [] }));
                    alert("✅ รีเซ็ตแดชบอร์ดสำเร็จ! ทั้งหมดกลับเป็น 0");
                  } else if (pwd !== null) {
                    alert("❌ รหัสไม่ถูกต้อง");
                  }
                }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>🔄 รีเซ็ตแดชบอร์ด</button>
              </div>
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
                  <span>สถานะ</span>
                  <span>COD</span>
                  <span></span>
                </div>
                {filteredOrders.map(order => {
                  const assignedDriver = drivers.find(driver => driver.id === order.driverId);
                  return (
                    <article key={order.id} className="dispatch-row">
                      <div><b>{order.id}</b><span>{order.window} · {order.boxes} กล่อง</span></div>
                      <div><b>{order.customerName}</b><span>{order.zone} · {order.address}</span>{order.complaint && <span style={{ marginLeft: "8px", background: "#fca5a5", color: "#7f1d1d", padding: "2px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: "bold" }}>⚠️ {order.complaint}</span>}</div>
                      <div className="status-stack">
                        <span className="status-chip" style={{ color: statusColor[order.status], background: `${statusColor[order.status]}14` }}>{order.status}</span>
                        <small>{assignedDriver ? assignedDriver.name : "รอคนขับรับ"}</small>
                      </div>
                      <strong>{money(order.cod)} บาท</strong>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>🗑️</button>
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
          <div style={{ display: "grid", gap: "16px" }}>
            {/* ส่วนข้อมูลคนขับ */}
            <section className="panel" style={{ background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                <div>
                  {drivers.filter(driver => driver.id === driverId).map(driver => (
                    <div key={driver.id}>
                      <b style={{ fontSize: "16px", display: "block" }}>👤 {driver.name}</b>
                      <small style={{ color: "#666" }}>🚗 {driver.plate} · 📍 {driver.zone}</small>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ fontSize: "20px", color: "#22c55e", display: "block" }}>{driverOrders.filter(o => o.status !== "ส่งสำเร็จ" && o.driverId === driverId).length}</b>
                  <small style={{ color: "#666" }}>งานที่ยังเหลือ</small>
                </div>
              </div>
            </section>

            {/* ส่วนรับออเดอร์ (Pending Orders Grid) */}
            {orders.filter(o => o.status === "รอคนขับรับ").length > 0 && (
              <section className="panel">
                <div className="panel-head"><h2>📦 รับออเดอร์ใหม่</h2><span>{orders.filter(o => o.status === "รอคนขับรับ").length} งาน</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                  {orders.filter(o => o.status === "รอคนขับรับ").map(order => {
                    const salesName = order.salesName || "ไม่มี";
                    const salesPhone = order.salesPhone || "-";
                    return (
                      <div key={order.id} style={{ background: "#fef9e7", padding: "12px", borderRadius: "8px", border: "2px solid #f59e0b", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <b style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>{order.id}</b>
                          <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                          <small style={{ color: "#666" }}>📍 {order.zone}</small><br/>
                          <small style={{ color: "#666" }}>⏰ {order.window}</small><br/>
                          <small style={{ color: "#666" }}>📦 {order.boxes} กล่อง · ฿{money(order.cod)}</small>
                        </div>
                        
                        <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #fcd34d" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>📞 ลูกค้า: {order.customerPhone}</small>
                          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                            <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>📱 โทร</a>
                            {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>🗺️ แผนที่</a>}
                          </div>
                        </div>
                        
                        <div style={{ background: "#f3e8ff", padding: "8px", borderRadius: "6px", border: "1px solid #d8b4fe" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>ฝ่ายขาย: {salesName}</small>
                          <small style={{ color: "#666", display: "block" }}>{salesPhone}</small>
                          <a href={`tel:${salesPhone}`} className="secondary" style={{ width: "100%", padding: "6px", fontSize: "11px", marginTop: "4px", display: "block", textAlign: "center", textDecoration: "none" }}>📞 โทรหาฝ่ายขาย</a>
                        </div>
                        
                        {order.address && <small style={{ color: "#999", borderTop: "1px solid #fcd34d", paddingTop: "8px" }}>📬 {order.address}</small>}
                        
                        <button className="primary" style={{ width: "100%", padding: "10px", fontWeight: "bold", fontSize: "13px" }} onClick={() => updateOrder(order.id, { driverId, driverName: drivers.find(d => d.id === driverId)?.name, status: "กำลังส่ง" })}>✓ รับออเดอร์นี้</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ส่วนออเดอร์ที่รับแล้ว (In-Progress Orders) */}
            {orders.filter(o => o.driverId === driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง" || o.status === "ส่งสำเร็จ")).length > 0 && (
              <section className="panel">
                <div className="panel-head"><h2>🚗 ออเดอร์ที่รับแล้ว</h2><span>{orders.filter(o => o.driverId === driverId && o.status !== "ส่งสำเร็จ").length} งาน · สำเร็จ {orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").length}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                  {orders.filter(o => o.driverId === driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง" || o.status === "ส่งสำเร็จ")).map(order => (
                    <div key={order.id} style={{ background: order.status === "ส่งสำเร็จ" ? "#f0fdf4" : "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${statusColor[order.status]}`, display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <b style={{ fontSize: "14px", display: "block", marginBottom: "4px", color: statusColor[order.status] }}>{order.id}</b>
                        <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                        <small style={{ color: "#666" }}>📍 {order.zone}</small><br/>
                        <small style={{ color: "#666" }}>⏰ {order.window}</small><br/>
                        <small style={{ color: "#666" }}>📦 {order.boxes} กล่อง · ฿{money(order.cod)}</small>
                      </div>
                      
                      <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #ddd" }}>
                        <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>📞 {order.customerPhone}</small>
                        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                          <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>📱 โทร</a>
                          {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>🗺️ แผนที่</a>}
                        </div>
                      </div>
                      
                      {order.address && <small style={{ color: "#999", borderTop: `1px solid ${statusColor[order.status]}`, paddingTop: "8px" }}>📬 {order.address}</small>}
                      
                      {/* Status Actions */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {order.status === "กำลังส่ง" && (
                          <>
                            <button className="primary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => updateOrder(order.id, { status: "กำลังจัดส่ง" })}>🚗 ไปถึงแล้ว</button>
                            <button className="secondary" style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} onClick={() => {
                              const reason = prompt("📝 เหตุผลในการยกเลิก:");
                              if (reason) updateOrder(order.id, { status: "ยกเลิก", complaint: reason });
                            }}>❌ ยกเลิก</button>
                          </>
                        )}
                        {order.status === "กำลังจัดส่ง" && (
                          <>
                            <label className="primary" style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", background: "#176b3a", color: "white" }}>
                              📷 ถ่ายรูป
                              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (evt) => {
                                    updateOrder(order.id, { photo: evt.target?.result });
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }} />
                            </label>
                            <button className="secondary" style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} onClick={() => {
                              const reason = prompt("📝 เหตุผลในการยกเลิก:");
                              if (reason) updateOrder(order.id, { status: "ยกเลิก", complaint: reason });
                            }}>❌ ยกเลิก</button>
                          </>
                        )}
                        {order.status === "กำลังจัดส่ง" && order.photo && (
                          <button className="primary" style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669" }} onClick={() => updateOrder(order.id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH") })}>✅ ส่งสำเร็จ</button>
                        )}
                        {order.status === "ส่งสำเร็จ" && (
                          <button className="secondary" style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1" }} onClick={() => updateOrder(order.id, { status: "กลับมา" })}>🏠 กลับมา</button>
                        )}
                      </div>

                      {/* Photo Preview */}
                      {order.photo && (
                        <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "2px solid #22c55e" }}>
                          <img src={order.photo} alt="proof" style={{ width: "100%", height: "auto" }} />
                        </div>
                      )}
                      
                      {order.status === "ส่งสำเร็จ" && (
                        <div style={{ background: "#f0fdf4", padding: "6px", borderRadius: "4px", fontSize: "11px", color: "#166534", fontWeight: "bold", textAlign: "center" }}>
                          ✅ {order.deliveredAt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {driverOrders.length === 0 && (
              <section className="panel" style={{ background: "#f3f4f6", textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontSize: "32px", margin: "0" }}>😴</p>
                <p style={{ color: "#666", margin: "8px 0 0" }}>ยังไม่มีออเดอร์ ลองรีเฟรช</p>
              </section>
            )}
          </div>
        )}

        {displayTab === "reports" && (
          <div className="report-grid">
            <section className="panel">
              <div className="panel-head"><h2>รายงานประจำวัน</h2><span>ข้อมูล Supabase</span></div>
              <div className="report-lines">
                <p>ออเดอร์ทั้งหมด <b>{orders.length}</b> งาน</p>
                <p>ส่งสำเร็จ <b>{report.delivered}</b> งาน</p>
                <p>COD รวม <b>{money(report.cod)}</b> บาท</p>
                <p>ร้องเรียน/ปัญหา <b>{report.complaints.length}</b> รายการ</p>
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
            {auth.email === "online_marketing@hillkoff.com" && (
              <section className="panel">
                <div className="panel-head"><h2>⚙️ Admin Control</h2><span>เฉพาะแอดมิน</span></div>
                <p style={{ color: "#666", fontSize: "12px", marginBottom: "12px" }}>ท่านเข้าสิทธิ์แอดมินเต็ม</p>
                <button className="secondary" style={{ background: "#dc2626", color: "white", width: "100%", padding: "10px" }} onClick={() => {
                  const pwd = prompt("🔒 กรุณาใส่รหัสเพื่อรีเซ็ตแดชบอร์ด:");
                  if (pwd === "2532") {
                    setState(prev => ({
                      ...prev,
                      orders: []
                    }));
                    alert("✅ รีเซ็ตแดชบอร์ดสำเร็จ! ทั้งหมดกลับเป็น 0");
                  } else if (pwd !== null) {
                    alert("❌ รหัสไม่ถูกต้อง");
                  }
                }}>🔄 รีเซ็ตแดชบอร์ด (รหัส: 2532)</button>
              </section>
            )}
            
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
              <div className="panel-head"><h2>📍 Driver Locations</h2><span>Live Map - Chiang Mai</span></div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className="secondary" onClick={() => setMapZoom(Math.max(10, mapZoom - 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>➖ Zoom Out</button>
                <button className="secondary" onClick={() => setMapZoom(Math.min(18, mapZoom + 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>➕ Zoom In</button>
                <span style={{ flex: 1, textAlign: "right", lineHeight: "32px", fontSize: "12px", color: "#666" }}>Zoom: {mapZoom}%</span>
              </div>
              
              <svg viewBox="0 0 400 400" style={{ width: "100%", height: "380px", border: "1px solid #ddd", borderRadius: "8px", background: "linear-gradient(135deg, #e0f2fe 0%, #f0fdf4 100%)", transform: `scale(${mapZoom / 100})`, transformOrigin: "top center" }}>
                <defs>
                  <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="1" fill="#d1d5db" opacity="0.4"/>
                  </pattern>
                  <linearGradient id="zoneGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: "#fef9e7", stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: "#fef3c7", stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                <rect width="400" height="400" fill="url(#dots)" />
                
                <rect x="10" y="20" width="120" height="100" fill="url(#zoneGrad1)" stroke="#d97706" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="70" y="75" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#b45309">เมืองเชียงใหม่</text>
                
                <rect x="200" y="50" width="100" height="80" fill="#dcfce7" stroke="#16a34a" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="250" y="100" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#166534">แม่ริม</text>
                
                <rect x="50" y="200" width="110" height="90" fill="#cffafe" stroke="#0891b2" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="105" y="250" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#164e63">ลำพูน</text>
                
                <rect x="250" y="250" width="130" height="100" fill="#f3e8ff" stroke="#a855f7" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="315" y="310" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#6b21a8">หางดง/สันป่า</text>
                
                {drivers.map((driver, idx) => {
                  const location = state.driverLocations?.[driver.id];
                  const isOnline = state.onlineDrivers?.[driver.id];
                  let x, y;
                  if (location && location.zone) {
                    const zoneMap = {
                      "เมืองเชียงใหม่": { x: 70, y: 70 },
                      "แม่ริม": { x: 250, y: 90 },
                      "ลำพูน": { x: 105, y: 245 },
                      "หางดง": { x: 315, y: 300 },
                      "สันป่าตอง": { x: 315, y: 280 }
                    };
                    const zonePos = zoneMap[location.zone] || { x: 70 + idx * 30, y: 70 + idx * 40 };
                    x = zonePos.x;
                    y = zonePos.y;
                  } else {
                    x = 70 + (idx % 2) * 150;
                    y = 70 + Math.floor(idx / 2) * 80;
                  }
                  
                  return (
                    <g key={driver.id}>
                      {isOnline && (
                        <>
                          <circle cx={x} cy={y} r="18" fill="#3b82f6" opacity="0.1" />
                          <circle cx={x} cy={y} r="12" fill="#3b82f6" opacity="0.2" />
                          <circle cx={x} cy={y} r="6" fill="#3b82f6" opacity="0.3" />
                        </>
                      )}
                      <circle cx={x} cy={y} r="8" fill={isOnline ? "#10b981" : "#9ca3af"} stroke="white" strokeWidth="2" />
                      <text x={x} y={y + 18} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1f2937">{driver.name.slice(0, 3)}</text>
                    </g>
                  );
                })}
              </svg>
              
              <div className="google-box" style={{ marginTop: "16px" }}>
                <b>👥 สถานะคนขับออนไลน์ ({Object.keys(state.onlineDrivers || {}).length})</b>
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
              <div className="panel-head"><h2>🔧 System Control</h2><span>เฉพาะฉุกเฉิน</span></div>
              <button className="primary wide" onClick={() => window.location.reload()} style={{ background: "#2563eb", color: "white", padding: "12px", fontSize: "14px", fontWeight: "bold" }}>
                🔄 รีโหลดระบบ
              </button>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "10px", textAlign: "center" }}>
                กรณีไม่สามารถรับงาน หรือเชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กด ปุ่มนี้เพื่อรีโหลดระบบ
              </p>
            </section>
          </div>
        )}
      </section>
    </main>

    {showOrderConfirm && pendingOrder && (
      <div style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}>
        <div style={{
          background: "white",
          padding: "24px",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          maxWidth: "500px",
          width: "90%"
        }}>
          <h2 style={{ marginTop: 0, color: "#1f2937" }}>📦 ยืนยันส่งออเดอร์</h2>
          <div style={{ background: "#f3f4f6", padding: "12px", borderRadius: "6px", margin: "12px 0" }}>
            <p><b>ลูกค้า:</b> {pendingOrder.customerName}</p>
            <p><b>พื้นที่:</b> {pendingOrder.zone}</p>
            <p><b>หน้าต่างเวลา:</b> {pendingOrder.window}</p>
            <p><b>จำนวนกล่อง:</b> {pendingOrder.boxes} กล่อง</p>
            <p><b>COD:</b> ฿{money(pendingOrder.cod)}</p>
            {pendingOrder.salesNote && <p><b>หมายเหตุ:</b> {pendingOrder.salesNote}</p>}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button className="secondary" style={{ flex: 1 }} onClick={() => setShowOrderConfirm(false)}>❌ ยกเลิก</button>
            <button className="primary" style={{ flex: 1 }} onClick={confirmOrder}>✅ ยืนยันส่ง</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
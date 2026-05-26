"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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

// Initialize Supabase client - will be set in useEffect
let supabase = null;

function initSupabase() {
  if (typeof window === "undefined") return null;
  if (supabase) return supabase;
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("เนยย Missing Supabase env vars:", { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
    return null;
  }
  
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log("เนยโ€ฆ Supabase initialized:", supabaseUrl);
  return supabase;
}

const initialDrivers = [];

const ZONES = ["เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย", "เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ”เน€เธเธ", "เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ“เน€เธยเน€เธยเน€เธย", "เน€เธโ€เน€เธเธเน€เธเธเน€เธเธเน€เธเธเน€เธโฌเน€เธยเน€เธยเน€เธโ€", "เน€เธเธเน€เธเธ’เน€เธยเน€เธโ€เน€เธย", "เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธโ€ขเน€เธเธเน€เธย", "เน€เธเธ…เน€เธเธ“เน€เธยเน€เธเธเน€เธย", "เน€เธเธ…เน€เธเธ“เน€เธยเน€เธเธ’เน€เธย", "เน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธ", "เน€เธยเน€เธเธเน€เธโฌเน€เธเธเน€เธเธ’"];
const STATUS = ["เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย", "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย", "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย", "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย", "เน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’", "เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย"];
const statusColor = { "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย": "#92400e", "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย": "#1d4ed8", "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย": "#f59e0b", "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย": "#166534", "เน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’": "#b91c1c", "เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย": "#dc2626" };

const initialCustomers = [];

const initialOrders = [];

function defaultState() {
  return {
    customers: initialCustomers,
    orders: initialOrders,
    drivers: initialDrivers,
    auth: { role: "", name: "", phone: "", driverId: "", email: "", token: "" },
    loginHistory: [],
    onlineDrivers: {},
    driverLocations: {},
    lastSyncTime: null
  };
}

function readState() {
  try {
    const raw = localStorage.getItem("hillkoff_auth");
    if (!raw) return defaultState();
    const savedAuth = JSON.parse(raw);
    return { ...defaultState(), auth: { ...defaultState().auth, ...(savedAuth || {}) } };
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

function osmPageUrl(lat, lng, zoom = 16) {
  if (lat == null || lng == null) return "";
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=${encodeURIComponent(zoom)}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
}

function osmEmbedUrl(lat, lng, zoom = 16) {
  if (lat == null || lng == null) return "";
  const delta = 0.01;
  const left = Number(lng) - delta;
  const right = Number(lng) + delta;
  const top = Number(lat) + delta;
  const bottom = Number(lat) - delta;
  const bbox = `${left},${bottom},${right},${top}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [driverId, setDriverId] = useState("D1");
  const [loginForm, setLoginForm] = useState({ role: "sales", name: "", phone: "" });
  const [rememberPhone, setRememberPhone] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย", address: "", mapUrl: "", note: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("hillkoff-last-phone");
    if (saved) {
      setLoginForm(p => ({ ...p, phone: saved }));
      setRememberPhone(true);
    }
    const savedSalesName = localStorage.getItem("hillkoff-last-sales-name");
    if (savedSalesName) setLoginForm(p => ({ ...p, name: savedSalesName }));
  }, []);
  const [driverForm, setDriverForm] = useState({ firstName: "", lastName: "", phone: "", vehicle: "เน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธย", plate: "", zone: "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย" });
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderZoneFilter, setOrderZoneFilter] = useState("all");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย", address: "", mapUrl: "", note: "" });
  const [orderForm, setOrderForm] = useState({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
  const [syncStatus, setSyncStatus] = useState("Local mode");
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [selectedMapDriverId, setSelectedMapDriverId] = useState("");
  
  // Use useRef instead of useState for isResettingOrders to ensure synchronous updates
  // useState is async and causes stale closures in syncToSupabase
  const isResettingOrdersRef = useRef(false);
  const pendingOrderUpdatesRef = useRef(new Set()); // Track orders being updated to debounce button clicks
  const [showDriverHistory, setShowDriverHistory] = useState(false);
  const previousOrderCountRef = useRef(0); // Track previous order count for new order notification
  const audioRef = useRef(null); // Reference to audio element for notification sound

  const buildLineMessageForOrder = (order) => {
    const lines = [];
    lines.push(`เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย เนยโ€ฆ`);
    lines.push(`เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย: ${order.id}`);
    if (order.customerName) lines.push(`เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’: ${order.customerName}`);
    if (order.customerPhone) lines.push(`เน€เธยเน€เธโ€”เน€เธเธ: ${order.customerPhone}`);
    if (order.address) lines.push(`เน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธย: ${order.address}`);
    if (order.zone) lines.push(`เน€เธยเน€เธยเน€เธย: ${order.zone}`);
    if (order.window) lines.push(`เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’: ${order.window}`);
    if (order.boxes != null) lines.push(`เน€เธยเน€เธเธ“เน€เธยเน€เธเธเน€เธย: ${order.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย`);
    lines.push(`COD: เน€เธเธ${money(order.cod || 0)}`);
    if (order.deliveredAt) lines.push(`เน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’: ${order.deliveredAt}`);
    if (order.mapUrl) lines.push(`เน€เธยเน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย: ${order.mapUrl}`);
	    if (order.photo) lines.push(`POD: (เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธโ€”)`);
	    return lines.join("\n");
	  };

	  const dataUrlToFile = async (dataUrl, fileName) => {
	    const res = await fetch(dataUrl);
	    const blob = await res.blob();
	    const ext = (blob.type || "").split("/").pop() || "jpg";
	    return new File([blob], `${fileName}.${ext}`, { type: blob.type || "image/jpeg" });
	  };

	  const shareOrderToLine = (order) => {
	    const text = buildLineMessageForOrder(order);
	    if (navigator?.share && order?.photo?.startsWith?.("data:")) {
	      (async () => {
	        try {
	          const file = await dataUrlToFile(order.photo, `POD-${order.id}`);
	          if (navigator.canShare?.({ files: [file] })) {
	            await navigator.share({ text, files: [file] });
	            updateOrder(order.id, { sharedToLine: true });
	            return;
	          }
	          alert("เธญเธธเธเธเธฃเธ“เน/เธเธฃเธฒเธงเน€เธเธญเธฃเนเธเธตเนเนเธกเนเธฃเธญเธเธฃเธฑเธเธเธฒเธฃเนเธเธฃเนเนเธเธเนเธเธเนเธเธฅเนเธญเธฑเธ•เนเธเธกเธฑเธ•เธด เธเธฃเธธเธ“เธฒเน€เธเธดเธ”เธเนเธฒเธเธกเธทเธญเธ–เธทเธญ (Chrome/Safari) เนเธฅเนเธงเธเธ”เนเธเธฃเนเธญเธตเธเธเธฃเธฑเนเธ เธซเธฃเธทเธญเนเธเธเธฃเธนเธเน€เธญเธเนเธ LINE");
	        } catch {}
	        navigator.share({ text }).catch(() => {});
	      })();
	      return;
	    }
	    if (navigator?.share) {
	      navigator.share({ text }).catch(() => {});
	      return;
	    }
	    const url = `line://msg/text/${encodeURIComponent(text)}`;
	    try { window.location.href = url; } catch {}
	  };

  useEffect(() => setState(readState()), []);

  // Force initial fetch for driver role
  useEffect(() => {
    if (state.auth?.role !== "driver") return;
    console.log("เนยยโ€” Driver detected - forcing initial fetch...");
    refreshFromSupabase();
  }, [state.auth?.role]);

  useEffect(() => {
    if (state.auth?.role !== "driver") return;
    if (!driverId) return;
    if (typeof window === "undefined") return;
    if (!navigator?.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const driver = (state.drivers || []).find(d => d.id === driverId);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const timestamp = new Date().getTime();

        setState(prev => ({
          ...prev,
          driverLocations: {
            ...(prev.driverLocations || {}),
            [driverId]: {
              ...(prev.driverLocations?.[driverId] || {}),
              driverId,
              driverName: driver?.name || prev.driverLocations?.[driverId]?.driverName || "",
              plate: driver?.plate || prev.driverLocations?.[driverId]?.plate || "",
              zone: driver?.zone || prev.driverLocations?.[driverId]?.zone || "",
              lat,
              lng,
              timestamp
            }
          }
        }));
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );

    return () => {
      try { navigator.geolocation.clearWatch(watchId); } catch {}
    };
  }, [state.auth?.role, driverId, state.drivers]);
  
  // Helper function to convert snake_case from Supabase to camelCase
  const convertToCamelCase = (obj) => {
    if (!obj) return obj;
    const converted = {};
    for (const key in obj) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      converted[camelKey] = obj[key];
    }
    return converted;
  };

  // Function to play notification sound when new orders arrive
  const playNotificationSound = () => {
    try {
      // Create a simple beep sound using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const now = audioContext.currentTime;
      
      // Create oscillator for beep
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      // Set frequency and duration
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(800, now + 0.1);
      osc.frequency.setValueAtTime(600, now + 0.1);
      osc.frequency.setValueAtTime(600, now + 0.2);
      
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      
      osc.start(now);
      osc.stop(now + 0.2);
      
      console.log("เนยโ€ย Notification sound played");
    } catch (e) {
      console.error("เนยย Error playing notification sound:", e);
    }
  };

  // Polling mechanism for real-time sync (fallback if Realtime fails)
  useEffect(() => {
    // Initialize Supabase on component mount
    supabase = initSupabase();
    console.log("Component mounted, supabase:", !!supabase);
  }, []);

  const refreshChat = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .order("id", { ascending: false })
        .limit(50);
      if (error) return;
      setChatMessages((data || []).slice().reverse());
    } catch {}
  };

  useEffect(() => {
    if (!chatOpen) return;
    if (!supabase) supabase = initSupabase();
    refreshChat();
    const t = setInterval(refreshChat, 3000);
    return () => clearInterval(t);
  }, [chatOpen]);

  const sendChat = async () => {
    const text = (chatText || "").trim();
    if (!text) return;
    if (!supabase) supabase = initSupabase();
    if (!supabase) {
      alert("เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธโ€ขเน€เธยเน€เธเธ Supabase เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธย");
      return;
    }
    setChatText("");
    const payload = {
      sender_role: state.auth?.role || "",
      sender_name: state.auth?.name || "",
      sender_phone: state.auth?.phone || "",
      message: text
    };
    const { error } = await supabase.from("chat_messages").insert(payload);
    if (error) {
      alert(`เนยย เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${error.message}`);
      return;
    }
    await refreshChat();
  };

  // Polling mechanism for real-time sync
  const refreshFromSupabase = async () => {
    if (!supabase) {
      console.warn("เนยย เนเธย Supabase not initialized yet");
      return;
    }
    
    // Skip refresh during reset to prevent old data from being restored
    if (isResettingOrdersRef.current) {
      console.log("เนยเธเนเธย Skipping refreshFromSupabase during reset");
      return;
    }
    
    try {
      // Fetch latest data from Supabase
      const { data: supabaseOrders, error: ordersError } = await supabase.from("orders").select("*");
      const { data: supabaseCustomers, error: customersError } = await supabase.from("customers").select("*");
      // Note: drivers table is intentionally empty by design - no fetch needed
      const { data: supabaseDriverLocations, error: driverLocationsError } = await supabase.from("driver_locations").select("*");

      if (ordersError) setSyncStatus?.(`เนยย เนเธย Supabase orders error: ${ordersError.message}`);
      if (customersError) console.warn("เนยย เนเธย Supabase customers pull error:", customersError.message);
      if (driverLocationsError) console.warn("เนยย เนเธย Supabase driver_locations pull error:", driverLocationsError.message);
      
      console.log("เนยโ€เธ… Pulled from Supabase:", { orders: supabaseOrders?.length, customers: supabaseCustomers?.length, driver_locations: supabaseDriverLocations?.length });
      
      setState(prev => {
        let changed = false;
        const newState = { ...prev };
        
        // Skip all merging during reset to prevent old data from being restored
        if (isResettingOrdersRef.current) {
          console.log("เนยเธเนเธย [RESET] Skipping merge during reset - isResettingOrders = true");
          return prev;
        }
        
        // For orders: merge - keep local orders, update status/data from Supabase
        if (Array.isArray(supabaseOrders) && Array.isArray(prev.orders)) {
          console.log(`เนยโ€ย Merging orders: ${prev.orders.length} local + ${supabaseOrders.length} from Supabase`);
          const merged = [...prev.orders];
          let newOrdersAdded = 0;
          const currentDriverId = prev.auth?.driverId || "";
          
          for (const sbOrder of supabaseOrders) {
            // Convert snake_case to camelCase
            const order = convertToCamelCase(sbOrder);
            const idx = merged.findIndex(o => o.id === order.id);
            if (idx >= 0) {
              // Update existing orders - but preserve local status/photo changes that haven't synced yet
              const localOrder = merged[idx];
              // Keep local status if it's more advanced (e.g., local "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย" shouldn't revert to "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย")
              const statusHierarchy = { "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย": 0, "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย": 1, "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย": 2, "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย": 3, "เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย": 4 };
              const shouldKeepLocalStatus = (statusHierarchy[localOrder.status] || -1) > (statusHierarchy[order.status] || -1);
              const photo = localOrder.photo || order.photo; // Keep photo if either has it
              
              merged[idx] = { ...order, ...localOrder, status: shouldKeepLocalStatus ? localOrder.status : order.status, photo };
              console.log(`เนยโ€ย Updated order ${order.id}${shouldKeepLocalStatus ? ` (kept local status: ${localOrder.status})` : ""}`);
            } else if (prev.auth?.role === "driver") {
              // Driver page: STRICT FILTER - only add available orders OR orders already assigned to this driver
              const isAvailable = !order.driverId || order.driverId === "" || order.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย";
              const isMyOrder = order.driverId === currentDriverId;
              
              if (isAvailable || isMyOrder) {
                merged.push(order);
                if (isAvailable) newOrdersAdded++;
                console.log(`เนยโ€ข [NEW ORDER] Added order ${order.id} for driver - ${order.customerName} ${isMyOrder ? "(already assigned)" : "(available)"}`);
              } else {
                console.log(`เนยย [FILTERED] Skipping order ${order.id} (assigned to different driver: ${order.driverId})`);
              }
            } else if (prev.auth?.role === "sales") {
              // Sales page: ADD all new orders from Supabase
              merged.push(order);
              newOrdersAdded++;
              console.log(`เนยโ€ข [NEW ORDER] Added new order ${order.id} for sales - ${order.customerName}`);
            } else {
              // Skip in other cases to prevent deleted orders from being pulled back
              console.log(`เนยเธเนเธย Skipping order ${order.id} from Supabase (not applicable for current role)`);
            }
          }
          
          // Play sound notification if new available orders were added (not already assigned ones)
          if (newOrdersAdded > 0 && previousOrderCountRef.current < merged.filter(o => !o.driverId || o.driverId === "" || o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").length) {
            console.log(`เนยโ€โ€ ${newOrdersAdded} new available order(s) detected! Playing notification sound...`);
            playNotificationSound();
          }
          previousOrderCountRef.current = merged.length;
          
          if (JSON.stringify(prev.orders) !== JSON.stringify(merged)) {
            newState.orders = merged;
            changed = true;
          }
        }
        
        // For customers: merge similarly
        if (supabaseCustomers && prev.customers) {
          const merged = [...prev.customers];
          for (const sbCustomer of supabaseCustomers) {
            // Convert snake_case to camelCase
            const customer = convertToCamelCase(sbCustomer);
            const idx = merged.findIndex(c => c.id === customer.id);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...customer };
            } else {
              merged.push(customer);
            }
          }
          const localStr = JSON.stringify(prev.customers);
          const newStr = JSON.stringify(merged);
          if (localStr !== newStr) {
            newState.customers = merged;
            changed = true;
            console.log("เนยโ€เธ Customers merged from Supabase");
          }
        }
        
        // Note: Drivers merge intentionally skipped - drivers table is empty by design

        // For driver locations: replace (DB is source of truth when available)
        if (Array.isArray(supabaseDriverLocations) && supabaseDriverLocations.length) {
          const next = { ...(prev.driverLocations || {}) };
          for (const row of supabaseDriverLocations) {
            next[row.driver_id] = {
              ...(next[row.driver_id] || {}),
              driverId: row.driver_id,
              driverName: row.driver_name || "",
              plate: row.plate || "",
              zone: row.zone || "",
              lat: row.lat,
              lng: row.lng,
              timestamp: row.timestamp
            };
          }
          const localStr = JSON.stringify(prev.driverLocations || {});
          const newStr = JSON.stringify(next);
          if (localStr !== newStr) {
            newState.driverLocations = next;
            changed = true;
          }
        }
        
        return changed ? newState : prev;
      });
    } catch (error) {
      console.log("เนยย เนเธย Polling error:", error);
    }
  };

  useEffect(() => {
    if (!supabase) {
      console.warn("เนยย เนเธย Supabase not initialized yet");
      return;
    }
    
    // When reset ends, delay first poll to ensure delete completed
    const delayFirstPoll = isResettingOrdersRef.current ? 0 : 3000;
    
    const pollInterval = setInterval(() => {
      // Skip polling during reset to prevent old data from being pulled back
      if (!isResettingOrdersRef.current) {
        refreshFromSupabase();
      }
    }, 2000); // Poll every 2 seconds (allow Supabase time to save)
    
    // If reset just ended, add extra delay before first poll
    let timeout;
    if (!isResettingOrdersRef.current && delayFirstPoll > 0) {
      console.log("เนยโ€ย [RESET-RECOVERY] Delaying first poll by 3s to let delete complete...");
      timeout = setTimeout(() => {
        refreshFromSupabase();
      }, delayFirstPoll);
    }
    
    // Set up real-time subscription for orders
    const subscription = supabase
      .channel("orders-updates")
      .on(
        "postgres_changes",
        {
          event: "*", // Listen for INSERT, UPDATE, DELETE
          schema: "public",
          table: "orders"
        },
        (payload) => {
          console.log("เนยโ€เธ Real-time orders update:", payload.eventType, payload.new?.id);
          
          // Check if an order was accepted by another driver
          if (payload.eventType === "UPDATE" && payload.new?.driverId) {
            const oldOrder = payload.old;
            const newOrder = payload.new;
            
            // If driverId changed from empty to assigned (someone accepted the order)
            if ((!oldOrder?.driverId || oldOrder.driverId === "") && newOrder.driverId) {
              const assignedDriver = state.drivers?.find(d => d.id === newOrder.driverId);
              const driverName = assignedDriver?.name || newOrder.driverName || newOrder.driverId;
              console.log(`เนยยเธ Order ${newOrder.id} was accepted by ${driverName}`);
              setSyncStatus(`เนยโ€เธ ${newOrder.id} เน€เธโ€“เน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธยเน€เธโ€เน€เธเธ ${driverName}`);
              playNotificationSound();
              
              // Show notification to other drivers
              if (state.auth?.role === "driver" && state.auth?.driverId !== newOrder.driverId) {
                console.log(`เนยเธเนเธย Notifying other drivers about accepted order`);
              }
            }
          }
          
          // Refresh data to keep everyone in sync
          refreshFromSupabase();
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(pollInterval);
      if (timeout) clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, []);
  
  const upsertOrderToSupabase = async (order) => {
    if (!supabase) return { ok: false, error: "Supabase not initialized" };
    try {
      const orderForDB = {
               id: order.id,
                customerId: order.customerId || "",
                customerName: order.customerName || "",
                customerPhone: order.customerPhone || "",
        zone: order.zone || "",
        address: order.address || "",
        mapUrl: order.mapUrl || "",
        window: order.window || "",
        boxes: Number(order.boxes || 0),
        cod: Number(order.cod || 0),
                driverId: order.driverId || "",
                driverName: order.driverName || "",
                salesName: order.salesName || "",
                salesPhone: order.salesPhone || "",
        status: order.status || "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย",
        photo: order.photo || "",
        checkInAt: order.checkInAt || "",
        deliveredAt: order.deliveredAt || "",
        complaint: order.complaint || "",
        salesNote: order.salesNote || "",
        createdAt: order.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase.from("orders").upsert(orderForDB, { onConflict: "id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  };
  
  const syncToSupabase = async (currentState) => {
    // CRITICAL: Don't sync during reset - prevents deleted orders from being re-created
    if (isResettingOrdersRef.current) {
      console.log("เนยเธเนเธย [RESET] Skipping syncToSupabase - reset is in progress");
      return;
    }
    
    if (!supabase) {
      console.warn("เนยย Supabase not initialized");
      return;
    }
    console.log("เนยยย syncToSupabase called - orders count:", currentState.orders?.length);
    
    try {
      // Skip auth_state sync - table doesn't exist
      // if (currentState.auth?.phone && currentState.auth?.role) { ... }
      
      // Sync customers
      if (currentState.customers?.length) {
        for (const customer of currentState.customers) {
          try {
            // Convert camelCase to snake_case for Supabase
            const customerForDB = {
              id: customer.id,
              name: customer.name || "",
              contact: customer.contact || "",
              phone: customer.phone || "",
              zone: customer.zone || "",
              address: customer.address || "",
              mapUrl: customer.mapUrl || "",
              note: customer.note || ""
            };
            
            const { error } = await supabase.from("customers").upsert(customerForDB, { onConflict: "id" });
            if (error) console.error("เนยย Customer sync error:", error.message, customer.id);
          } catch (e) {
            console.error("เนยย Exception syncing customer:", customer.id, e.message);
          }
        }
        console.log("เนยโ€ฆ Customers synced:", currentState.customers.length);
      }
      
      // Sync orders (always sync, even if empty)
      console.log("เนยโ€เธ Syncing orders to Supabase:", currentState.orders?.length || 0);
      if (currentState.orders && Array.isArray(currentState.orders)) {
        for (const order of currentState.orders) {
          try {
            // Convert camelCase to snake_case for Supabase
            const orderForDB = {
              id: order.id,
               customerId: order.customerId || "",
               customerName: order.customerName || "",
              zone: order.zone || "",
              address: order.address || "",
               mapUrl: order.mapUrl || "",
              window: order.window || "",
              boxes: order.boxes || 0,
              cod: order.cod || 0,
               driverId: order.driverId || "",
              status: order.status || "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย",
              photo: order.photo || "",
               checkInAt: order.checkInAt || "",
               deliveredAt: order.deliveredAt || "",
              complaint: order.complaint || "",
               salesNote: order.salesNote || "",
               createdAt: order.createdAt || new Date().toISOString(),
               updatedAt: new Date().toISOString()
             };
            
            const { error, status } = await supabase.from("orders").upsert(orderForDB, { onConflict: "id" });
            if (error) {
              console.error("เนยย Order sync error:", error.message, "Order:", order.id);
            } else {
              console.log(`เนยโ€ฆ Order synced: ${order.id} (status: ${status})`);
            }
          } catch (e) {
            console.error("เนยย Exception syncing order:", order.id, e.message);
          }
        }
        console.log("เนยโ€ฆ All orders synced to Supabase");
      }
      
       // Note: Drivers table is intentionally empty by design - no driver sync needed

       // Sync driver locations (optional table)
       if (currentState.driverLocations && Object.keys(currentState.driverLocations).length) {
         for (const did of Object.keys(currentState.driverLocations)) {
           const loc = currentState.driverLocations[did];
           if (!loc?.lat || !loc?.lng) continue;
           try {
             const payload = {
               driver_id: did,
               driver_name: loc.driverName || "",
               plate: loc.plate || "",
               zone: loc.zone || "",
               lat: Number(loc.lat),
               lng: Number(loc.lng),
               timestamp: Number(loc.timestamp || Date.now())
             };
             const { error } = await supabase.from("driver_locations").upsert(payload, { onConflict: "driver_id" });
             if (error) console.warn("เนยย เนเธย driver_locations sync skipped:", error.message);
           } catch (e) {
             console.warn("เนยย เนเธย driver_locations sync exception:", e?.message || String(e));
           }
         }
       }
       
       // Clear pending order updates after successful sync
       pendingOrderUpdatesRef.current.clear();
       
       // login_history table is optional; intentionally skipped.
    } catch (error) {
      console.error("เนยย Supabase sync error:", error);
    }
  };

  useEffect(() => {
    // Auto-sync to Supabase on any data change (but skip during reset)
    // Data is NOT stored in localStorage - Supabase is the only source of truth
    if (!isResettingOrdersRef.current) {
      console.log("เนยโ€ย State changed - calling syncToSupabase with orders:", state.orders?.length || 0);
      syncToSupabase(state);
    }
  }, [
    JSON.stringify(state.orders),
    JSON.stringify(state.customers),
    JSON.stringify(state.auth)
  ]);
  useEffect(() => {
    if (state.auth?.driverId) setDriverId(state.auth.driverId);
  }, [state.auth?.driverId]);

  const customers = state.customers;
  const orders = state.orders;
  const drivers = state.drivers?.length ? state.drivers : initialDrivers;
  const auth = state.auth || {};
  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId) || customers[0];
  // Driver can only see: (1) available orders (no driverId assigned), or (2) orders assigned to them specifically
  const driverOrders = orders.filter(order => {
    const isAvailable = !order.driverId || order.driverId === "";
    const isAssignedToMe = order.driverId === driverId;
    return isAvailable || isAssignedToMe;
  });

  const report = useMemo(() => {
    const delivered = orders.filter(order => order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย");
    const complaints = orders.filter(order => order.complaint);
    const cod = orders.reduce((sum, order) => sum + Number(order.cod || 0), 0);
    // Note: driverScore is now skipped since drivers table is intentionally empty
    return { delivered: delivered.length, complaints, cod, driverScore: [] };
  }, [orders]);

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
    setCustomerForm({ name: "", contact: "", phone: "", zone: "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย", address: "", mapUrl: "", note: "" });
    setSyncStatus(`เนยโ€ฆ เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ "${nextCustomer.name}" เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย`);
  };

  const setAuth = authPatch => setState(prev => ({ ...prev, auth: { ...(prev.auth || {}), ...authPatch } }));

  const loginSales = async () => {
    if (!loginForm.name.trim() || !loginForm.phone.trim()) return;

    let json;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "sales",
          name: loginForm.name.trim(),
          phone: loginForm.phone.trim()
        })
      });
      json = await res.json();
    } catch (e) {
      setSyncStatus(`เนยย Login error: ${e.message || "network/server error"}`);
      return;
    }
    if (!json.ok) {
      setSyncStatus(`เนยย ${json.error || "เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย"}`);
      return;
    }

    const d = json.data || {};
    const loginEntry = {
      id: `L${Date.now()}`,
      role: "sales",
      name: d.name || loginForm.name.trim(),
      phone: loginForm.phone.trim(),
      loginAt: new Date().toLocaleString("th-TH"),
      loginTime: new Date().getTime()
    };
    const newAuthState = {
      role: "sales",
      name: d.name || loginForm.name.trim(),
      phone: loginForm.phone.trim(),
      driverId: "",
      email: state.auth?.email || "",
      token: d.token || ""
    };
    localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
    setState(prev => ({
      ...prev,
      auth: newAuthState,
      loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100)
    }));
    setTab("sales");
  };

  const loginDriver = async () => {
    if (!loginForm.phone.trim()) return;
    const phone = loginForm.phone.trim().replace(/\D/g, "");

    let json;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "driver", phone })
      });
      json = await res.json();
    } catch (e) {
      setSyncStatus(`เนยย Login error: ${e.message || "network/server error"}`);
      return;
    }

    if (json.ok) {
      const d = json.data || {};
      const loginEntry = {
        id: `L${Date.now()}`,
        role: "driver",
        name: d.name || phone,
        phone,
        driverId: d.driverId || "",
        loginAt: new Date().toLocaleString("th-TH"),
        loginTime: new Date().getTime()
      };
      setDriverId(d.driverId || "");
      const newAuthState = { role: "driver", name: d.name || phone, phone, driverId: d.driverId || "", email: state.auth?.email || "", token: d.token || "" };
      localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
      setState(prev => ({
        ...prev,
        auth: newAuthState,
        loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100),
        onlineDrivers: d.driverId ? { ...prev.onlineDrivers, [d.driverId]: new Date().getTime() } : prev.onlineDrivers
      }));
      // const saved = await upsertOrderToSupabase(pendingOrder);
      // if (!saved.ok) {
      //   setSyncStatus(`เนยย เนเธย เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธเธ…เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย (เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ’เน€เธเธ sync เน€เธโ€ขเน€เธยเน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธย): ${saved.error}`);
      // }

      setTab("driver");
      return;
    }
    setDriverForm(prev => ({ ...prev, phone }));
    setAuth({ role: "driver-register", name: "", phone, driverId: "", email: state.auth?.email || "", token: "" });
  };

  const registerDriver = async () => {
    if (!driverForm.firstName.trim() || !driverForm.phone.trim() || !driverForm.plate.trim()) return;
    const normalizedPhone = driverForm.phone.trim().replace(/\D/g, "");
    const nextDriver = {
      id: `DRV_${normalizedPhone || Date.now()}`,
      firstName: driverForm.firstName.trim(),
      lastName: driverForm.lastName.trim(),
      name: `${driverForm.firstName.trim()} ${driverForm.lastName.trim()}`.trim(),
      phone: normalizedPhone || driverForm.phone.trim(),
      vehicle: driverForm.vehicle.trim(),
      plate: driverForm.plate.trim(),
      zone: driverForm.zone,
      lat: 18.7883,
      lng: 98.9853,
      createdAt: new Date().toISOString()
    };

    // Persist driver to Supabase so future logins don't require re-register
    if (!supabase) supabase = initSupabase();
    try {
      const { error } = await supabase.from("drivers").upsert({
        id: nextDriver.id,
        firstName: nextDriver.firstName,
        lastName: nextDriver.lastName,
        name: nextDriver.name,
        phone: nextDriver.phone,
        vehicle: nextDriver.vehicle,
        plate: nextDriver.plate,
        zone: nextDriver.zone,
        lat: nextDriver.lat,
        lng: nextDriver.lng,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { onConflict: "id" });
      if (error) throw error;
    } catch (e) {
      setSyncStatus(`เนยย เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธ…เน€เธย Supabase เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${e.message || e}`);
      return;
    }

    // Create session token via API (records login log)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "driver", phone: nextDriver.phone })
      });
      const json = await res.json();
      if (json?.ok) {
        const d = json.data || {};
        const newAuthState = { role: "driver", name: d.name || nextDriver.name, phone: nextDriver.phone, driverId: d.driverId || nextDriver.id, email: state.auth?.email || "", token: d.token || "" };
        localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
        setAuth(newAuthState);
        setDriverId(newAuthState.driverId || nextDriver.id);
      }
    } catch {}
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
      auth: { role: "driver", name: nextDriver.name, phone: nextDriver.phone, driverId: nextDriver.id, email: prev.auth?.email || "", token: prev.auth?.token || "" },
      loginHistory: [loginEntry, ...(prev.loginHistory || [])].slice(0, 100),
      onlineDrivers: { ...prev.onlineDrivers, [nextDriver.id]: new Date().getTime() }
    }));
    setDriverId(nextDriver.id);
    setDriverForm({ firstName: "", lastName: "", phone: "", vehicle: "เน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธย", plate: "", zone: "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย" });
    setTab("driver");
    // Driver synced automatically via syncToSupabase
    setSyncStatus(`เนยโ€ฆ เน€เธเธ…เน€เธยเน€เธโ€”เน€เธเธเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย "${nextDriver.name}" เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย`);
  };

  const logout = () => {
    setState(prev => {
      const updated = { ...prev.onlineDrivers };
      if (auth.driverId) delete updated[auth.driverId];
      return { ...prev, onlineDrivers: updated };
    });
    localStorage.removeItem("hillkoff_auth");
    setAuth({ role: "", name: "", phone: "", driverId: "", email: state.auth?.email || "", token: "" });
  };

  const createOrder = async () => {
    if (!orderForm.customerName.trim()) {
      setSyncStatus("เนยย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’");
      return;
    }

    let customer = customers.find(c => c.name.toLowerCase() === orderForm.customerName.toLowerCase());
    
    // If customer doesn't exist, create new one automatically
    if (!customer) {
      customer = {
        id: `C${Date.now()}`,
        name: orderForm.customerName.trim(),
        contact: "",
        phone: "",
        zone: ZONES[0],
        address: "",
        mapUrl: "",
        note: ""
      };
      // Auto-save new customer
      setState(prev => ({ ...prev, customers: [customer, ...prev.customers] }));
      setSyncStatus(`เนยโ€ฆ เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธย "${customer.name}" เน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”`);
    }
    
    const id = `DO-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${String(orders.length + 1).padStart(3, "0")}`;
    const nextOrder = {
      id,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || "",
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
      status: "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย",
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

  const confirmOrder = async () => {
    if (!pendingOrder) return;
    
    console.log("เนยโ€เธ confirmOrder: Adding order to state", pendingOrder.id);
    setState(prev => {
      const updated = { ...prev, orders: [pendingOrder, ...prev.orders] };
      console.log("เนยโ€เธ confirmOrder: State updated - total orders:", updated.orders.length);
      console.log("เนยโ€เธ confirmOrder: Orders in state:", updated.orders.map(o => o.id));
      return updated;
    });
    
    setOrderForm({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setShowOrderConfirm(false);
    setPendingOrder(null);
    setSyncStatus(`เนยเธ“ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธ”เน€เธเธ...`);
    
    // Wait longer for Supabase to actually save before switching tabs (deprecated)
    (async () => {
      console.log("เนยเธ Waiting 2000ms complete");
      setTab("driver");
      setSyncStatus(`เนยโ€ฆ เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${pendingOrder.id}" เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธ”เน€เธเธเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย`);
      // Let polling refresh the data
      await refreshFromSupabase();
    })();
  };

  const deleteOrder = (orderId) => {
    if (confirm("เนยย เน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธเน€เธย? เน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธโ€”เน€เธเธ“เน€เธยเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ’เน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธยเน€เธยเน€เธโ€เน€เธย")) {
      setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    }
  };

  const updateOrder = (id, patch) => {
    console.log(`เนยโ€ย updateOrder: ${id}`, patch);
    setState(prev => {
      const updated = { ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) };
      
      // Auto-sync to Supabase immediately
      if (supabase) {
        const order = updated.orders.find(o => o.id === id);
        if (order) {
          (async () => {
            const { ok, error } = await upsertOrderToSupabase(order);
            if (!ok) {
              console.error(`เนยย Failed to sync order ${id}:`, error);
            } else {
              console.log(`เนยโ€ฆ Order ${id} synced to Supabase`);
            }
          })();
        }
      }
      
      return updated;
    });
    setTimeout(() => {
      try { pendingOrderUpdatesRef.current.delete(id); } catch {}
    }, 2000);
  };
  const updateCustomer = (id, patch) => {
    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? { ...c, ...patch } : c) }));
    setEditingCustomerId(null);
  };
  const assignDriver = (id, nextDriverId) => updateOrder(id, {
    driverId: nextDriverId,
    status: nextDriverId ? "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" : "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย"
  });

  const uploadPod = async (order, file) => {
  if (!file) return;
  try {
    setSyncStatus("เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธเธฃเธนเธ POD เนเธเน€เธเธฃเธทเนเธญเธ...");

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read failed"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });

    if (!dataUrl) throw new Error("read failed");
    updateOrder(order.id, { photo: dataUrl, podUploading: false, sharedToLine: false });
    setSyncStatus("โ… เธเธฑเธเธ—เธถเธเธฃเธนเธ POD เนเธฅเนเธง (เน€เธเนเธเนเธเน€เธเธฃเธทเนเธญเธ) โ€” เนเธเธฃเธ”เธเธ”เนเธเธฃเนเธฅเธ LINE");
  } catch (error) {
    setSyncStatus(`โ เธเธฑเธเธ—เธถเธเธฃเธนเธ POD เนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message || error}`);
  }
};

  const acceptOrder = async (id) => {
    // Check if driver is logged in
    if (!driverId) {
      setSyncStatus("เนยย เนเธย เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ—เน€เธเธเน€เธย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธโ€ขเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธโ€ขเน€เธเธ‘เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธย");
      return;
    }

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`เนยย เนเธย เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย "${driverId}" เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ…เน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธโ€เน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธย`);
      return;
    }

    const driverName = driver.name || "";

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("orders")
          .update({
            driverId: driverId,
            driverName: driverName,
            status: "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย"
          })
          .eq("id", id)
          .or("driverId.is.null,driverId.eq.")
          .select("*")
          .maybeSingle();

        if (error) {
          setSyncStatus(`เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${error.message}`);
          return;
        }

        if (!data) {
          setSyncStatus(`เนยย เนเธย เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${id}" เน€เธโ€“เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ—เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ`);
          await refreshFromSupabase();
          return;
        }

        console.log("เนยโ€ฆ [ACCEPT] Order accepted in Supabase, updating local state...");
        // Update local state immediately to show change
        const accepted = convertToCamelCase(data);
        setState(prev => ({
          ...prev,
          orders: prev.orders.map(o => o.id === id ? accepted : o)
        }));
        setSyncStatus(`เนยโ€ฆ เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${id}" เน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ`);
        // Don't refreshFromSupabase - let polling handle it to avoid race condition
        return;
      } catch (e) {
        setSyncStatus(`เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${e?.message || String(e)}`);
        return;
      }
    }

    updateOrder(id, { driverId, driverName, status: "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" });
  };
  const checkIn = id => {
    if (!driverId) {
      setSyncStatus("เนยย เนเธย เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ—เน€เธเธเน€เธย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธโ€ขเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธโ€ขเน€เธเธ‘เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธย");
      return;
    }

    const order = orders.find(o => o.id === id);
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`เนยย เนเธย เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย "${driverId}" เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย เน€เธเธ…เน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธโ€เน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธย`);
      return;
    }

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
    const order = orders.find(o => o.id === id);
    if (!order) return;
    
    // Update status to completed
    updateOrder(id, { status: "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย", deliveredAt: new Date().toLocaleString("th-TH") });
    
    // Show order summary alert
    const summaryText = `เนยโ€ฆ เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!\n\nเนยโ€เธ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย: ${order.customerName}\nเนยโ€ย ${order.zone}\nเนยโ€เธ COD: เน€เธเธ${money(order.cod || 0)}\nเนยโ€เธ POD: ${order.photo ? "เนยโ€ฆ เน€เธเธเน€เธเธ•" : "เนยย เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•"}\n\nเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธเธ…เน€เธยเน€เธโ€”เน€เธเธเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ`;
    alert(summaryText);
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
            name: driver?.name || "เน€เธยเน€เธเธเน€เธยเน€เธโ€”เน€เธเธเน€เธเธ’เน€เธย",
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
        driverStats[order.driverId][order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" ? "completed" : order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? "active" : "failed"] += 1;
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

    let report = `\n${"เนโ€ขย".repeat(60)}\n`;
    report += `เนยโ€ย เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธเธเน€เธเธ‘เน€เธย\n`;
    report += `เน€เธเธเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ•เน€เธย: ${today}\n`;
    report += `เน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธย: ${new Date().toLocaleString("th-TH")}\n`;
    report += `${"เนโ€ขย".repeat(60)}\n\n`;
    
    report += `เนยโ€ย เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธเน€เธเธเน€เธเธเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธย:\n`;
    report += `${"เนโ€โฌ".repeat(60)}\n`;
    report += `  เนยโ€เธ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€: ${todayOrders.length} เน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนยโ€ฆ เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${todayOrders.filter(o => o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length} เน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนยยเธ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย: ${todayOrders.filter(o => o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย").length} เน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนยเธ“ เน€เธเธเน€เธเธเน€เธเธเน€เธเธ‘เน€เธย: ${todayOrders.filter(o => o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").length} เน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนยย เน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’: ${todayOrders.filter(o => o.status === "เน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’").length} เน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนยโ€เธ เน€เธเธเน€เธเธเน€เธเธ COD: ${money(totalCOD)} เน€เธยเน€เธเธ’เน€เธโ€”\n\n`;

    report += `เนยโ€เธ… เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย:\n`;
    report += `${"เนโ€โฌ".repeat(60)}\n`;
    
    Object.entries(driverStats).forEach(([driverId, stats]) => {
      report += `\nเนยยโ€” ${stats.name}\n`;
      report += `  เนยโ€เธ‘ เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ: ${stats.phone}\n`;
      report += `  เนยยยเนเธย เน€เธโฌเน€เธยเน€เธเธ…เน€เธโ€ข: ${stats.plate}\n`;
      report += `  เนยโ€ย เน€เธยเน€เธยเน€เธย: ${stats.zone}\n`;
      report += `  เนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌเนโ€โฌ\n`;
      report += `  เนยโ€เธ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ: ${stats.total} เน€เธยเน€เธเธ’เน€เธย\n`;
      report += `     เนยโ€ฆ เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${stats.completed} เน€เธยเน€เธเธ’เน€เธย\n`;
      report += `     เนยยเธ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย: ${stats.active} เน€เธยเน€เธเธ’เน€เธย\n`;
      report += `     เนยย เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${stats.failed} เน€เธยเน€เธเธ’เน€เธย\n`;
      report += `  เนยโ€เธ COD เน€เธเธเน€เธเธเน€เธเธ: ${money(stats.cod)} เน€เธยเน€เธเธ’เน€เธโ€”\n`;
      report += `  เนยเธ‘เนเธย เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธย เน€เธเธ’เน€เธย: ${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}%\n`;
      
      if (stats.checkins.length > 0) {
        report += `  เนยโ€ย เน€เธยเน€เธเธเน€เธโ€เน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธย (${stats.checkins.length} เน€เธยเน€เธเธเน€เธโ€):\n`;
        stats.checkins.slice(0, 8).forEach((c, idx) => {
          report += `     ${idx + 1}. ${c.time} - ${c.customer}\n`;
          report += `        เนยโ€ย ${c.address}\n`;
        });
        if (stats.checkins.length > 8) report += `     ... เน€เธยเน€เธเธ…เน€เธเธเน€เธเธเน€เธเธ•เน€เธย ${stats.checkins.length - 8} เน€เธยเน€เธเธเน€เธโ€\n`;
      }
    });

    report += `\n${"เนโ€ขย".repeat(60)}\n`;
    report += `เนยโ€ย เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธ:\n`;
    report += `  เนโฌเธ เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย Hillkoff Delivery System\n`;
    report += `  เนโฌเธ เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’ เน€เธโ€ เน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธย\n`;
    report += `  เนโฌเธ เน€เธโ€ขเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธเธ COD เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโ€ขเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธเธ”เน€เธย\n`;
    report += `${"เนโ€ขย".repeat(60)}\n`;
    
    return report;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("เน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธ…เน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!");
    }).catch(() => {
      alert("เน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย");
    });
  };

  const totals = {
    jobs: orders.length,
    waiting: orders.filter(order => order.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").length,
    active: orders.filter(order => order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย").length,
    done: orders.filter(order => order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length
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
              <div className="panel-head"><h1>เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย</h1><span>เน€เธยเน€เธยเน€เธย Supabase</span></div>
              <div className="segmented">
                <button className={loginForm.role === "sales" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "sales" }))}>เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ</button>
                <button className={loginForm.role === "driver" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "driver" }))}>เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</button>
              </div>
              {loginForm.role === "sales" && <input value={loginForm.name} onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))} placeholder="เน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ" />}
              <input value={loginForm.phone} onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ" />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)} />
                เน€เธยเน€เธโ€เน€เธยเน€เธเธ“เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธย
              </label>
              <button className="primary wide" onClick={loginForm.role === "sales" ? loginSales : loginDriver}>
                {loginForm.role === "sales" ? "เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ" : "เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย"}
              </button>
              <p className="login-note">เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ’เน€เธย Supabase เน€เธเธเน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ”เน€เธย</p>
            </>
          ) : (
            <>
              <div className="panel-head"><h1>เน€เธเธ…เน€เธยเน€เธโ€”เน€เธเธเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</h1><span>เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธโ€”เน€เธยเน€เธเธ’เน€เธยเน€เธเธ‘เน€เธยเน€เธย</span></div>
              <div className="form-grid two">
                <input value={driverForm.firstName} onChange={e => setDriverForm(p => ({ ...p, firstName: e.target.value }))} placeholder="เน€เธยเน€เธเธ—เน€เธยเน€เธเธ" />
                <input value={driverForm.lastName} onChange={e => setDriverForm(p => ({ ...p, lastName: e.target.value }))} placeholder="เน€เธเธเน€เธยเน€เธเธเน€เธเธ…" />
                <input value={driverForm.phone} onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ" />
                <input value={driverForm.vehicle} onChange={e => setDriverForm(p => ({ ...p, vehicle: e.target.value }))} placeholder="เน€เธเธเน€เธโ€“เน€เธโ€”เน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธย" />
                <input value={driverForm.plate} onChange={e => setDriverForm(p => ({ ...p, plate: e.target.value }))} placeholder="เน€เธโ€”เน€เธเธเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธเธเน€เธโ€“" />
                <select value={driverForm.zone} onChange={e => setDriverForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <button className="primary wide" onClick={registerDriver}>เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธยเน€เธเธ…เน€เธเธเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</button>
              <button className="secondary wide" onClick={logout}>เน€เธยเน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’ Login</button>
            </>
          )}
        </section>
      </main>
    );
  }

  const displayTab = auth.role === "driver" ? "driver" : (tab === "driver" ? "sales" : tab);

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
            <p>เน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€เน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธย เธขเธ— {todayText()}</p>
            <h1>{displayTab === "sales" ? "Sales Delivery Dashboard" : displayTab === "dispatch" ? "Dispatch Work Dashboard" : displayTab === "driver" ? "Driver Realtime Orders" : displayTab === "settings" ? "System Settings" : "Daily Report & Service Quality"}</h1>
          </div>
          <div className="top-actions">
            <span className="google-status">{auth.role === "driver" ? "เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย" : "เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ"}: {auth.name || auth.phone}</span>
            <button className="secondary" onClick={logout}>เน€เธเธเน€เธเธเน€เธย</button>
          </div>
        </header>
        <div className="sync-banner">{syncStatus}</div>

        <div className="stats">
          <Stat icon={PackagePlus} label="เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ•เน€เธย" value={`${totals.jobs} เน€เธยเน€เธเธ’เน€เธย`} sub="เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธย" />
          <Stat icon={UserCheck} label="เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย" value={`${totals.waiting} เน€เธยเน€เธเธ’เน€เธย`} sub="เน€เธโฌเน€เธโ€เน€เธยเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย" tone="#92400e" />
          <Stat icon={Navigation} label="เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" value={`${totals.active} เน€เธยเน€เธเธ’เน€เธย`} sub="เน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธยเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธ’เน€เธย" tone="#1d4ed8" />
          <Stat icon={CheckCircle2} label="เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" value={`${totals.done} เน€เธยเน€เธเธ’เน€เธย`} sub="เน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธเธเน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€“เน€เธยเน€เธเธ’เน€เธเธ" tone="#166534" />
          {auth.role === "driver" && (
            <Stat icon={Star} label="เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ‘เน€เธย" value={`${orders.filter(o => o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" && o.driverId === driverId).length} เน€เธยเน€เธเธ’เน€เธย`} sub="เน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธโ€เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€" tone="#22c55e" />
          )}
        </div>

        {displayTab === "sales" && (
          <>
            <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
              <button className="secondary" onClick={() => {
                const pwd = prompt("เนยโ€ย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย:");
                if (pwd === null) return; // User cancelled
                if (pwd !== "2532") {
                  alert("เนยย เน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธย");
                  return;
                }
                if (!window.confirm("เน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธย: เน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธเน€เธย? (เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธเธ…เน€เธย)")) return;

                (async () => {
                  try {
                    // Disable polling during reset to prevent race condition
                    isResettingOrdersRef.current = true;
                    
                    if (!supabase) supabase = initSupabase();
                    if (!supabase) {
                      alert("เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธโ€ขเน€เธยเน€เธเธ Supabase เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธย");
                      isResettingOrdersRef.current = false;
                      return;
                    }

                    setSyncStatus("เนยเธ“ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€ (Supabase)...");
                    console.log("เนยโ€ย [RESET] Starting complete order reset process...");
                      
                      // STEP 1: Clear React state
                      console.log("เนยเธเธ [RESET] Step 1: Clearing React state (orders = [])...");
                      const emptyState = JSON.parse(JSON.stringify(state)); // Deep copy
                      emptyState.orders = [];
                      emptyState.customers = [];
                      setState(emptyState);
                      console.log("เนยโ€ฆ [RESET] React state cleared", { orders: emptyState.orders.length, customers: emptyState.customers.length });
                      
                      // Wait for state update
                      await new Promise(resolve => setTimeout(resolve, 200));
                      console.log("เนยโ€ฆ [RESET] State update delay completed");
                      
                      // STEP 2: Delete from Supabase
                      console.log("เนยโ€”โ€เนเธย [RESET] Step 2: Deleting from Supabase...");
                      
                      try {
                        // Fetch all order IDs
                        console.log("เนยโ€ย [RESET] Fetching all order IDs...");
                        const { data: allOrders, error: fetchError } = await supabase
                          .from("orders")
                          .select("id");
                        
                        console.log("เนยโ€ย [RESET] Fetch result:", { 
                          ordersCount: allOrders?.length || 0, 
                          hasError: !!fetchError,
                          errorMsg: fetchError?.message || "none"
                        });
                        
                        if (fetchError) {
                          console.error("เนยย [RESET] Fetch failed:", fetchError);
                          throw new Error(`Fetch failed: ${fetchError.message}`);
                        }
                        
                        // Delete orders
                        if (allOrders && allOrders.length > 0) {
                          const orderIds = allOrders.map(o => o.id);
                          console.log(`เนยโ€”โ€เนเธย [RESET] Deleting ${orderIds.length} orders...`);
                          console.log("เนยโ€”โ€เนเธย [RESET] Order IDs:", orderIds);
                          
                          const { error: deleteError, count, status } = await supabase
                            .from("orders")
                            .delete()
                            .in("id", orderIds);
                          
                          console.log("เนยโ€”โ€เนเธย [RESET] Delete response:", { 
                            totalRequested: orderIds.length,
                            deletedCount: count, 
                            httpStatus: status,
                            hasError: !!deleteError,
                            errorMsg: deleteError?.message || "none"
                          });
                          
                          if (deleteError) {
                            console.error("เนยย [RESET] Delete query failed:", deleteError);
                            throw new Error(`Delete failed: ${deleteError.message}`);
                          }
                          
                          if (count !== orderIds.length) {
                            console.warn(`เนยย เนเธย [RESET] WARNING: Only ${count} of ${orderIds.length} orders were deleted!`);
                          }
                          
                          // Verify deletion
                          console.log("เนยโ€ฆ [RESET] Delete query completed, verifying...");
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          
                          const { data: afterDelete, error: verifyError } = await supabase
                            .from("orders")
                            .select("id");
                          
                          console.log("เนยโ€ฆ [RESET] Verification:", { 
                            ordersRemaining: afterDelete?.length || 0,
                            verifyError: verifyError?.message || "none"
                          });
                          
                          if (afterDelete && afterDelete.length > 0) {
                            console.warn("เนยย เนเธย [RESET] WARNING: Orders still exist after delete:", afterDelete.map(o => o.id));
                            console.warn("เนยย เนเธย [RESET] Remaining order IDs should be:", afterDelete.map(o => o.id).join(", "));
                          }
                        } else {
                          console.log("เนยเธเนเธย [RESET] No orders to delete");
                        }
                      } catch (e) {
                        console.error("เนยย [RESET] Delete step failed:", e);
                        throw e;
                      }
                      
                      // STEP 3: Wait to ensure everything is synced
                      console.log("เนยเธ“ [RESET] Step 3: Waiting 5 seconds to ensure deletion is complete...");
                      await new Promise(resolve => setTimeout(resolve, 5000));
                      
                      // STEP 4: Final verification: fetching from Supabase
                      console.log("เนยโ€ย [RESET] Step 4: Final verification: fetching from Supabase...");
                      const { data: finalCheck, error: finalCheckError } = await supabase
                        .from("orders")
                        .select("id");
                      
                      console.log("เนยโ€ย [RESET] Final Supabase check:", {
                        ordersRemaining: finalCheck?.length || 0,
                        error: finalCheckError?.message || "none"
                      });
                      
                      if (finalCheck && finalCheck.length > 0) {
                        console.warn("เนยย เนเธย [RESET] WARNING: Orders still in Supabase after delete:", finalCheck.map(o => o.id));
                        console.log("เนยโ€ย [RESET] Attempting second delete round...");
                        
                        // Try delete again
                        const remainingIds = finalCheck.map(o => o.id);
                        const { error: deleteRetryError, count: retryCount } = await supabase
                          .from("orders")
                          .delete()
                          .in("id", remainingIds);
                        
                        console.log("เนยโ€”โ€เนเธย [RESET] Second delete attempt:", { 
                          retryCount, 
                          retryError: deleteRetryError?.message || "none"
                        });
                        
                        // Verify again
                        const { data: finalCheck2 } = await supabase.from("orders").select("id");
                        console.log("เนยโ€ย [RESET] After retry:", { ordersRemaining: finalCheck2?.length || 0 });
                      }
                      
                      // STEP 5: Re-enable sync
                      console.log("เนยโ€ย [RESET] Step 5: Re-enabling polling and sync...");
                      setSyncStatus("เนยโ€ฆ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!");
                      alert("เนยโ€ฆ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!\n\nเนยโ€ เน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธเธ’เน€เธย Supabase\nเนยโ€ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธโ€“เน€เธเธ’เน€เธยเน€เธเธเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธย");
                      isResettingOrdersRef.current = false;
                      
                      console.log("เนยโ€ฆ [RESET] Process completed successfully!");
                    } catch (e) {
                      console.error("เนยย [RESET] Process failed:", e);
                      setSyncStatus(`เนยย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${e?.message || String(e)}`);
                      alert(`เนยย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย:\n${e?.message || String(e)}\n\n(เน€เธโ€ขเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธย console เน€เธเธเน€เธเธ“เน€เธเธเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ…เน€เธเธเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธโ€)`);
                      isResettingOrdersRef.current = false;
                    }
                  })();
              }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>เนยโ€ย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย</button>
            </div>
            <div className="sales-grid">
            {syncStatus && syncStatus !== "Local mode" && (
              <section className="panel" style={{ gridColumn: "1 / -1", background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>เนยโ€ {syncStatus}</p>
              </section>
            )}
            <section className="panel" style={{ gridColumn: "1 / -1", background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div className="panel-head"><h2>เนยยเธ เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธยเน€เธยเน€เธเธ•เน€เธย</h2><span>{Object.keys(state.onlineDrivers || {}).length} เน€เธยเน€เธย</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted" style={{ gridColumn: "1 / -1" }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธย</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const onlineTime = Math.floor((new Date().getTime() - (state.onlineDrivers?.[driver.id] || 0)) / 60000);
                    return (
                      <div key={driver.id} style={{ background: "white", padding: "12px", borderRadius: "6px", border: "1px solid #dcfce7", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#22c55e", marginBottom: "4px" }}>เนยยเธ {driver.name}</div>
                        <small style={{ color: "#666" }}>{driver.plate}</small><br />
                        <small style={{ color: "#999" }}>{driver.zone}</small><br />
                        <small style={{ color: "#16a34a", marginTop: "4px", display: "block" }}>Online {onlineTime}m ago</small>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              {(() => {
                const locs = state.driverLocations || {};
                const driverIds = Object.keys(locs).filter(did => locs[did]?.lat && locs[did]?.lng);
                const effectiveId = selectedMapDriverId || driverIds[0] || "";
                const selected = effectiveId ? locs[effectiveId] : null;
                const embed = selected ? osmEmbedUrl(selected.lat, selected.lng, 15) : "";

                return (
                  <>
                    <div className="panel-head"><h2>เนยโ€”เธเนเธย Mini-map (OSM)</h2><span>{driverIds.length} เน€เธยเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธเธ”เน€เธยเน€เธเธ‘เน€เธโ€</span></div>
                    {driverIds.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธเธ”เน€เธยเน€เธเธ‘เน€เธโ€เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย (เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธ’เน€เธโ€ข GPS เน€เธยเน€เธเธ…เน€เธเธเน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธยเน€เธยเน€เธเธ’ Driver เน€เธยเน€เธเธเน€เธย)</p>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                          {driverIds.map(did => {
                            const d = locs[did];
                            const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
                            return (
                              <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
                                เนยโ€ย {name}
                              </button>
                            );
                          })}
                        </div>
                        {selected && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                              <b>{selected.driverName || effectiveId}</b>
                              <small style={{ color: "#6b7280" }}>{selected.zone || "-"}</small>
                            </div>
                            <iframe title="osm-mini-map" src={embed} style={{ width: "100%", height: "260px", border: "1px solid #e5e7eb", borderRadius: "8px" }} loading="lazy" />
                            <a href={osmPageUrl(selected.lat, selected.lng, 16)} target="_blank" rel="noreferrer" className="secondary" style={{ display: "block", textAlign: "center", padding: "8px", textDecoration: "none" }}>
                              เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธยเน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธโฌเน€เธโ€ขเน€เธยเน€เธเธ (OpenStreetMap)
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              {(() => {
                const inProgress = orders.filter(o => o.driverId && (o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย"));
                const byDriver = {};
                inProgress.forEach(o => {
                  byDriver[o.driverId] = byDriver[o.driverId] || [];
                  byDriver[o.driverId].push(o);
                });

                return (
                  <>
                    <div className="panel-head"><h2>เนยยย เน€เธยเน€เธเธ’เน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย</h2><span>{inProgress.length} เน€เธยเน€เธเธ’เน€เธย</span></div>
                    {inProgress.length === 0 ? (
                      <p className="muted" style={{ textAlign: "center", padding: "8px 0" }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธเธ’เน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                        {Object.keys(byDriver).map(did => {
                          const driver = drivers.find(d => d.id === did);
                          const items = byDriver[did] || [];
                          return (
                            <div key={did} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                                <b>{driver?.name || items[0]?.driverName || "เน€เธยเน€เธเธเน€เธยเน€เธโ€”เน€เธเธเน€เธเธ’เน€เธยเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย"}</b>
                                <small style={{ color: "#6b7280" }}>{driver?.plate || "-"}</small>
                              </div>
                              <small style={{ color: "#6b7280" }}>{driver?.zone || "-"}</small>
                              <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                                {items.slice(0, 5).map(o => (
                                  <div key={o.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                      <b style={{ color: statusColor[o.status] || "#111827" }}>{o.id}</b>
                                      <small style={{ color: statusColor[o.status] || "#111827" }}>{o.status}</small>
                                    </div>
                                    <small style={{ color: "#374151" }}>{o.customerName} เธขเธ— {o.zone}</small>
                                  </div>
                                ))}
                                {items.length > 5 && <small style={{ color: "#6b7280" }}>+ เน€เธเธเน€เธเธ•เน€เธย {items.length - 5} เน€เธยเน€เธเธ’เน€เธย</small>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธโฌเน€เธยเน€เธยเน€เธเธ’</h2><span>{customers.length} เน€เธเธเน€เธยเน€เธเธ’เน€เธย</span></div>
              {customers.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "20px", color: "#999" }}>เนยโ€เธ เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ เน€เธยเน€เธโ€เน€เธโฌเน€เธยเน€เธเธ”เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€เน€เธยเน€เธเธ’เน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธย</p>
              ) : (
                <>
                  <label className="search"><Search size={16} /><input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ’เน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ เน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย" /></label>
                  <div className="customer-list">
                    {filteredCustomers.map(customer => (
                      <button key={customer.id} className={`customer-card ${selectedCustomerId === customer.id ? "selected" : ""}`} onClick={() => setSelectedCustomerId(customer.id)}>
                        <strong>{customer.name}</strong>
                        <span>{customer.contact} เธขเธ— {customer.phone}</span>
                        <span>{customer.zone} เธขเธ— {customer.address}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedCustomer && (
                <div style={{ marginTop: "16px", padding: "12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #dcfce7" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "8px" }}>
                    <div>
                      <b style={{ fontSize: "14px", display: "block" }}>{selectedCustomer.name}</b>
                      <small style={{ color: "#666" }}>เนยโ€ย {selectedCustomer.phone}</small><br/>
                      <small style={{ color: "#666" }}>เนยโ€เธ {selectedCustomer.contact}</small><br/>
                      <small style={{ color: "#666" }}>เนยโ€ย {selectedCustomer.zone}</small><br/>
                      <small style={{ color: "#666" }}>{selectedCustomer.address}</small>
                    </div>
                  </div>
                  <button className="secondary" style={{ width: "100%", padding: "8px", fontSize: "12px" }} onClick={() => {
                    setEditingCustomerId(selectedCustomer.id);
                    setEditCustomerForm(selectedCustomer);
                  }}>เนยยเนเธย เน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…</button>
                </div>
              )}
            </section>

            {editingCustomerId && (
              <section className="panel" style={{ background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <div className="panel-head"><h2>เนยยเนเธย เน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’</h2><span>เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธ…เน€เธย: {editingCustomerId}</span></div>
                <div className="form-grid">
                  <input value={editCustomerForm.name} onChange={e => setEditCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="เน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธย/เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’" />
                  <input value={editCustomerForm.contact} onChange={e => setEditCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="เน€เธยเน€เธเธเน€เธยเน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธโ€ขเน€เธยเน€เธเธ" />
                  <input value={editCustomerForm.phone} onChange={e => setEditCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ" />
                  <select value={editCustomerForm.zone} onChange={e => setEditCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
                </div>
                <input value={editCustomerForm.address} onChange={e => setEditCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="เน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธย/เน€เธเธเน€เธยเน€เธเธ’เน€เธย" />
                <input value={editCustomerForm.mapUrl} onChange={e => setEditCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
                <textarea value={editCustomerForm.note} onChange={e => setEditCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’" rows={3} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button className="secondary" onClick={() => setEditingCustomerId(null)}>เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย</button>
                  <button className="primary" onClick={() => updateCustomer(editingCustomerId, editCustomerForm)}>เนยโ€เธ เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธย</button>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-head"><h2>เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธย</h2><span>เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธโฌเน€เธเธ…เน€เธเธ—เน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ—เน€เธยเน€เธเธ</span></div>
              <label className="search"><Search size={16} /><input value={orderForm.customerName} onChange={e => setOrderForm(p => ({ ...p, customerName: e.target.value }))} placeholder="เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ (autocomplete)" /></label>
              {orderForm.customerName && (
                <div className="customer-list">
                  {customers.filter(c => c.name.toLowerCase().includes(orderForm.customerName.toLowerCase())).slice(0, 5).map(c => (
                    <button key={c.id} className="customer-card" onClick={() => { setOrderForm(p => ({ ...p, customerName: c.name })); setSelectedCustomerId(c.id); }}>
                      <strong>{c.name}</strong>
                      <span>{c.phone} เธขเธ— {c.zone}</span>
                    </button>
                  ))}
                </div>
              )}
              {(() => {
                const foundCustomer = customers.find(c => c.name.toLowerCase() === orderForm.customerName.toLowerCase()) || selectedCustomer;
                return foundCustomer ? (
                  <div className="customer-detail">
                    <div><b>{foundCustomer.name}</b><p>{foundCustomer.contact} เธขเธ— {foundCustomer.phone}</p><p>{foundCustomer.address}</p></div>
                    <a href={foundCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธยเน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย</a>
                  </div>
                ) : null;
              })()}
              <div className="form-grid">
                <input value={orderForm.window} onChange={e => setOrderForm(p => ({ ...p, window: e.target.value }))} placeholder="เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’เน€เธเธเน€เธยเน€เธย" />
                <input value={orderForm.boxes} onChange={e => setOrderForm(p => ({ ...p, boxes: e.target.value }))} type="number" placeholder="เน€เธยเน€เธเธ“เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย" />
                <input value={orderForm.cod} onChange={e => setOrderForm(p => ({ ...p, cod: e.target.value }))} type="number" placeholder="COD" />
              </div>
              <textarea value={orderForm.salesNote} onChange={e => setOrderForm(p => ({ ...p, salesNote: e.target.value }))} placeholder="เน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ…เน€เธเธเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธโ€เน€เธเธเน€เธเธ”เน€เธยเน€เธยเน€เธยเน€เธเธ’ / เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ" rows={3} />
              <button className="primary wide" onClick={createOrder}><PackagePlus size={18} /> เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธโฌเน€เธยเน€เธเธ”เน€เธยเน€เธเธเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธย</h2><span>เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธโ€“เน€เธเธ‘เน€เธโ€เน€เธยเน€เธย</span></div>
              <div className="form-grid two">
                <input value={customerForm.name} onChange={e => setCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="เน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธย/เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’" />
                <input value={customerForm.contact} onChange={e => setCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="เน€เธยเน€เธเธเน€เธยเน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธโ€ขเน€เธยเน€เธเธ" />
                <input value={customerForm.phone} onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธโฌเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธโ€”เน€เธเธ" />
                <select value={customerForm.zone} onChange={e => setCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <input value={customerForm.address} onChange={e => setCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="เน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธย/เน€เธเธเน€เธยเน€เธเธ’เน€เธย" />
              <input value={customerForm.mapUrl} onChange={e => setCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
              <textarea value={customerForm.note} onChange={e => setCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’" rows={3} />
              <button className="secondary wide" onClick={saveCustomer}>เน€เธยเน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ–เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€ย เน€เธโ€ขเน€เธเธ“เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธโ€</h2><span>{Object.keys(state.driverLocations || {}).length} เน€เธยเน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ</span></div>
              {Object.keys(state.driverLocations || {}).length === 0 ? (
                <p className="muted">เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธย</p>
              ) : (
                Object.values(state.driverLocations || {})
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map(location => {
                    const currentOrder = orders.find(o => o.driverId === location.driverId && (o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย"));
                    const customer = currentOrder ? customers.find(c => c.name === currentOrder.customerName) : null;
                    return (
                      <div key={location.driverId} style={{ padding: "12px", borderBottom: "1px solid #eee", marginBottom: "8px", background: "#f0f9ff", borderRadius: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <div>
                            <b style={{ fontSize: "14px", color: "#1a5490" }}>เนยยโ€” {location.driverName}</b>
                            <p style={{ margin: "4px 0", fontSize: "12px" }}>เนยโ€เธ‘ {location.driverPhone} เธขเธ— {location.plate}</p>
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#059669", fontWeight: "bold" }}>เนยยเธ {location.customerName}</p>
                            {customer && <p style={{ margin: "4px 0", fontSize: "11px", color: "#0891b2" }}>เนยโ€เธ เน€เธโ€ขเน€เธเธ”เน€เธโ€เน€เธโ€ขเน€เธยเน€เธเธ: {customer.contact}</p>}
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>เนยโ€ย {location.address}</p>
                            {currentOrder && <p style={{ margin: "4px 0", fontSize: "11px", color: "#7c2d12", background: "#fed7aa", padding: "2px 6px", borderRadius: "3px", display: "inline-block" }}>เนยโ€เธ เน€เธเธเน€เธโ€“เน€เธเธ’เน€เธยเน€เธเธ: {currentOrder.status}</p>}
                            <p style={{ margin: "4px 0", fontSize: "11px", color: "#999" }}>เนยเธ เน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธย: {location.checkInTime}</p>
                          </div>
                          <span style={{ background: "#166534", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>เนยยเธ Online</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€ย เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย</h2><span>เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย {orders.filter(o => o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").length}</span></div>
              {orders.filter(o => o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").length === 0 ? (
                <p className="muted">เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {orders.filter(o => o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย").map(order => (
                    <div key={order.id} style={{ background: "#fef9e7", padding: "10px", borderRadius: "6px", borderLeft: "4px solid #f59e0b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: "13px" }}>{order.id} เธขเธ— {order.customerName}</b>
                        <small style={{ color: "#666" }}>{order.zone} เธขเธ— {order.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย เธขเธ— เน€เธเธ{money(order.cod)}</small>
                      </div>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px", marginLeft: "8px" }} onClick={() => deleteOrder(order.id)}>เนยโ€”โ€เนเธย เน€เธเธ…เน€เธย</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€เธ เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธย</h2><span>เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย {orders.filter(o => o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย").length} + เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย {orders.filter(o => o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length}</span></div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1, background: "#fef3c7", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #f59e0b" }}>
                  <small style={{ color: "#92400e" }}>เนยเธ“ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#f59e0b" }}>{orders.filter(o => o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย").length}</b>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #22c55e" }}>
                  <small style={{ color: "#166534" }}>เนยโ€ เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#22c55e" }}>{orders.filter(o => o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length}</b>
                </div>
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {orders.filter(o => o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length === 0 ? (
                  <p className="muted">เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธย</p>
                ) : (
                  orders.filter(o => o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").sort((a, b) => (a.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? -1 : 1)).map(order => {
                    const driver = drivers.find(d => d.id === order.driverId);
                    return (
                      <div key={order.id} style={{ padding: "10px", borderBottom: "1px solid #eee", fontSize: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                          <b style={{ color: order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? "#f59e0b" : "#22c55e" }}>{order.id}</b>
                          <span style={{ background: order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? "#fef3c7" : "#f0fdf4", color: order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? "#92400e" : "#166534", padding: "2px 6px", borderRadius: "3px", fontSize: "11px" }}>{order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" ? "เนยเธ“ เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธย" : "เนยโ€ เน€เธโฌเน€เธเธเน€เธเธเน€เธยเน€เธย"}</span>
                        </div>
                        <p style={{ margin: "2px 0", color: "#333" }}>{order.customerName}</p>
                        <p style={{ margin: "2px 0", color: "#666" }}>{order.address}</p>
                        <p style={{ margin: "2px 0", color: "#999" }}>เนยยโ€” {driver?.name || "เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ’เน€เธเธ"}</p>
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
                  const pwd = prompt("เนยโ€ย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย:");
                  if (pwd === null) return; // User cancelled
                  if (pwd !== "2532") {
                    alert("เนยย เน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธย");
                    return;
                  }
                  if (!window.confirm("เน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธย: เน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธเน€เธย? (เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธเธ…เน€เธย)")) return;

                  (async () => {
                    try {
                      if (!supabase) supabase = initSupabase();
                      if (!supabase) {
                        alert("เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธโ€ขเน€เธยเน€เธเธ Supabase เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธย");
                        return;
                      }

                      setSyncStatus("เนยเธ“ เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธย Supabase...");
                      const { error } = await supabase.from("orders").delete().neq("id", "__never__");
                      if (error) {
                        alert(`เนยย เน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${error.message}`);
                        setSyncStatus(`เนยย เน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${error.message}`);
                        return;
                      }

                      // Clear local state
                      setState(prev => ({ ...prev, orders: [] }));
                      
                      setSyncStatus("เนยโ€ฆ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย");
                      alert("เนยโ€ฆ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย");
                      await refreshFromSupabase();
                    } catch (e) {
                      alert(`เนยย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${e?.message || String(e)}`);
                    }
                    })();
                }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>เนยโ€ย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย</button>
              </div>
              <div className="panel-head"><h2>เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธย</h2><span>{filteredOrders.length} เน€เธยเน€เธเธ’เน€เธย</span></div>
              <div className="filters dispatch-filters">
                <label className="search"><Search size={16} /><input value={orderQuery} onChange={e => setOrderQuery(e.target.value)} placeholder="เน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ’เน€เธโฌเน€เธเธ…เน€เธยเน€เธยเน€เธเธ’เน€เธย เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’ เน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธ" /></label>
                <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                  <option value="all">เน€เธโ€”เน€เธเธเน€เธยเน€เธเธเน€เธโ€“เน€เธเธ’เน€เธยเน€เธเธ</option>
                  {STATUS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <select value={orderZoneFilter} onChange={e => setOrderZoneFilter(e.target.value)}>
                  <option value="all">เน€เธโ€”เน€เธเธเน€เธยเน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย</option>
                  {ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </div>
              <div className="dispatch-table">
                <div className="dispatch-head">
                  <span>เน€เธยเน€เธเธ’เน€เธย</span>
                  <span>เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’/เน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย</span>
                  <span>เน€เธเธเน€เธโ€“เน€เธเธ’เน€เธยเน€เธเธ</span>
                  <span>COD</span>
                  <span></span>
                </div>
                {filteredOrders.map(order => {
                  const assignedDriver = drivers.find(driver => driver.id === order.driverId);
                  return (
                    <article key={order.id} className="dispatch-row">
                      <div><b>{order.id}</b><span>{order.window} เธขเธ— {order.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย</span></div>
                      <div><b>{order.customerName}</b><span>{order.zone} เธขเธ— {order.address}</span>{order.complaint && <span style={{ marginLeft: "8px", background: "#fca5a5", color: "#7f1d1d", padding: "2px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: "bold" }}>เนยย เนเธย {order.complaint}</span>}</div>
                      <div className="status-stack">
                        <span className="status-chip" style={{ color: statusColor[order.status], background: `${statusColor[order.status]}14` }}>{order.status}</span>
                        <small>{assignedDriver ? assignedDriver.name : "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย"}</small>
                      </div>
                      <strong>{money(order.cod)} เน€เธยเน€เธเธ’เน€เธโ€”</strong>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>เนยโ€”โ€เนเธย</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</h2><span>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ•เน€เธย</span></div>
              {report.driverScore.map(driver => {
                const driverJobs = orders.filter(order => order.driverId === driver.id && order.status !== "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย");
                return (
                  <div key={driver.id} className="driver-load-row">
                    <div>
                      <b>{driver.name}</b>
                      <span>{driver.plate} เธขเธ— {driver.zone}</span>
                    </div>
                    <strong>{driverJobs.length} เน€เธยเน€เธเธ’เน€เธย</strong>
                  </div>
                );
              })}
              <div className="google-box">
                <b>เน€เธเธเน€เธเธ”เน€เธยเน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธโฌเน€เธเธเน€เธยเน€เธเธ</b>
                <p>เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’ Sales เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธเธ•เน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธโ€”เน€เธเธ•</p>
                <p>เน€เธยเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ”เน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ—เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธเธ…เน€เธเธ‘เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธยเน€เธโ€เน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’ Driver</p>
              </div>
            </section>
          </div>
        )}

        {auth.role === "driver" && displayTab === "driver" && (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย */}
            <section className="panel" style={{ background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                <div>
                  {drivers.filter(driver => driver.id === driverId).map(driver => (
                    <div key={driver.id}>
                      <b style={{ fontSize: "16px", display: "block" }}>เนยโ€เธ {driver.name}</b>
                      <small style={{ color: "#666" }}>เนยยโ€” {driver.plate} เธขเธ— เนยโ€ย {driver.zone}</small>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ fontSize: "20px", color: "#22c55e", display: "block" }}>{driverOrders.filter(o => o.status !== "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" && o.driverId === driverId).length}</b>
                  <small style={{ color: "#666" }}>เน€เธยเน€เธเธ’เน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ—เน€เธเธ</small>
                </div>
              </div>
            </section>

            {/* เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย (Pending Orders Grid) */}
            {(() => {
              const pending = orders.filter(o => o.status === "เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ‘เน€เธย");
              console.log("เนยโ€ย Driver page - Total orders:", orders.length, "Pending:", pending.length, "driverId:", driverId);
              return (
                <section className="panel">
                  <div className="panel-head"><h2>เนยโ€เธ เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย</h2><span>{pending.length} เน€เธยเน€เธเธ’เน€เธย</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {pending.map(order => {
                      const salesName = order.salesName || "เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•";
                      const salesPhone = order.salesPhone || "-";
                      return (
                        <div key={order.id} style={{ background: "#fef9e7", padding: "12px", borderRadius: "8px", border: "2px solid #f59e0b", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <b style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>{order.id}</b>
                          <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                          <small style={{ color: "#666" }}>เนยโ€ย {order.zone}</small><br/>
                          <small style={{ color: "#666" }}>เนยเธ {order.window}</small><br/>
                          <small style={{ color: "#666" }}>เนยโ€เธ {order.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย เธขเธ— เน€เธเธ{money(order.cod)}</small>
                        </div>
                        
                        <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #fcd34d" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>เนยโ€ย เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’: {order.customerPhone}</small>
                          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                            <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>เนยโ€เธ‘ เน€เธยเน€เธโ€”เน€เธเธ</a>
                            {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>เนยโ€”เธเนเธย เน€เธยเน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย</a>}
                          </div>
                        </div>
                        
                        <div style={{ background: "#f3e8ff", padding: "8px", borderRadius: "6px", border: "1px solid #d8b4fe" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ: {salesName}</small>
                          <small style={{ color: "#666", display: "block" }}>{salesPhone}</small>
                          <a href={`tel:${salesPhone}`} className="secondary" style={{ width: "100%", padding: "6px", fontSize: "11px", marginTop: "4px", display: "block", textAlign: "center", textDecoration: "none" }}>เนยโ€ย เน€เธยเน€เธโ€”เน€เธเธเน€เธเธเน€เธเธ’เน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ</a>
                        </div>
                        
                        {order.address && <small style={{ color: "#999", borderTop: "1px solid #fcd34d", paddingTop: "8px" }}>เนยโ€เธ {order.address}</small>}
                        
                        <button 
                          className="primary" 
                          style={{ width: "100%", padding: "10px", fontWeight: "bold", fontSize: "13px" }} 
                          disabled={false}
                          onClick={() => {
                            // allow immediate next actions; no UI lock
                            updateOrder(order.id, { driverId, driverName: drivers.find(d => d.id === driverId)?.name, status: "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" });
                            setSyncStatus(`เนยโ€ฆ เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${order.id}" เน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ`);
                          }}>เนยโ€ เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ•เน€เธย</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
            })()}

            {/* เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ (In-Progress Orders) */}
	            {orders.filter(o => o.driverId === driverId && (o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย")).length > 0 && (
	              <section className="panel">
                <div className="panel-head"><h2>เนยยโ€” เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ•เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ</h2><span>{orders.filter(o => o.driverId === driverId && o.status !== "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length} เน€เธยเน€เธเธ’เน€เธย เธขเธ— เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย {orders.filter(o => o.driverId === driverId && o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                  {orders.filter(o => o.driverId === driverId && (o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" || o.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย")).map(order => (
                    <div key={order.id} style={{ background: order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" ? "#f0fdf4" : "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${statusColor[order.status]}`, display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <b style={{ fontSize: "14px", display: "block", marginBottom: "4px", color: statusColor[order.status] }}>{order.id}</b>
                        <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                        <small style={{ color: "#666" }}>เนยโ€ย {order.zone}</small><br/>
                        <small style={{ color: "#666" }}>เนยเธ {order.window}</small><br/>
                        <small style={{ color: "#666" }}>เนยโ€เธ {order.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย เธขเธ— เน€เธเธ{money(order.cod)}</small>
                      </div>
                      
                      <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #ddd" }}>
                        <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>เนยโ€ย {order.customerPhone}</small>
                        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                          <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>เนยโ€เธ‘ เน€เธยเน€เธโ€”เน€เธเธ</a>
                          {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>เนยโ€”เธเนเธย เน€เธยเน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย</a>}
                        </div>
                      </div>
                      
                      {order.address && <small style={{ color: "#999", borderTop: `1px solid ${statusColor[order.status]}`, paddingTop: "8px" }}>เนยโ€เธ {order.address}</small>}
                      
                      {/* Status Actions */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย" && (
                          <>
                            <button 
                              className="primary" 
                              style={{ padding: "8px", fontSize: "12px", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                              disabled={false}
                              onClick={() => {
                                // no UI lock; allow immediate next action
                                updateOrder(order.id, { status: "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย" });
                                setSyncStatus(`เนยโ€ฆ เน€เธโ€“เน€เธเธ–เน€เธยเน€เธยเน€เธเธเน€เธโ€เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ…เน€เธยเน€เธเธ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${order.id}"`);
                              }}>เนยยโ€” เน€เธยเน€เธยเน€เธโ€“เน€เธเธ–เน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ</button>
                            <button 
                              className="secondary" 
                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                              disabled={false}
                              onClick={() => {
                                const reason = prompt("เนยโ€ย เน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธเน€เธยเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย:");
                                if (reason) {
                                  // no UI lock; allow immediate next action
                                  updateOrder(order.id, { status: "เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย", complaint: reason });
                                  setSyncStatus(`เนยย เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${order.id}"`);
                                }
                              }}>เนยย เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย</button>
                          </>
                        )}
                        {order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย" && (
                          <>
                            <label 
                              className="primary" 
                              onClick={() => { const el = document.getElementById(`pod-file-${order.id}`); try { el?.click(); } catch {} }}
                              style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", background: "#176b3a", color: "white" }}>
                              เนยโ€เธ— เน€เธโ€“เน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธเน€เธย
                              <input id={`pod-file-${order.id}`} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  // no UI lock; allow immediate next action
                                  uploadPod(order, file);
                                }
                                e.target.value = "";
                              }} />
                            </label>
                            <button 
                              className="secondary" 
                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                              disabled={false}
                              onClick={() => {
                                const reason = prompt("เนยโ€ย เน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธเน€เธยเน€เธเธ…เน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย:");
                                if (reason) {
                                  // no UI lock; allow immediate next action
                                  updateOrder(order.id, { status: "เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย", complaint: reason });
                                }
                              }}>เนยย เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย</button>
                          </>
                        )}
                        {order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย" && order.photo && !order.sharedToLine && (
                          <button
                            className="primary"
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#2563eb" }}
                            onClick={() => shareOrderToLine(order)}
                          >๐’ฌ เนเธเธฃเนเธฃเธนเธ+เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ” (LINE)</button>
                        )}
                        {order.status === "เน€เธยเน€เธเธ“เน€เธเธ…เน€เธเธ‘เน€เธยเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธเน€เธยเน€เธย" && order.photo && order.sharedToLine && (
                          <button 
                            className="primary" 
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                            disabled={false}
                            onClick={() => {
                              // Add to pending updates to prevent rapid clicks
                              // no UI lock; allow immediate next action
                              updateOrder(order.id, { status: "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย", deliveredAt: new Date().toLocaleString("th-TH") });
                              setSyncStatus(`เนยโ€ฆ เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย "${order.id}" เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ`);
                            }}>เนยโ€ฆ เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย</button>
                        )}
                        {order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" && (
                          <button 
                            className="secondary" 
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                            disabled={false}
                            onClick={() => {
                              // no UI lock; allow immediate next action
                              alert(`เนยโ€ฆ เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธ\n\nเนยโ€เธ เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย: ${order.customerName}\nเนยโ€ย ${order.zone}\nเนยโ€เธ COD: เน€เธเธ${money(order.cod || 0)}\nเนยโ€เธ POD: เนยโ€ฆ เน€เธเธเน€เธเธ•\n\nเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ’เน€เธเธเน€เธโ€“เน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธโ€เน€เธย`);
                            }}>เนยยย  เน€เธเธเน€เธยเน€เธยเน€เธโฌเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ”เน€เธยเน€เธย</button>
                        )}
                      </div>

                      {/* Photo Preview */}
                      {order.photo && (
                        <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "2px solid #22c55e" }}>
                          <img src={order.photo} alt="proof" style={{ width: "100%", height: "auto" }} />
                        </div>
                      )}
                      
                      {order.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย" && (
                        <div style={{ background: "#f0fdf4", padding: "6px", borderRadius: "4px", fontSize: "11px", color: "#166534", fontWeight: "bold", textAlign: "center" }}>
                          เนยโ€ฆ {order.deliveredAt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
	              </section>
	            )}

	            {orders.filter(o => o.driverId === driverId && o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length > 0 && (
	              <section className="panel" style={{ background: "#f8fafc" }}>
	                <div className="panel-head">
	                  <h2>เนยโ€ย เน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ‘เน€เธโ€ขเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย</h2>
	                  <span>{orders.filter(o => o.driverId === driverId && o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย").length} เน€เธยเน€เธเธ’เน€เธย</span>
	                </div>
	                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                  {orders
	                    .filter(o => o.driverId === driverId && o.status === "เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย")
	                    .slice()
	                    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""))
	                    .map(order => (
	                      <div key={order.id} style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "8px" }}>
	                        <div>
	                          <b style={{ fontSize: "14px", display: "block" }}>{order.id}</b>
	                          <b style={{ fontSize: "15px", display: "block", color: "#111827" }}>{order.customerName}</b>
	                          <small style={{ color: "#6b7280" }}>เนยโ€ย {order.zone} เธขเธ— เนยโ€เธ เน€เธเธ{money(order.cod || 0)}</small><br/>
	                          {order.deliveredAt && <small style={{ color: "#16a34a", fontWeight: "bold" }}>เนยโ€ฆ {order.deliveredAt}</small>}
	                        </div>
	                        <div style={{ display: "flex", gap: "8px" }}>
	                          <button className="primary" style={{ flex: 1, padding: "8px", fontSize: "12px" }} onClick={() => shareOrderToLine(order)}>เนยโ€เธ เน€เธยเน€เธยเน€เธเธเน€เธย LINE</button>
	                          {order.photo && <a className="secondary" style={{ flex: 1, padding: "8px", fontSize: "12px", textAlign: "center", textDecoration: "none" }} href={order.photo} target="_blank" rel="noreferrer">เนยโ€เธ เน€เธโฌเน€เธยเน€เธเธ”เน€เธโ€เน€เธเธเน€เธเธเน€เธย</a>}
	                        </div>
	                      </div>
	                    ))}
	                </div>
	              </section>
	            )}

	            {driverOrders.length === 0 && (
	              <section className="panel" style={{ background: "#f3f4f6", textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontSize: "32px", margin: "0" }}>เนยยเธ”</p>
                <p style={{ color: "#666", margin: "8px 0 0" }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย เน€เธเธ…เน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธเธเน€เธย</p>
              </section>
            )}
          </div>
        )}

        {displayTab === "reports" && (
          <div className="report-grid">
            <section className="panel">
              <div className="panel-head"><h2>เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธเธเน€เธเธ‘เน€เธย</h2><span>เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ… Supabase</span></div>
              <div className="report-lines">
                <p>เน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€ <b>{orders.length}</b> เน€เธยเน€เธเธ’เน€เธย</p>
                <p>เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย <b>{report.delivered}</b> เน€เธยเน€เธเธ’เน€เธย</p>
                <p>COD เน€เธเธเน€เธเธเน€เธเธ <b>{money(report.cod)}</b> เน€เธยเน€เธเธ’เน€เธโ€”</p>
                <p>เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธย/เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’ <b>{report.complaints.length}</b> เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</h2><span>เน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธย เน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’</span></div>
              {report.driverScore.map(driver => (
                <div key={driver.id} className="score-row">
                  <div><b>{driver.name}</b><span>{driver.jobs} เน€เธยเน€เธเธ’เน€เธย เธขเธ— เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย {driver.done} เธขเธ— เน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ’ {driver.issues}</span></div>
                  <strong><Star size={16} /> {driver.score}</strong>
                </div>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธย</h2><span>{report.complaints.length} เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธ</span></div>
              {report.complaints.length === 0 ? <div className="empty"><MessageSquareWarning size={22} /> เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธเธเน€เธเธ•เน€เธเธเน€เธย</div> : report.complaints.map(order => (
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
                <div className="panel-head"><h2>เนยยเนเธย Admin Control</h2><span>เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ”เน€เธย</span></div>
                <p style={{ color: "#666", fontSize: "12px", marginBottom: "12px" }}>เน€เธโ€”เน€เธยเน€เธเธ’เน€เธยเน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธ”เน€เธโ€”เน€เธยเน€เธเธ”เน€เธยเน€เธยเน€เธเธเน€เธโ€เน€เธเธเน€เธเธ”เน€เธยเน€เธโฌเน€เธโ€ขเน€เธยเน€เธเธ</p>
                <button className="secondary" style={{ background: "#dc2626", color: "white", width: "100%", padding: "10px" }} onClick={() => {
                  const pwd = prompt("เนยโ€ย เน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธ’เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€:");
                  if (pwd === null) return; // User cancelled
                  if (pwd !== "2532") {
                    alert("เนยย เน€เธเธเน€เธเธเน€เธเธ‘เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโ€“เน€เธเธเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธย");
                    return;
                  }
                  if (!window.confirm("เน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธย: เน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธเธเน€เธย? (เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโ€เน€เธยเน€เธเธเน€เธโ€“เน€เธเธเน€เธยเน€เธเธ…เน€เธย)")) return;
                  
                  (async () => {
                    try {
                      if (!supabase) supabase = initSupabase();
                      if (!supabase) {
                        alert("เนยย เน€เธเธเน€เธเธ‘เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธโ€ขเน€เธยเน€เธเธ Supabase เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธย");
                        return;
                      }
                      const { error } = await supabase.from("orders").delete().neq("id", "__never__");
                      if (error) {
                        alert(`เนยย เน€เธเธ…เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${error.message}`);
                        return;
                      }
                      setState(prev => ({ ...prev, orders: [] }));
                      alert("เนยโ€ฆ เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€เน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย!");
                    } catch (e) {
                      alert(`เนยย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ“เน€เธโฌเน€เธเธเน€เธยเน€เธย: ${e?.message || String(e)}`);
                    }
                  })();
                }}>เนยโ€ย เน€เธเธเน€เธเธ•เน€เธโฌเน€เธยเน€เธยเน€เธโ€ขเน€เธยเน€เธโ€เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธโ€</button>
              </section>
            )}
            
            <section className="panel">
              <div className="panel-head"><h2>เนยยเธ Online Status</h2><span>{Object.keys(state.onlineDrivers || {}).length} online</span></div>
              <div className="report-lines">
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted">เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธย</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const lastSeen = state.onlineDrivers?.[driver.id];
                    const timeDiff = Math.floor((new Date().getTime() - lastSeen) / 60000);
                    return (
                      <p key={driver.id}><b>เนยยเธ {driver.name}</b><br/><small>{driver.plate} ({driver.zone}) - {timeDiff}m ago</small></p>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€ย Driver Locations</h2><span>Live Map - Chiang Mai</span></div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className="secondary" onClick={() => setMapZoom(Math.max(10, mapZoom - 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>เนยโ€“ Zoom Out</button>
                <button className="secondary" onClick={() => setMapZoom(Math.min(18, mapZoom + 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>เนยโ€ข Zoom In</button>
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
                <text x="70" y="75" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#b45309">เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย</text>
                
                <rect x="200" y="50" width="100" height="80" fill="#dcfce7" stroke="#16a34a" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="250" y="100" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#166534">เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ”เน€เธเธ</text>
                
                <rect x="50" y="200" width="110" height="90" fill="#cffafe" stroke="#0891b2" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="105" y="250" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#164e63">เน€เธเธ…เน€เธเธ“เน€เธยเน€เธเธเน€เธย</text>
                
                <rect x="250" y="250" width="130" height="100" fill="#f3e8ff" stroke="#a855f7" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="315" y="310" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#6b21a8">เน€เธเธเน€เธเธ’เน€เธยเน€เธโ€เน€เธย/เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธ’</text>
                
                {drivers.map((driver, idx) => {
                  const location = state.driverLocations?.[driver.id];
                  const isOnline = state.onlineDrivers?.[driver.id];
                  let x, y;
                  if (location && location.zone) {
                    const zoneMap = {
                      "เน€เธโฌเน€เธเธเน€เธเธ—เน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ•เน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธย": { x: 70, y: 70 },
                      "เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ”เน€เธเธ": { x: 250, y: 90 },
                      "เน€เธเธ…เน€เธเธ“เน€เธยเน€เธเธเน€เธย": { x: 105, y: 245 },
                      "เน€เธเธเน€เธเธ’เน€เธยเน€เธโ€เน€เธย": { x: 315, y: 300 },
                      "เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธยเน€เธเธ’เน€เธโ€ขเน€เธเธเน€เธย": { x: 315, y: 280 }
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
                <b>เนยโ€เธ… เน€เธเธเน€เธโ€“เน€เธเธ’เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธย ({Object.keys(state.onlineDrivers || {}).length})</b>
                {drivers.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#999" }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธยเน€เธเธ‘เน€เธย</p>
                ) : (
                  drivers.map(d => (
                    <p key={d.id} style={{ fontSize: "12px", margin: "6px 0", padding: "6px", background: state.onlineDrivers?.[d.id] ? "#e8f5e9" : "#f5f5f5", borderRadius: "4px" }}>
                      <b>{state.onlineDrivers?.[d.id] ? "เนยยเธ" : "เนยเธ"} {d.name}</b>
                      <br />
                      <small>เนยโ€เธ‘ {d.phone} เธขเธ— {d.plate} เธขเธ— {d.zone}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€ย Login History</h2><span>{(state.loginHistory || []).length} entries</span></div>
              <div className="report-lines" style={{ maxHeight: "400px", overflowY: "auto" }}>
                {(state.loginHistory || []).length === 0 ? (
                  <p className="muted">เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธเธ’เน€เธเธเน€เธเธ…เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ”เน€เธย</p>
                ) : (
                  state.loginHistory.slice(0, 20).map(entry => (
                    <p key={entry.id} style={{ fontSize: "13px", paddingBottom: "8px", borderBottom: "1px solid #eee" }}>
                      <b>{entry.name}</b> ({entry.role === "driver" ? "เนยยโ€” Driver" : "เนยโ€เธ Sales"}) <br/>
                      <small>เนยโ€เธ‘ {entry.phone}</small> <br/>
                      <small>เนยเธ {entry.loginAt}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€ย เน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ“เน€เธเธเน€เธเธ‘เน€เธย</h2><span>เน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธเธเน€เธเธ…เน€เธยเน€เธเธ’เน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธโ€”เน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธเธ‘เน€เธย</span></div>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                copyToClipboard(report);
              }}><FileText size={16} /> เน€เธเธเน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธยเน€เธเธ’เน€เธยเน€เธยเน€เธเธ…เน€เธเธเน€เธยเน€เธเธ‘เน€เธโ€เน€เธเธ…เน€เธเธเน€เธย</button>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                const element = document.createElement("a");
                element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(report));
                element.setAttribute("download", `Hillkoff-Report-${new Date().toLocaleDateString("th-TH")}.txt`);
                element.style.display = "none";
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              }}><Download size={16} /> เน€เธโ€เน€เธเธ’เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธโฌเน€เธยเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธ…เน€เธย</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนยโ€เธ System Control</h2><span>เน€เธโฌเน€เธยเน€เธยเน€เธเธ’เน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธโฌเน€เธยเน€เธเธ”เน€เธย</span></div>
              <button className="primary wide" onClick={() => window.location.reload()} style={{ background: "#2563eb", color: "white", padding: "12px", fontSize: "14px", fontWeight: "bold" }}>
                เนยโ€ย เน€เธเธเน€เธเธ•เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธย
              </button>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "10px", textAlign: "center" }}>
                เน€เธยเน€เธเธเน€เธโ€เน€เธเธ•เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธเน€เธเธ’เน€เธเธเน€เธโ€“เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธ’เน€เธย เน€เธเธเน€เธเธเน€เธเธ—เน€เธเธเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธโ€ขเน€เธยเน€เธเธเน€เธโฌเน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธโฌเน€เธเธเน€เธเธเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธยเน€เธโ€เน€เธย เน€เธยเน€เธโ€ เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธยเน€เธเธ•เน€เธยเน€เธโฌเน€เธยเน€เธเธ—เน€เธยเน€เธเธเน€เธเธเน€เธเธ•เน€เธยเน€เธเธเน€เธเธ…เน€เธโ€เน€เธเธเน€เธเธเน€เธยเน€เธย
              </p>
            </section>
          </div>
        )}
      </section>
    </main>

    <button
      className="primary"
      onClick={() => setChatOpen(true)}
      style={{
        position: "fixed",
        right: "16px",
        bottom: "16px",
        width: "52px",
        height: "52px",
        borderRadius: "999px",
        display: "grid",
        placeItems: "center",
        zIndex: 1200
      }}
      title="เน€เธยเน€เธยเน€เธโ€”"
    >
      เนยโ€เธ
    </button>

    {chatOpen && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1300, display: "grid", placeItems: "end center", padding: "16px" }}>
        <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <b>เนยโ€เธ เน€เธยเน€เธยเน€เธโ€”เน€เธโ€”เน€เธเธ•เน€เธเธ</b>
            <button className="secondary" onClick={() => setChatOpen(false)} style={{ padding: "6px 10px", fontSize: "12px" }}>เน€เธยเน€เธเธ”เน€เธโ€</button>
          </div>
          <div style={{ padding: "12px 14px", maxHeight: "280px", overflowY: "auto", background: "#f9fafb", display: "grid", gap: "8px" }}>
            {chatMessages.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>เน€เธเธเน€เธเธ‘เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ•เน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธ</p>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <b style={{ fontSize: "12px" }}>{m.sender_name || "เน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธเน€เธยเน€เธเธ"} {m.sender_role ? `(${m.sender_role})` : ""}</b>
                    <small style={{ color: "#6b7280" }}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString("th-TH") : ""}</small>
                  </div>
                  <div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.message}</div>
                  {m.sender_phone && <a href={`tel:${m.sender_phone}`} style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}>เนยโ€ย {m.sender_phone}</a>}
                </div>
              ))
            )}
          </div>
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
            <input value={chatText} onChange={e => setChatText(e.target.value)} placeholder="เน€เธยเน€เธเธ”เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธยเน€เธเธเน€เธยเน€เธเธเน€เธเธ’เน€เธเธ..." style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: "10px" }} />
            <button className="primary" onClick={sendChat} style={{ padding: "10px 14px" }}>เน€เธเธเน€เธยเน€เธย</button>
          </div>
        </div>
      </div>
    )}

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
          <h2 style={{ marginTop: 0, color: "#1f2937" }}>เนยโ€เธ เน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธเน€เธเธเน€เธโฌเน€เธโ€เน€เธเธเน€เธเธเน€เธย</h2>
          <div style={{ background: "#f3f4f6", padding: "12px", borderRadius: "6px", margin: "12px 0" }}>
            <p><b>เน€เธเธ…เน€เธเธเน€เธยเน€เธยเน€เธยเน€เธเธ’:</b> {pendingOrder.customerName}</p>
            <p><b>เน€เธยเน€เธเธ—เน€เธยเน€เธยเน€เธโ€”เน€เธเธ•เน€เธย:</b> {pendingOrder.zone}</p>
            <p><b>เน€เธเธเน€เธยเน€เธยเน€เธเธ’เน€เธโ€ขเน€เธยเน€เธเธ’เน€เธยเน€เธโฌเน€เธเธเน€เธเธ…เน€เธเธ’:</b> {pendingOrder.window}</p>
            <p><b>เน€เธยเน€เธเธ“เน€เธยเน€เธเธเน€เธยเน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย:</b> {pendingOrder.boxes} เน€เธยเน€เธเธ…เน€เธยเน€เธเธเน€เธย</p>
            <p><b>COD:</b> เน€เธเธ{money(pendingOrder.cod)}</p>
            {pendingOrder.salesNote && <p><b>เน€เธเธเน€เธเธเน€เธเธ’เน€เธเธเน€เธโฌเน€เธเธเน€เธโ€ขเน€เธเธ:</b> {pendingOrder.salesNote}</p>}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button className="secondary" style={{ flex: 1 }} onClick={() => setShowOrderConfirm(false)}>เนยย เน€เธเธเน€เธยเน€เธโฌเน€เธเธ…เน€เธเธ”เน€เธย</button>
            <button className="primary" style={{ flex: 1 }} onClick={confirmOrder}>เนยโ€ฆ เน€เธเธเน€เธเธ—เน€เธยเน€เธเธเน€เธเธ‘เน€เธยเน€เธเธเน€เธยเน€เธย</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}




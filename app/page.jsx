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
    console.error("โ Missing Supabase env vars:", { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
    return null;
  }
  
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log("โ… Supabase initialized:", supabaseUrl);
  return supabase;
}

const initialDrivers = [];

const ZONES = ["เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน", "เนเธกเนเธฃเธดเธก", "เธชเธฑเธเธเธณเนเธเธ", "เธ”เธญเธขเธชเธฐเน€เธเนเธ”", "เธซเธฒเธเธ”เธ", "เธชเธฑเธเธเนเธฒเธ•เธญเธ", "เธฅเธณเธเธนเธ", "เธฅเธณเธเธฒเธ", "เน€เธเธตเธขเธเธฃเธฒเธข", "เธเธฐเน€เธขเธฒ"];
const STATUS = ["เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ", "เธเธณเธฅเธฑเธเธชเนเธ", "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ", "เธชเนเธเธชเธณเน€เธฃเนเธ", "เธ•เธดเธ”เธเธฑเธเธซเธฒ", "เธขเธเน€เธฅเธดเธ"];
const statusColor = { "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ": "#92400e", "เธเธณเธฅเธฑเธเธชเนเธ": "#1d4ed8", "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ": "#f59e0b", "เธชเนเธเธชเธณเน€เธฃเนเธ": "#166534", "เธ•เธดเธ”เธเธฑเธเธซเธฒ": "#b91c1c", "เธขเธเน€เธฅเธดเธ": "#dc2626" };

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
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน", address: "", mapUrl: "", note: "" });
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
  const [driverForm, setDriverForm] = useState({ firstName: "", lastName: "", phone: "", vehicle: "เธฃเธ–เธขเธเธ•เน", plate: "", zone: "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน" });
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderZoneFilter, setOrderZoneFilter] = useState("all");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน", address: "", mapUrl: "", note: "" });
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
    lines.push(`เธชเนเธเธเธญเธเธชเธณเน€เธฃเนเธ โ…`);
    lines.push(`เธญเธญเน€เธ”เธญเธฃเน: ${order.id}`);
    if (order.customerName) lines.push(`เธฅเธนเธเธเนเธฒ: ${order.customerName}`);
    if (order.customerPhone) lines.push(`เนเธ—เธฃ: ${order.customerPhone}`);
    if (order.address) lines.push(`เธ—เธตเนเธญเธขเธนเน: ${order.address}`);
    if (order.zone) lines.push(`เนเธเธ: ${order.zone}`);
    if (order.window) lines.push(`เธเนเธงเธเน€เธงเธฅเธฒ: ${order.window}`);
    if (order.boxes != null) lines.push(`เธเธณเธเธงเธ: ${order.boxes} เธเธฅเนเธญเธ`);
    lines.push(`COD: เธฟ${money(order.cod || 0)}`);
    if (order.deliveredAt) lines.push(`เน€เธงเธฅเธฒ: ${order.deliveredAt}`);
    if (order.mapUrl) lines.push(`เนเธเธเธ—เธตเน: ${order.mapUrl}`);
	    if (order.photo) lines.push(`POD: (เนเธเธเธฃเธนเธเนเธเนเธเธ—)`);
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
	          alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์แบบแนบไฟล์อัตโนมัติ กรุณาเปิดผ่านมือถือ (Chrome/Safari) แล้วกดแชร์อีกครั้ง หรือแนบรูปเองใน LINE");
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
    console.log("๐— Driver detected - forcing initial fetch...");
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
      
      console.log("๐” Notification sound played");
    } catch (e) {
      console.error("โ Error playing notification sound:", e);
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
      alert("โ เธขเธฑเธเน€เธเธทเนเธญเธกเธ•เนเธญ Supabase เนเธกเนเนเธ”เน");
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
      alert(`โ เธชเนเธเธเนเธญเธเธงเธฒเธกเนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message}`);
      return;
    }
    await refreshChat();
  };

  // Polling mechanism for real-time sync
  const refreshFromSupabase = async () => {
    if (!supabase) {
      console.warn("โ ๏ธ Supabase not initialized yet");
      return;
    }
    
    // Skip refresh during reset to prevent old data from being restored
    if (isResettingOrdersRef.current) {
      console.log("โธ๏ธ Skipping refreshFromSupabase during reset");
      return;
    }
    
    try {
      // Fetch latest data from Supabase
      const { data: supabaseOrders, error: ordersError } = await supabase.from("orders").select("*");
      const { data: supabaseCustomers, error: customersError } = await supabase.from("customers").select("*");
      // Note: drivers table is intentionally empty by design - no fetch needed
      const { data: supabaseDriverLocations, error: driverLocationsError } = await supabase.from("driver_locations").select("*");

      if (ordersError) setSyncStatus?.(`โ ๏ธ Supabase orders error: ${ordersError.message}`);
      if (customersError) console.warn("โ ๏ธ Supabase customers pull error:", customersError.message);
      if (driverLocationsError) console.warn("โ ๏ธ Supabase driver_locations pull error:", driverLocationsError.message);
      
      console.log("๐“ฅ Pulled from Supabase:", { orders: supabaseOrders?.length, customers: supabaseCustomers?.length, driver_locations: supabaseDriverLocations?.length });
      
      setState(prev => {
        let changed = false;
        const newState = { ...prev };
        
        // Skip all merging during reset to prevent old data from being restored
        if (isResettingOrdersRef.current) {
          console.log("โธ๏ธ [RESET] Skipping merge during reset - isResettingOrders = true");
          return prev;
        }
        
        // For orders: merge - keep local orders, update status/data from Supabase
        if (Array.isArray(supabaseOrders) && Array.isArray(prev.orders)) {
          console.log(`๐” Merging orders: ${prev.orders.length} local + ${supabaseOrders.length} from Supabase`);
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
              // Keep local status if it's more advanced (e.g., local "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ" shouldn't revert to "เธเธณเธฅเธฑเธเธชเนเธ")
              const statusHierarchy = { "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ": 0, "เธเธณเธฅเธฑเธเธชเนเธ": 1, "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ": 2, "เธชเนเธเธชเธณเน€เธฃเนเธ": 3, "เธขเธเน€เธฅเธดเธ": 4 };
              const shouldKeepLocalStatus = (statusHierarchy[localOrder.status] || -1) > (statusHierarchy[order.status] || -1);
              const photo = localOrder.photo || order.photo; // Keep photo if either has it
              
              merged[idx] = { ...order, ...localOrder, status: shouldKeepLocalStatus ? localOrder.status : order.status, photo };
              console.log(`๐“ Updated order ${order.id}${shouldKeepLocalStatus ? ` (kept local status: ${localOrder.status})` : ""}`);
            } else if (prev.auth?.role === "driver") {
              // Driver page: STRICT FILTER - only add available orders OR orders already assigned to this driver
              const isAvailable = !order.driverId || order.driverId === "" || order.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ";
              const isMyOrder = order.driverId === currentDriverId;
              
              if (isAvailable || isMyOrder) {
                merged.push(order);
                if (isAvailable) newOrdersAdded++;
                console.log(`โ• [NEW ORDER] Added order ${order.id} for driver - ${order.customerName} ${isMyOrder ? "(already assigned)" : "(available)"}`);
              } else {
                console.log(`โ [FILTERED] Skipping order ${order.id} (assigned to different driver: ${order.driverId})`);
              }
            } else if (prev.auth?.role === "sales") {
              // Sales page: ADD all new orders from Supabase
              merged.push(order);
              newOrdersAdded++;
              console.log(`โ• [NEW ORDER] Added new order ${order.id} for sales - ${order.customerName}`);
            } else {
              // Skip in other cases to prevent deleted orders from being pulled back
              console.log(`โญ๏ธ Skipping order ${order.id} from Supabase (not applicable for current role)`);
            }
          }
          
          // Play sound notification if new available orders were added (not already assigned ones)
          if (newOrdersAdded > 0 && previousOrderCountRef.current < merged.filter(o => !o.driverId || o.driverId === "" || o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").length) {
            console.log(`๐”” ${newOrdersAdded} new available order(s) detected! Playing notification sound...`);
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
            console.log("๐‘ค Customers merged from Supabase");
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
      console.log("โ ๏ธ Polling error:", error);
    }
  };

  useEffect(() => {
    if (!supabase) {
      console.warn("โ ๏ธ Supabase not initialized yet");
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
      console.log("๐” [RESET-RECOVERY] Delaying first poll by 3s to let delete complete...");
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
          console.log("๐“ก Real-time orders update:", payload.eventType, payload.new?.id);
          
          // Check if an order was accepted by another driver
          if (payload.eventType === "UPDATE" && payload.new?.driverId) {
            const oldOrder = payload.old;
            const newOrder = payload.new;
            
            // If driverId changed from empty to assigned (someone accepted the order)
            if ((!oldOrder?.driverId || oldOrder.driverId === "") && newOrder.driverId) {
              const assignedDriver = state.drivers?.find(d => d.id === newOrder.driverId);
              const driverName = assignedDriver?.name || newOrder.driverName || newOrder.driverId;
              console.log(`๐ฏ Order ${newOrder.id} was accepted by ${driverName}`);
              setSyncStatus(`๐“ฆ ${newOrder.id} เธ–เธนเธเธฃเธฑเธเนเธเนเธ”เธข ${driverName}`);
              playNotificationSound();
              
              // Show notification to other drivers
              if (state.auth?.role === "driver" && state.auth?.driverId !== newOrder.driverId) {
                console.log(`โน๏ธ Notifying other drivers about accepted order`);
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
        status: order.status || "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ",
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
      console.log("โธ๏ธ [RESET] Skipping syncToSupabase - reset is in progress");
      return;
    }
    
    if (!supabase) {
      console.warn("โ Supabase not initialized");
      return;
    }
    console.log("๐ syncToSupabase called - orders count:", currentState.orders?.length);
    
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
            if (error) console.error("โ Customer sync error:", error.message, customer.id);
          } catch (e) {
            console.error("โ Exception syncing customer:", customer.id, e.message);
          }
        }
        console.log("โ… Customers synced:", currentState.customers.length);
      }
      
      // Sync orders (always sync, even if empty)
      console.log("๐“ค Syncing orders to Supabase:", currentState.orders?.length || 0);
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
              status: order.status || "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ",
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
              console.error("โ Order sync error:", error.message, "Order:", order.id);
            } else {
              console.log(`โ… Order synced: ${order.id} (status: ${status})`);
            }
          } catch (e) {
            console.error("โ Exception syncing order:", order.id, e.message);
          }
        }
        console.log("โ… All orders synced to Supabase");
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
             if (error) console.warn("โ ๏ธ driver_locations sync skipped:", error.message);
           } catch (e) {
             console.warn("โ ๏ธ driver_locations sync exception:", e?.message || String(e));
           }
         }
       }
       
       // Clear pending order updates after successful sync
       pendingOrderUpdatesRef.current.clear();
       
       // login_history table is optional; intentionally skipped.
    } catch (error) {
      console.error("โ Supabase sync error:", error);
    }
  };

  useEffect(() => {
    // Auto-sync to Supabase on any data change (but skip during reset)
    // Data is NOT stored in localStorage - Supabase is the only source of truth
    if (!isResettingOrdersRef.current) {
      console.log("๐” State changed - calling syncToSupabase with orders:", state.orders?.length || 0);
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
    const delivered = orders.filter(order => order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ");
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
    setCustomerForm({ name: "", contact: "", phone: "", zone: "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน", address: "", mapUrl: "", note: "" });
    setSyncStatus(`โ… เธเธฑเธเธ—เธถเธเธฅเธนเธเธเนเธฒ "${nextCustomer.name}" เธชเธณเน€เธฃเนเธ`);
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
      setSyncStatus(`โ Login error: ${e.message || "network/server error"}`);
      return;
    }
    if (!json.ok) {
      setSyncStatus(`โ ${json.error || "เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเนเธกเนเธชเธณเน€เธฃเนเธ"}`);
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
      setSyncStatus(`โ Login error: ${e.message || "network/server error"}`);
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
      //   setSyncStatus(`โ ๏ธ เธเธฑเธเธ—เธถเธเธฅเธเธเธฒเธเธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ (เธฃเธฐเธเธเธเธฐเธเธขเธฒเธขเธฒเธก sync เธ•เนเธญเน€เธเธทเนเธญเธ): ${saved.error}`);
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
      setSyncStatus(`โ เธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเธเธเธเธฑเธเธฅเธ Supabase เนเธกเนเธชเธณเน€เธฃเนเธ: ${e.message || e}`);
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
    setDriverForm({ firstName: "", lastName: "", phone: "", vehicle: "เธฃเธ–เธขเธเธ•เน", plate: "", zone: "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน" });
    setTab("driver");
    // Driver synced automatically via syncToSupabase
    setSyncStatus(`โ… เธฅเธเธ—เธฐเน€เธเธตเธขเธเธเธเธเธฑเธ "${nextDriver.name}" เธชเธณเน€เธฃเนเธ`);
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
      setSyncStatus("โ เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธเธทเนเธญเธฅเธนเธเธเนเธฒ");
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
      setSyncStatus(`โ… เธเธฑเธเธ—เธถเธเธฅเธนเธเธเนเธฒเนเธซเธกเน "${customer.name}" เธญเธฑเธ•เนเธเธกเธฑเธ•เธด`);
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
      status: "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ",
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
    
    console.log("๐“ค confirmOrder: Adding order to state", pendingOrder.id);
    setState(prev => {
      const updated = { ...prev, orders: [pendingOrder, ...prev.orders] };
      console.log("๐“ค confirmOrder: State updated - total orders:", updated.orders.length);
      console.log("๐“ค confirmOrder: Orders in state:", updated.orders.map(o => o.id));
      return updated;
    });
    
    setOrderForm({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setShowOrderConfirm(false);
    setPendingOrder(null);
    setSyncStatus(`โณ เธเธณเธฅเธฑเธเธชเนเธเธญเธญเน€เธ”เธญเธฃเนเน€เธเนเธฒเธเธดเธง...`);
    
    // Wait longer for Supabase to actually save before switching tabs (deprecated)
    (async () => {
      console.log("โฐ Waiting 2000ms complete");
      setTab("driver");
      setSyncStatus(`โ… เธชเนเธเธญเธญเน€เธ”เธญเธฃเน "${pendingOrder.id}" เน€เธเนเธฒเธเธดเธงเธชเธณเน€เธฃเนเธ`);
      // Let polling refresh the data
      await refreshFromSupabase();
    })();
  };

  const deleteOrder = (orderId) => {
    if (confirm("โ เธฅเธเธญเธญเน€เธ”เธญเธฃเนเธเธตเนเธซเธฃเธทเธญเนเธกเน? เธเธฒเธฃเธเธฃเธฐเธ—เธณเธเธตเนเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเธเน€เธฅเธดเธเนเธ”เน")) {
      setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    }
  };

  const updateOrder = (id, patch) => {
    console.log(`๐“ updateOrder: ${id}`, patch);
    setState(prev => {
      const updated = { ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) };
      
      // Auto-sync to Supabase immediately
      if (supabase) {
        const order = updated.orders.find(o => o.id === id);
        if (order) {
          (async () => {
            const { ok, error } = await upsertOrderToSupabase(order);
            if (!ok) {
              console.error(`โ Failed to sync order ${id}:`, error);
            } else {
              console.log(`โ… Order ${id} synced to Supabase`);
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
    status: nextDriverId ? "เธเธณเธฅเธฑเธเธชเนเธ" : "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ"
  });

  const uploadPod = async (order, file) => {
  if (!file) return;
  try {
    setSyncStatus("กำลังบันทึกรูป POD ในเครื่อง...");

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read failed"));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });

    if (!dataUrl) throw new Error("read failed");
    updateOrder(order.id, { photo: dataUrl, podUploading: false, sharedToLine: false });
    setSyncStatus("✅ บันทึกรูป POD แล้ว (เก็บในเครื่อง) — โปรดกดแชร์ลง LINE");
  } catch (error) {
    setSyncStatus(`❌ บันทึกรูป POD ไม่สำเร็จ: ${error.message || error}`);
  }
};

  const acceptOrder = async (id) => {
    // Check if driver is logged in
    if (!driverId) {
      setSyncStatus("โ ๏ธ เธเธเธเธฑเธเธขเธฑเธเนเธกเนเนเธ”เนเน€เธฅเธทเธญเธ เธเธฃเธธเธ“เธฒเธ•เธฑเนเธเธเนเธฒเธเธฃเธฐเธเธณเธ•เธฑเธงเนเธซเนเธ–เธนเธเธ•เนเธญเธ");
      return;
    }

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`โ ๏ธ เธเนเธญเธกเธนเธฅเธเธเธเธฑเธ "${driverId}" เนเธกเนเธเธเนเธเธฃเธฐเธเธ เธฅเธญเธเธฃเธตเน€เธเธฃเธเธซเธเนเธฒเธ”เธนเธเธฃเธฑเธ`);
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
            status: "เธเธณเธฅเธฑเธเธชเนเธ"
          })
          .eq("id", id)
          .or("driverId.is.null,driverId.eq.")
          .select("*")
          .maybeSingle();

        if (error) {
          setSyncStatus(`โ เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเนเนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message}`);
          return;
        }

        if (!data) {
          setSyncStatus(`โ ๏ธ เธญเธญเน€เธ”เธญเธฃเน "${id}" เธ–เธนเธเธเธเธญเธทเนเธเธฃเธฑเธเนเธเนเธฅเนเธง`);
          await refreshFromSupabase();
          return;
        }

        console.log("โ… [ACCEPT] Order accepted in Supabase, updating local state...");
        // Update local state immediately to show change
        const accepted = convertToCamelCase(data);
        setState(prev => ({
          ...prev,
          orders: prev.orders.map(o => o.id === id ? accepted : o)
        }));
        setSyncStatus(`โ… เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเน "${id}" เน€เธฃเธตเธขเธเธฃเนเธญเธข`);
        // Don't refreshFromSupabase - let polling handle it to avoid race condition
        return;
      } catch (e) {
        setSyncStatus(`โ เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเนเนเธกเนเธชเธณเน€เธฃเนเธ: ${e?.message || String(e)}`);
        return;
      }
    }

    updateOrder(id, { driverId, driverName, status: "เธเธณเธฅเธฑเธเธชเนเธ" });
  };
  const checkIn = id => {
    if (!driverId) {
      setSyncStatus("โ ๏ธ เธเธเธเธฑเธเธขเธฑเธเนเธกเนเนเธ”เนเน€เธฅเธทเธญเธ เธเธฃเธธเธ“เธฒเธ•เธฑเนเธเธเนเธฒเธเธฃเธฐเธเธณเธ•เธฑเธงเนเธซเนเธ–เธนเธเธ•เนเธญเธ");
      return;
    }

    const order = orders.find(o => o.id === id);
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`โ ๏ธ เธเนเธญเธกเธนเธฅเธเธเธเธฑเธ "${driverId}" เนเธกเนเธเธเนเธเธฃเธฐเธเธ เธฅเธญเธเธฃเธตเน€เธเธฃเธเธซเธเนเธฒเธ”เธนเธเธฃเธฑเธ`);
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
    updateOrder(id, { status: "เธชเนเธเธชเธณเน€เธฃเนเธ", deliveredAt: new Date().toLocaleString("th-TH") });
    
    // Show order summary alert
    const summaryText = `โ… เธชเนเธเธชเธณเน€เธฃเนเธ!\n\n๐“ฆ เธญเธญเน€เธ”เธญเธฃเน: ${order.customerName}\n๐“ ${order.zone}\n๐’ฐ COD: เธฟ${money(order.cod || 0)}\n๐“ธ POD: ${order.photo ? "โ… เธกเธต" : "โ เนเธกเนเธกเธต"}\n\nเธญเธญเน€เธ”เธญเธฃเนเธ–เธนเธเธฅเธเธ—เธฐเน€เธเธตเธขเธเนเธเธฃเธฐเธเธเนเธฅเนเธง`;
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
            name: driver?.name || "เนเธกเนเธ—เธฃเธฒเธ",
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
        driverStats[order.driverId][order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ" ? "completed" : order.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? "active" : "failed"] += 1;
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

    let report = `\n${"โ•".repeat(60)}\n`;
    report += `๐“ เธฃเธฒเธขเธเธฒเธเธเธฒเธฃเธชเนเธเธเธญเธเธเธฃเธฐเธเธณเธงเธฑเธ\n`;
    report += `เธงเธฑเธเธ—เธตเน: ${today}\n`;
    report += `เน€เธงเธฅเธฒเธชเธฃเนเธฒเธเธฃเธฒเธขเธเธฒเธ: ${new Date().toLocaleString("th-TH")}\n`;
    report += `${"โ•".repeat(60)}\n\n`;
    
    report += `๐“ เธชเธฃเธธเธเธเนเธญเธกเธนเธฅเธฃเธงเธกเธ—เธฑเนเธเธงเธฑเธ:\n`;
    report += `${"โ”€".repeat(60)}\n`;
    report += `  ๐“ฆ เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”: ${todayOrders.length} เธเธฒเธ\n`;
    report += `  โ… เธชเธณเน€เธฃเนเธ: ${todayOrders.filter(o => o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length} เธเธฒเธ\n`;
    report += `  ๐ก เธเธณเธฅเธฑเธเธชเนเธ: ${todayOrders.filter(o => o.status === "เธเธณเธฅเธฑเธเธชเนเธ").length} เธเธฒเธ\n`;
    report += `  โณ เธฃเธญเธฃเธฑเธ: ${todayOrders.filter(o => o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").length} เธเธฒเธ\n`;
    report += `  โ เธ•เธดเธ”เธเธฑเธเธซเธฒ: ${todayOrders.filter(o => o.status === "เธ•เธดเธ”เธเธฑเธเธซเธฒ").length} เธเธฒเธ\n`;
    report += `  ๐’ฐ เธฃเธงเธก COD: ${money(totalCOD)} เธเธฒเธ—\n\n`;

    report += `๐‘ฅ เธเนเธญเธกเธนเธฅเธฃเธฒเธขเธเธเธเธฑเธ:\n`;
    report += `${"โ”€".repeat(60)}\n`;
    
    Object.entries(driverStats).forEach(([driverId, stats]) => {
      report += `\n๐— ${stats.name}\n`;
      report += `  ๐“ฑ เน€เธเธญเธฃเนเนเธ—เธฃ: ${stats.phone}\n`;
      report += `  ๐๏ธ เน€เธเธฅเธ•: ${stats.plate}\n`;
      report += `  ๐“ เนเธเธ: ${stats.zone}\n`;
      report += `  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€\n`;
      report += `  ๐“ฆ เธญเธญเน€เธ”เธญเธฃเนเธฃเธงเธก: ${stats.total} เธเธฒเธ\n`;
      report += `     โ… เธชเธณเน€เธฃเนเธ: ${stats.completed} เธเธฒเธ\n`;
      report += `     ๐ก เธเธณเธฅเธฑเธเธชเนเธ: ${stats.active} เธเธฒเธ\n`;
      report += `     โ เนเธกเนเธชเธณเน€เธฃเนเธ: ${stats.failed} เธเธฒเธ\n`;
      report += `  ๐’ฐ COD เธฃเธงเธก: ${money(stats.cod)} เธเธฒเธ—\n`;
      report += `  โฑ๏ธ เธเธฃเธฐเธชเธดเธ—เธเธดเธ เธฒเธ: ${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}%\n`;
      
      if (stats.checkins.length > 0) {
        report += `  ๐“ เธเธธเธ”เน€เธเนเธเธญเธดเธ (${stats.checkins.length} เธเธธเธ”):\n`;
        stats.checkins.slice(0, 8).forEach((c, idx) => {
          report += `     ${idx + 1}. ${c.time} - ${c.customer}\n`;
          report += `        ๐“ ${c.address}\n`;
        });
        if (stats.checkins.length > 8) report += `     ... เนเธฅเธฐเธญเธตเธ ${stats.checkins.length - 8} เธเธธเธ”\n`;
      }
    });

    report += `\n${"โ•".repeat(60)}\n`;
    report += `๐“ เธซเธกเธฒเธขเน€เธซเธ•เธธ:\n`;
    report += `  โ€ข เธฃเธฒเธขเธเธฒเธเธเธตเนเธชเธฃเนเธฒเธเธเธฒเธเธฃเธฐเธเธ Hillkoff Delivery System\n`;
    report += `  โ€ข เธเนเธญเธกเธนเธฅเน€เธเนเธเธญเธฑเธ•เน€เธงเธฅเธฒ เธ“ เน€เธงเธฅเธฒเธชเธฃเนเธฒเธเธฃเธฒเธขเธเธฒเธ\n`;
    report += `  โ€ข เธ•เธฃเธงเธเธชเธญเธเน€เธฅเธเธ—เธตเนเธญเธญเน€เธ”เธญเธฃเนเนเธฅเธฐ COD เธเนเธญเธเธ•เธฑเธ”เธชเธดเธ\n`;
    report += `${"โ•".repeat(60)}\n`;
    
    return report;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("เธเธฑเธ”เธฅเธญเธเธฃเธฒเธขเธเธฒเธเธชเธณเน€เธฃเนเธ!");
    }).catch(() => {
      alert("เธเธฑเธ”เธฅเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน");
    });
  };

  const totals = {
    jobs: orders.length,
    waiting: orders.filter(order => order.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").length,
    active: orders.filter(order => order.status === "เธเธณเธฅเธฑเธเธชเนเธ").length,
    done: orders.filter(order => order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length
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
              <div className="panel-head"><h1>เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธ</h1><span>เนเธเน Supabase</span></div>
              <div className="segmented">
                <button className={loginForm.role === "sales" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "sales" }))}>เธเนเธฒเธขเธเธฒเธข</button>
                <button className={loginForm.role === "driver" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "driver" }))}>เธเธเธเธฑเธ</button>
              </div>
              {loginForm.role === "sales" && <input value={loginForm.name} onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))} placeholder="เธเธทเนเธญเธเธนเนเนเธเนเธเธฒเธเธเนเธฒเธขเธเธฒเธข" />}
              <input value={loginForm.phone} onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธเธญเธฃเนเนเธ—เธฃ" />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)} />
                เธเธ”เธเธณเน€เธเธญเธฃเนเนเธ—เธฃเนเธเธเธฃเธฑเนเธเธ•เนเธญเนเธ
              </label>
              <button className="primary wide" onClick={loginForm.role === "sales" ? loginSales : loginDriver}>
                {loginForm.role === "sales" ? "เน€เธเนเธฒเธซเธเนเธฒเนเธ”เธเธเธญเธฃเนเธ”เธเนเธฒเธขเธเธฒเธข" : "เน€เธเนเธฒเธชเธนเนเธฃเธฐเธเธเธเธเธเธฑเธ"}
              </button>
              <p className="login-note">เธฃเธฐเธเธเธเธฐเนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒ เธญเธญเน€เธ”เธญเธฃเน เนเธฅเธฐเธเธเธเธฑเธเธเธฒเธ Supabase เธซเธฅเธฑเธเธฅเนเธญเธเธญเธดเธ</p>
            </>
          ) : (
            <>
              <div className="panel-head"><h1>เธฅเธเธ—เธฐเน€เธเธตเธขเธเธเธเธเธฑเธ</h1><span>เธเธฃเธฑเนเธเนเธฃเธเน€เธ—เนเธฒเธเธฑเนเธ</span></div>
              <div className="form-grid two">
                <input value={driverForm.firstName} onChange={e => setDriverForm(p => ({ ...p, firstName: e.target.value }))} placeholder="เธเธทเนเธญ" />
                <input value={driverForm.lastName} onChange={e => setDriverForm(p => ({ ...p, lastName: e.target.value }))} placeholder="เธชเธเธธเธฅ" />
                <input value={driverForm.phone} onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธเธญเธฃเนเนเธ—เธฃ" />
                <input value={driverForm.vehicle} onChange={e => setDriverForm(p => ({ ...p, vehicle: e.target.value }))} placeholder="เธฃเธ–เธ—เธตเนเนเธเน" />
                <input value={driverForm.plate} onChange={e => setDriverForm(p => ({ ...p, plate: e.target.value }))} placeholder="เธ—เธฐเน€เธเธตเธขเธเธฃเธ–" />
                <select value={driverForm.zone} onChange={e => setDriverForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <button className="primary wide" onClick={registerDriver}>เธเธฑเธเธ—เธถเธเนเธฅเธฐเน€เธเนเธฒเนเธเนเธเธฒเธเธเธเธเธฑเธ</button>
              <button className="secondary wide" onClick={logout}>เธเธฅเธฑเธเนเธเธซเธเนเธฒ Login</button>
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
            <p>เน€เธเธตเธขเธเนเธซเธกเนเนเธฅเธฐเธเธฑเธเธซเธงเธฑเธ”เนเธเธฅเนเน€เธเธตเธขเธ ยท {todayText()}</p>
            <h1>{displayTab === "sales" ? "Sales Delivery Dashboard" : displayTab === "dispatch" ? "Dispatch Work Dashboard" : displayTab === "driver" ? "Driver Realtime Orders" : displayTab === "settings" ? "System Settings" : "Daily Report & Service Quality"}</h1>
          </div>
          <div className="top-actions">
            <span className="google-status">{auth.role === "driver" ? "เธเธเธเธฑเธ" : "เธเนเธฒเธขเธเธฒเธข"}: {auth.name || auth.phone}</span>
            <button className="secondary" onClick={logout}>เธญเธญเธ</button>
          </div>
        </header>
        <div className="sync-banner">{syncStatus}</div>

        <div className="stats">
          <Stat icon={PackagePlus} label="เธญเธญเน€เธ”เธญเธฃเนเธงเธฑเธเธเธตเน" value={`${totals.jobs} เธเธฒเธ`} sub="เธเนเธฒเธขเธเธฒเธขเน€เธเธดเธ”เธเธฒเธเธชเนเธ" />
          <Stat icon={UserCheck} label="เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ" value={`${totals.waiting} เธเธฒเธ`} sub="เน€เธ”เนเธเน€เธเนเธฒเธซเธเนเธฒเธเธเธเธฑเธ" tone="#92400e" />
          <Stat icon={Navigation} label="เธเธณเธฅเธฑเธเธชเนเธ" value={`${totals.active} เธเธฒเธ`} sub="เน€เธเนเธเธญเธดเธเนเธ”เนเธเธฒเธเธซเธเนเธฒเธเธฒเธ" tone="#1d4ed8" />
          <Stat icon={CheckCircle2} label="เธชเนเธเธชเธณเน€เธฃเนเธ" value={`${totals.done} เธเธฒเธ`} sub="เธ•เนเธญเธเธกเธตเธซเธฅเธฑเธเธเธฒเธเธฃเธนเธเธ–เนเธฒเธข" tone="#166534" />
          {auth.role === "driver" && (
            <Stat icon={Star} label="เธชเนเธเธชเธณเน€เธฃเนเธเธเธญเธเธเธฑเธ" value={`${orders.filter(o => o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ" && o.driverId === driverId).length} เธเธฒเธ`} sub="เธเธฒเธเธเธญเธเธเธธเธ“เธ—เธฑเนเธเธซเธกเธ”" tone="#22c55e" />
          )}
        </div>

        {displayTab === "sales" && (
          <>
            <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
              <button className="secondary" onClick={() => {
                const pwd = prompt("๐” เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธฃเธซเธฑเธชเน€เธเธทเนเธญเธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเน:");
                if (pwd === null) return; // User cancelled
                if (pwd !== "2532") {
                  alert("โ เธฃเธซเธฑเธชเนเธกเนเธ–เธนเธเธ•เนเธญเธ");
                  return;
                }
                if (!window.confirm("เธขเธทเธเธขเธฑเธเธญเธตเธเธเธฃเธฑเนเธ: เธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธซเธฃเธทเธญเนเธกเน? (เธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”เธเธฐเธ–เธนเธเธฅเธ)")) return;

                (async () => {
                  try {
                    // Disable polling during reset to prevent race condition
                    isResettingOrdersRef.current = true;
                    
                    if (!supabase) supabase = initSupabase();
                    if (!supabase) {
                      alert("โ เธขเธฑเธเน€เธเธทเนเธญเธกเธ•เนเธญ Supabase เนเธกเนเนเธ”เน");
                      isResettingOrdersRef.current = false;
                      return;
                    }

                    setSyncStatus("โณ เธเธณเธฅเธฑเธเธฅเธเธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ” (Supabase)...");
                    console.log("๐” [RESET] Starting complete order reset process...");
                      
                      // STEP 1: Clear React state
                      console.log("๐งน [RESET] Step 1: Clearing React state (orders = [])...");
                      const emptyState = JSON.parse(JSON.stringify(state)); // Deep copy
                      emptyState.orders = [];
                      emptyState.customers = [];
                      setState(emptyState);
                      console.log("โ… [RESET] React state cleared", { orders: emptyState.orders.length, customers: emptyState.customers.length });
                      
                      // Wait for state update
                      await new Promise(resolve => setTimeout(resolve, 200));
                      console.log("โ… [RESET] State update delay completed");
                      
                      // STEP 2: Delete from Supabase
                      console.log("๐—‘๏ธ [RESET] Step 2: Deleting from Supabase...");
                      
                      try {
                        // Fetch all order IDs
                        console.log("๐“ [RESET] Fetching all order IDs...");
                        const { data: allOrders, error: fetchError } = await supabase
                          .from("orders")
                          .select("id");
                        
                        console.log("๐“ [RESET] Fetch result:", { 
                          ordersCount: allOrders?.length || 0, 
                          hasError: !!fetchError,
                          errorMsg: fetchError?.message || "none"
                        });
                        
                        if (fetchError) {
                          console.error("โ [RESET] Fetch failed:", fetchError);
                          throw new Error(`Fetch failed: ${fetchError.message}`);
                        }
                        
                        // Delete orders
                        if (allOrders && allOrders.length > 0) {
                          const orderIds = allOrders.map(o => o.id);
                          console.log(`๐—‘๏ธ [RESET] Deleting ${orderIds.length} orders...`);
                          console.log("๐—‘๏ธ [RESET] Order IDs:", orderIds);
                          
                          const { error: deleteError, count, status } = await supabase
                            .from("orders")
                            .delete()
                            .in("id", orderIds);
                          
                          console.log("๐—‘๏ธ [RESET] Delete response:", { 
                            totalRequested: orderIds.length,
                            deletedCount: count, 
                            httpStatus: status,
                            hasError: !!deleteError,
                            errorMsg: deleteError?.message || "none"
                          });
                          
                          if (deleteError) {
                            console.error("โ [RESET] Delete query failed:", deleteError);
                            throw new Error(`Delete failed: ${deleteError.message}`);
                          }
                          
                          if (count !== orderIds.length) {
                            console.warn(`โ ๏ธ [RESET] WARNING: Only ${count} of ${orderIds.length} orders were deleted!`);
                          }
                          
                          // Verify deletion
                          console.log("โ… [RESET] Delete query completed, verifying...");
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          
                          const { data: afterDelete, error: verifyError } = await supabase
                            .from("orders")
                            .select("id");
                          
                          console.log("โ… [RESET] Verification:", { 
                            ordersRemaining: afterDelete?.length || 0,
                            verifyError: verifyError?.message || "none"
                          });
                          
                          if (afterDelete && afterDelete.length > 0) {
                            console.warn("โ ๏ธ [RESET] WARNING: Orders still exist after delete:", afterDelete.map(o => o.id));
                            console.warn("โ ๏ธ [RESET] Remaining order IDs should be:", afterDelete.map(o => o.id).join(", "));
                          }
                        } else {
                          console.log("โน๏ธ [RESET] No orders to delete");
                        }
                      } catch (e) {
                        console.error("โ [RESET] Delete step failed:", e);
                        throw e;
                      }
                      
                      // STEP 3: Wait to ensure everything is synced
                      console.log("โณ [RESET] Step 3: Waiting 5 seconds to ensure deletion is complete...");
                      await new Promise(resolve => setTimeout(resolve, 5000));
                      
                      // STEP 4: Final verification: fetching from Supabase
                      console.log("๐” [RESET] Step 4: Final verification: fetching from Supabase...");
                      const { data: finalCheck, error: finalCheckError } = await supabase
                        .from("orders")
                        .select("id");
                      
                      console.log("๐” [RESET] Final Supabase check:", {
                        ordersRemaining: finalCheck?.length || 0,
                        error: finalCheckError?.message || "none"
                      });
                      
                      if (finalCheck && finalCheck.length > 0) {
                        console.warn("โ ๏ธ [RESET] WARNING: Orders still in Supabase after delete:", finalCheck.map(o => o.id));
                        console.log("๐” [RESET] Attempting second delete round...");
                        
                        // Try delete again
                        const remainingIds = finalCheck.map(o => o.id);
                        const { error: deleteRetryError, count: retryCount } = await supabase
                          .from("orders")
                          .delete()
                          .in("id", remainingIds);
                        
                        console.log("๐—‘๏ธ [RESET] Second delete attempt:", { 
                          retryCount, 
                          retryError: deleteRetryError?.message || "none"
                        });
                        
                        // Verify again
                        const { data: finalCheck2 } = await supabase.from("orders").select("id");
                        console.log("๐” [RESET] After retry:", { ordersRemaining: finalCheck2?.length || 0 });
                      }
                      
                      // STEP 5: Re-enable sync
                      console.log("๐” [RESET] Step 5: Re-enabling polling and sync...");
                      setSyncStatus("โ… เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธชเธณเน€เธฃเนเธ!");
                      alert("โ… เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธชเธณเน€เธฃเนเธ!\n\nโ“ เธฅเธเธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธเธฒเธ Supabase\nโ“ เธฃเธตเน€เธเนเธ•เธชเธ–เธฒเธเธฐเธ—เธฑเนเธเธฃเธฐเธเธ");
                      isResettingOrdersRef.current = false;
                      
                      console.log("โ… [RESET] Process completed successfully!");
                    } catch (e) {
                      console.error("โ [RESET] Process failed:", e);
                      setSyncStatus(`โ เธฃเธตเน€เธเนเธ•เนเธกเนเธชเธณเน€เธฃเนเธ: ${e?.message || String(e)}`);
                      alert(`โ เธฃเธตเน€เธเนเธ•เนเธกเนเธชเธณเน€เธฃเนเธ:\n${e?.message || String(e)}\n\n(เธ•เธฃเธงเธเธชเธญเธ console เธชเธณเธซเธฃเธฑเธเธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”)`);
                      isResettingOrdersRef.current = false;
                    }
                  })();
              }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>๐” เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเน</button>
            </div>
            <div className="sales-grid">
            {syncStatus && syncStatus !== "Local mode" && (
              <section className="panel" style={{ gridColumn: "1 / -1", background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>โ“ {syncStatus}</p>
              </section>
            )}
            <section className="panel" style={{ gridColumn: "1 / -1", background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div className="panel-head"><h2>๐ข เธเธเธเธฑเธเธญเธญเธเนเธฅเธเนเธ•เธญเธเธเธตเน</h2><span>{Object.keys(state.onlineDrivers || {}).length} เธเธ</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted" style={{ gridColumn: "1 / -1" }}>เธขเธฑเธเนเธกเนเธกเธตเธเธเธเธฑเธเธญเธญเธเนเธฅเธเน</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const onlineTime = Math.floor((new Date().getTime() - (state.onlineDrivers?.[driver.id] || 0)) / 60000);
                    return (
                      <div key={driver.id} style={{ background: "white", padding: "12px", borderRadius: "6px", border: "1px solid #dcfce7", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#22c55e", marginBottom: "4px" }}>๐ข {driver.name}</div>
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
                    <div className="panel-head"><h2>๐—บ๏ธ Mini-map (OSM)</h2><span>{driverIds.length} เธเธเธกเธตเธเธดเธเธฑเธ”</span></div>
                    {driverIds.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>เธขเธฑเธเนเธกเนเธกเธตเธเธดเธเธฑเธ”เธเธเธเธฑเธ (เนเธซเนเธเธเธเธฑเธเธญเธเธธเธเธฒเธ• GPS เนเธฅเธฐเน€เธเธดเธ”เธซเธเนเธฒ Driver เนเธงเน)</p>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                          {driverIds.map(did => {
                            const d = locs[did];
                            const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
                            return (
                              <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
                                ๐“ {name}
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
                              เน€เธเธดเธ”เนเธเธเธ—เธตเนเน€เธ•เนเธก (OpenStreetMap)
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
                const inProgress = orders.filter(o => o.driverId && (o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ"));
                const byDriver = {};
                inProgress.forEach(o => {
                  byDriver[o.driverId] = byDriver[o.driverId] || [];
                  byDriver[o.driverId].push(o);
                });

                return (
                  <>
                    <div className="panel-head"><h2>๐ เธเธฒเธเธ—เธตเนเธเธเธเธฑเธเธเธณเธฅเธฑเธเธชเนเธ</h2><span>{inProgress.length} เธเธฒเธ</span></div>
                    {inProgress.length === 0 ? (
                      <p className="muted" style={{ textAlign: "center", padding: "8px 0" }}>เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธเธ—เธตเนเธเธณเธฅเธฑเธเธชเนเธ</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                        {Object.keys(byDriver).map(did => {
                          const driver = drivers.find(d => d.id === did);
                          const items = byDriver[did] || [];
                          return (
                            <div key={did} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                                <b>{driver?.name || items[0]?.driverName || "เนเธกเนเธ—เธฃเธฒเธเธเธทเนเธญเธเธเธเธฑเธ"}</b>
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
                                    <small style={{ color: "#374151" }}>{o.customerName} ยท {o.zone}</small>
                                  </div>
                                ))}
                                {items.length > 5 && <small style={{ color: "#6b7280" }}>+ เธญเธตเธ {items.length - 5} เธเธฒเธ</small>}
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
              <div className="panel-head"><h2>เธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒเน€เธเนเธฒ</h2><span>{customers.length} เธฃเนเธฒเธ</span></div>
              {customers.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "20px", color: "#999" }}>๐“ญ เธขเธฑเธเนเธกเนเธกเธตเธฅเธนเธเธเนเธฒ เธเธ”เน€เธเธดเนเธกเธฅเธนเธเธเนเธฒเนเธซเธกเนเธ”เนเธฒเธเธฅเนเธฒเธ</p>
              ) : (
                <>
                  <label className="search"><Search size={16} /><input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="เธเนเธเธซเธฒเธเธทเนเธญเธฅเธนเธเธเนเธฒ เน€เธเธญเธฃเนเนเธ—เธฃ เธเธทเนเธเธ—เธตเน" /></label>
                  <div className="customer-list">
                    {filteredCustomers.map(customer => (
                      <button key={customer.id} className={`customer-card ${selectedCustomerId === customer.id ? "selected" : ""}`} onClick={() => setSelectedCustomerId(customer.id)}>
                        <strong>{customer.name}</strong>
                        <span>{customer.contact} ยท {customer.phone}</span>
                        <span>{customer.zone} ยท {customer.address}</span>
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
                      <small style={{ color: "#666" }}>๐“ {selectedCustomer.phone}</small><br/>
                      <small style={{ color: "#666" }}>๐‘ค {selectedCustomer.contact}</small><br/>
                      <small style={{ color: "#666" }}>๐“ {selectedCustomer.zone}</small><br/>
                      <small style={{ color: "#666" }}>{selectedCustomer.address}</small>
                    </div>
                  </div>
                  <button className="secondary" style={{ width: "100%", padding: "8px", fontSize: "12px" }} onClick={() => {
                    setEditingCustomerId(selectedCustomer.id);
                    setEditCustomerForm(selectedCustomer);
                  }}>โ๏ธ เนเธเนเนเธเธเนเธญเธกเธนเธฅ</button>
                </div>
              )}
            </section>

            {editingCustomerId && (
              <section className="panel" style={{ background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <div className="panel-head"><h2>โ๏ธ เนเธเนเนเธเธเนเธญเธกเธนเธฅเธฅเธนเธเธเนเธฒ</h2><span>เธซเธกเธฒเธขเน€เธฅเธ: {editingCustomerId}</span></div>
                <div className="form-grid">
                  <input value={editCustomerForm.name} onChange={e => setEditCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="เธเธทเนเธญเธฃเนเธฒเธ/เธฅเธนเธเธเนเธฒ" />
                  <input value={editCustomerForm.contact} onChange={e => setEditCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="เธเธนเนเธ•เธดเธ”เธ•เนเธญ" />
                  <input value={editCustomerForm.phone} onChange={e => setEditCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธเธญเธฃเนเนเธ—เธฃ" />
                  <select value={editCustomerForm.zone} onChange={e => setEditCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
                </div>
                <input value={editCustomerForm.address} onChange={e => setEditCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="เธ—เธตเนเธญเธขเธนเน/เธขเนเธฒเธ" />
                <input value={editCustomerForm.mapUrl} onChange={e => setEditCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
                <textarea value={editCustomerForm.note} onChange={e => setEditCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฃเธฐเธเธณเธฅเธนเธเธเนเธฒ" rows={3} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <button className="secondary" onClick={() => setEditingCustomerId(null)}>เธขเธเน€เธฅเธดเธ</button>
                  <button className="primary" onClick={() => updateCustomer(editingCustomerId, editCustomerForm)}>๐’พ เธเธฑเธเธ—เธถเธ</button>
                </div>
              </section>
            )}

            <section className="panel">
              <div className="panel-head"><h2>เน€เธเธดเธ”เธญเธญเน€เธ”เธญเธฃเนเธชเนเธเธเธญเธ</h2><span>เธเธดเธกเธเนเธเธทเนเธญเธฅเธนเธเธเนเธฒเธซเธฃเธทเธญเน€เธฅเธทเธญเธเธเธฒเธเธฃเธฒเธขเธเธทเนเธญ</span></div>
              <label className="search"><Search size={16} /><input value={orderForm.customerName} onChange={e => setOrderForm(p => ({ ...p, customerName: e.target.value }))} placeholder="เธเธดเธกเธเนเธเธทเนเธญเธฅเธนเธเธเนเธฒ (autocomplete)" /></label>
              {orderForm.customerName && (
                <div className="customer-list">
                  {customers.filter(c => c.name.toLowerCase().includes(orderForm.customerName.toLowerCase())).slice(0, 5).map(c => (
                    <button key={c.id} className="customer-card" onClick={() => { setOrderForm(p => ({ ...p, customerName: c.name })); setSelectedCustomerId(c.id); }}>
                      <strong>{c.name}</strong>
                      <span>{c.phone} ยท {c.zone}</span>
                    </button>
                  ))}
                </div>
              )}
              {(() => {
                const foundCustomer = customers.find(c => c.name.toLowerCase() === orderForm.customerName.toLowerCase()) || selectedCustomer;
                return foundCustomer ? (
                  <div className="customer-detail">
                    <div><b>{foundCustomer.name}</b><p>{foundCustomer.contact} ยท {foundCustomer.phone}</p><p>{foundCustomer.address}</p></div>
                    <a href={foundCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เน€เธเธดเธ”เนเธเธเธ—เธตเน</a>
                  </div>
                ) : null;
              })()}
              <div className="form-grid">
                <input value={orderForm.window} onChange={e => setOrderForm(p => ({ ...p, window: e.target.value }))} placeholder="เธเนเธงเธเน€เธงเธฅเธฒเธชเนเธ" />
                <input value={orderForm.boxes} onChange={e => setOrderForm(p => ({ ...p, boxes: e.target.value }))} type="number" placeholder="เธเธณเธเธงเธเธเธฅเนเธญเธ" />
                <input value={orderForm.cod} onChange={e => setOrderForm(p => ({ ...p, cod: e.target.value }))} type="number" placeholder="COD" />
              </div>
              <textarea value={orderForm.salesNote} onChange={e => setOrderForm(p => ({ ...p, salesNote: e.target.value }))} placeholder="เธฃเธฒเธขเธฅเธฐเน€เธญเธตเธขเธ”เธชเธดเธเธเนเธฒ / เธซเธกเธฒเธขเน€เธซเธ•เธธเธเนเธฒเธขเธเธฒเธข" rows={3} />
              <button className="primary wide" onClick={createOrder}><PackagePlus size={18} /> เธชเนเธเธญเธญเน€เธ”เธญเธฃเนเน€เธเนเธฒเธเธดเธงเธเธเธเธฑเธ</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เน€เธเธดเนเธกเธฅเธนเธเธเนเธฒเนเธซเธกเน</h2><span>เธเธฑเธเธ—เธถเธเนเธงเนเนเธเนเธเธฃเธฑเนเธเธ–เธฑเธ”เนเธ</span></div>
              <div className="form-grid two">
                <input value={customerForm.name} onChange={e => setCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="เธเธทเนเธญเธฃเนเธฒเธ/เธฅเธนเธเธเนเธฒ" />
                <input value={customerForm.contact} onChange={e => setCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="เธเธนเนเธ•เธดเธ”เธ•เนเธญ" />
                <input value={customerForm.phone} onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เน€เธเธญเธฃเนเนเธ—เธฃ" />
                <select value={customerForm.zone} onChange={e => setCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select>
              </div>
              <input value={customerForm.address} onChange={e => setCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="เธ—เธตเนเธญเธขเธนเน/เธขเนเธฒเธ" />
              <input value={customerForm.mapUrl} onChange={e => setCustomerForm(p => ({ ...p, mapUrl: e.target.value }))} placeholder="Location URL" />
              <textarea value={customerForm.note} onChange={e => setCustomerForm(p => ({ ...p, note: e.target.value }))} placeholder="เธซเธกเธฒเธขเน€เธซเธ•เธธเธเธฃเธฐเธเธณเธฅเธนเธเธเนเธฒ" rows={3} />
              <button className="secondary wide" onClick={saveCustomer}>เธเธฑเธเธ—เธถเธเธฅเธนเธเธเนเธฒ</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ เธ•เธณเนเธซเธเนเธเธเธเธเธฑเธเธฅเนเธฒเธชเธธเธ”</h2><span>{Object.keys(state.driverLocations || {}).length} เธเธเน€เธเนเธเธญเธดเธเนเธฅเนเธง</span></div>
              {Object.keys(state.driverLocations || {}).length === 0 ? (
                <p className="muted">เธขเธฑเธเนเธกเนเธกเธตเธเธเธเธฑเธเน€เธเนเธเธญเธดเธ</p>
              ) : (
                Object.values(state.driverLocations || {})
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map(location => {
                    const currentOrder = orders.find(o => o.driverId === location.driverId && (o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ"));
                    const customer = currentOrder ? customers.find(c => c.name === currentOrder.customerName) : null;
                    return (
                      <div key={location.driverId} style={{ padding: "12px", borderBottom: "1px solid #eee", marginBottom: "8px", background: "#f0f9ff", borderRadius: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <div>
                            <b style={{ fontSize: "14px", color: "#1a5490" }}>๐— {location.driverName}</b>
                            <p style={{ margin: "4px 0", fontSize: "12px" }}>๐“ฑ {location.driverPhone} ยท {location.plate}</p>
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#059669", fontWeight: "bold" }}>๐ช {location.customerName}</p>
                            {customer && <p style={{ margin: "4px 0", fontSize: "11px", color: "#0891b2" }}>๐‘ค เธ•เธดเธ”เธ•เนเธญ: {customer.contact}</p>}
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>๐“ {location.address}</p>
                            {currentOrder && <p style={{ margin: "4px 0", fontSize: "11px", color: "#7c2d12", background: "#fed7aa", padding: "2px 6px", borderRadius: "3px", display: "inline-block" }}>๐“ฆ เธชเธ–เธฒเธเธฐ: {currentOrder.status}</p>}
                            <p style={{ margin: "4px 0", fontSize: "11px", color: "#999" }}>โฐ เน€เธเนเธเธญเธดเธ: {location.checkInTime}</p>
                          </div>
                          <span style={{ background: "#166534", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>๐ข Online</span>
                        </div>
                      </div>
                    );
                  })
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ เธญเธญเน€เธ”เธญเธฃเนเนเธซเธกเน</h2><span>เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ {orders.filter(o => o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").length}</span></div>
              {orders.filter(o => o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").length === 0 ? (
                <p className="muted">เนเธกเนเธกเธตเธญเธญเน€เธ”เธญเธฃเนเนเธซเธกเน</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {orders.filter(o => o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ").map(order => (
                    <div key={order.id} style={{ background: "#fef9e7", padding: "10px", borderRadius: "6px", borderLeft: "4px solid #f59e0b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: "13px" }}>{order.id} ยท {order.customerName}</b>
                        <small style={{ color: "#666" }}>{order.zone} ยท {order.boxes} เธเธฅเนเธญเธ ยท เธฟ{money(order.cod)}</small>
                      </div>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px", marginLeft: "8px" }} onClick={() => deleteOrder(order.id)}>๐—‘๏ธ เธฅเธ</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ฆ เธชเธฃเธธเธเธเธฒเธฃเธชเนเธเธเธญเธ</h2><span>เธเธณเธฅเธฑเธเธชเนเธ {orders.filter(o => o.status === "เธเธณเธฅเธฑเธเธชเนเธ").length} + เธชเธณเน€เธฃเนเธ {orders.filter(o => o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length}</span></div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1, background: "#fef3c7", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #f59e0b" }}>
                  <small style={{ color: "#92400e" }}>โณ เธเธณเธฅเธฑเธเธชเนเธ</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#f59e0b" }}>{orders.filter(o => o.status === "เธเธณเธฅเธฑเธเธชเนเธ").length}</b>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #22c55e" }}>
                  <small style={{ color: "#166534" }}>โ“ เธชเธณเน€เธฃเนเธ</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#22c55e" }}>{orders.filter(o => o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length}</b>
                </div>
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {orders.filter(o => o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length === 0 ? (
                  <p className="muted">เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธฃเธชเนเธ</p>
                ) : (
                  orders.filter(o => o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").sort((a, b) => (a.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? -1 : 1)).map(order => {
                    const driver = drivers.find(d => d.id === order.driverId);
                    return (
                      <div key={order.id} style={{ padding: "10px", borderBottom: "1px solid #eee", fontSize: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                          <b style={{ color: order.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? "#f59e0b" : "#22c55e" }}>{order.id}</b>
                          <span style={{ background: order.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? "#fef3c7" : "#f0fdf4", color: order.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? "#92400e" : "#166534", padding: "2px 6px", borderRadius: "3px", fontSize: "11px" }}>{order.status === "เธเธณเธฅเธฑเธเธชเนเธ" ? "โณ เธชเนเธเนเธ" : "โ“ เน€เธชเธฃเนเธ"}</span>
                        </div>
                        <p style={{ margin: "2px 0", color: "#333" }}>{order.customerName}</p>
                        <p style={{ margin: "2px 0", color: "#666" }}>{order.address}</p>
                        <p style={{ margin: "2px 0", color: "#999" }}>๐— {driver?.name || "เธขเธฑเธเนเธกเนเธกเธญเธเธซเธกเธฒเธข"}</p>
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
                  const pwd = prompt("๐” เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธฃเธซเธฑเธชเน€เธเธทเนเธญเธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเน:");
                  if (pwd === null) return; // User cancelled
                  if (pwd !== "2532") {
                    alert("โ เธฃเธซเธฑเธชเนเธกเนเธ–เธนเธเธ•เนเธญเธ");
                    return;
                  }
                  if (!window.confirm("เธขเธทเธเธขเธฑเธเธญเธตเธเธเธฃเธฑเนเธ: เธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธซเธฃเธทเธญเนเธกเน? (เธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”เธเธฐเธ–เธนเธเธฅเธ)")) return;

                  (async () => {
                    try {
                      if (!supabase) supabase = initSupabase();
                      if (!supabase) {
                        alert("โ เธขเธฑเธเน€เธเธทเนเธญเธกเธ•เนเธญ Supabase เนเธกเนเนเธ”เน");
                        return;
                      }

                      setSyncStatus("โณ เธเธณเธฅเธฑเธเธฅเธเธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เนเธ Supabase...");
                      const { error } = await supabase.from("orders").delete().neq("id", "__never__");
                      if (error) {
                        alert(`โ เธฅเธเธญเธญเน€เธ”เธญเธฃเนเนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message}`);
                        setSyncStatus(`โ เธฅเธเธญเธญเน€เธ”เธญเธฃเนเนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message}`);
                        return;
                      }

                      // Clear local state
                      setState(prev => ({ ...prev, orders: [] }));
                      
                      setSyncStatus("โ… เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธชเธณเน€เธฃเนเธ");
                      alert("โ… เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ”เธชเธณเน€เธฃเนเธ");
                      await refreshFromSupabase();
                    } catch (e) {
                      alert(`โ เธฃเธตเน€เธเนเธ•เนเธกเนเธชเธณเน€เธฃเนเธ: ${e?.message || String(e)}`);
                    }
                    })();
                }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>๐” เธฃเธตเน€เธเนเธ•เธญเธญเน€เธ”เธญเธฃเน</button>
              </div>
              <div className="panel-head"><h2>เธเธดเธงเธเธฒเธเธชเนเธเธเธญเธ</h2><span>{filteredOrders.length} เธเธฒเธ</span></div>
              <div className="filters dispatch-filters">
                <label className="search"><Search size={16} /><input value={orderQuery} onChange={e => setOrderQuery(e.target.value)} placeholder="เธเนเธเธซเธฒเน€เธฅเธเธเธฒเธ เธฅเธนเธเธเนเธฒ เธเธทเนเธเธ—เธตเน เธซเธกเธฒเธขเน€เธซเธ•เธธ" /></label>
                <select value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                  <option value="all">เธ—เธธเธเธชเธ–เธฒเธเธฐ</option>
                  {STATUS.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
                <select value={orderZoneFilter} onChange={e => setOrderZoneFilter(e.target.value)}>
                  <option value="all">เธ—เธธเธเธเธทเนเธเธ—เธตเน</option>
                  {ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </div>
              <div className="dispatch-table">
                <div className="dispatch-head">
                  <span>เธเธฒเธ</span>
                  <span>เธฅเธนเธเธเนเธฒ/เธเธทเนเธเธ—เธตเน</span>
                  <span>เธชเธ–เธฒเธเธฐ</span>
                  <span>COD</span>
                  <span></span>
                </div>
                {filteredOrders.map(order => {
                  const assignedDriver = drivers.find(driver => driver.id === order.driverId);
                  return (
                    <article key={order.id} className="dispatch-row">
                      <div><b>{order.id}</b><span>{order.window} ยท {order.boxes} เธเธฅเนเธญเธ</span></div>
                      <div><b>{order.customerName}</b><span>{order.zone} ยท {order.address}</span>{order.complaint && <span style={{ marginLeft: "8px", background: "#fca5a5", color: "#7f1d1d", padding: "2px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: "bold" }}>โ ๏ธ {order.complaint}</span>}</div>
                      <div className="status-stack">
                        <span className="status-chip" style={{ color: statusColor[order.status], background: `${statusColor[order.status]}14` }}>{order.status}</span>
                        <small>{assignedDriver ? assignedDriver.name : "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ"}</small>
                      </div>
                      <strong>{money(order.cod)} เธเธฒเธ—</strong>
                      <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>๐—‘๏ธ</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เนเธซเธฅเธ”เธเธฒเธเธเธเธเธฑเธ</h2><span>เธงเธฑเธเธเธตเน</span></div>
              {report.driverScore.map(driver => {
                const driverJobs = orders.filter(order => order.driverId === driver.id && order.status !== "เธชเนเธเธชเธณเน€เธฃเนเธ");
                return (
                  <div key={driver.id} className="driver-load-row">
                    <div>
                      <b>{driver.name}</b>
                      <span>{driver.plate} ยท {driver.zone}</span>
                    </div>
                    <strong>{driverJobs.length} เธเธฒเธ</strong>
                  </div>
                );
              })}
              <div className="google-box">
                <b>เธงเธดเธเธตเนเธเนเธเธฒเธเน€เธฃเนเธง</b>
                <p>เธเนเธฒเธขเธเธฒเธขเธชเธฃเนเธฒเธเธญเธญเน€เธ”เธญเธฃเนเธเธฒเธเธซเธเนเธฒ Sales เนเธฅเนเธงเธเธฒเธเธเธฐเน€เธเนเธฒเธเธดเธงเธเธตเนเธ—เธฑเธเธ—เธต</p>
                <p>เนเธญเธ”เธกเธดเธเน€เธฅเธทเธญเธเธเธเธเธฑเธเธเธฒเธเธเธญเธฅเธฑเธกเธเนเธเธเธเธฑเธ เธซเธฃเธทเธญเธเธฅเนเธญเธขเนเธซเนเธเธเธเธฑเธเธเธ”เธฃเธฑเธเน€เธญเธเธเธฒเธเธซเธเนเธฒ Driver</p>
              </div>
            </section>
          </div>
        )}

        {auth.role === "driver" && displayTab === "driver" && (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* เธชเนเธงเธเธเนเธญเธกเธนเธฅเธเธเธเธฑเธ */}
            <section className="panel" style={{ background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                <div>
                  {drivers.filter(driver => driver.id === driverId).map(driver => (
                    <div key={driver.id}>
                      <b style={{ fontSize: "16px", display: "block" }}>๐‘ค {driver.name}</b>
                      <small style={{ color: "#666" }}>๐— {driver.plate} ยท ๐“ {driver.zone}</small>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ fontSize: "20px", color: "#22c55e", display: "block" }}>{driverOrders.filter(o => o.status !== "เธชเนเธเธชเธณเน€เธฃเนเธ" && o.driverId === driverId).length}</b>
                  <small style={{ color: "#666" }}>เธเธฒเธเธ—เธตเนเธขเธฑเธเน€เธซเธฅเธทเธญ</small>
                </div>
              </div>
            </section>

            {/* เธชเนเธงเธเธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเน (Pending Orders Grid) */}
            {(() => {
              const pending = orders.filter(o => o.status === "เธฃเธญเธเธเธเธฑเธเธฃเธฑเธ");
              console.log("๐“ Driver page - Total orders:", orders.length, "Pending:", pending.length, "driverId:", driverId);
              return (
                <section className="panel">
                  <div className="panel-head"><h2>๐“ฆ เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเนเนเธซเธกเน</h2><span>{pending.length} เธเธฒเธ</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {pending.map(order => {
                      const salesName = order.salesName || "เนเธกเนเธกเธต";
                      const salesPhone = order.salesPhone || "-";
                      return (
                        <div key={order.id} style={{ background: "#fef9e7", padding: "12px", borderRadius: "8px", border: "2px solid #f59e0b", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <b style={{ fontSize: "14px", display: "block", marginBottom: "4px" }}>{order.id}</b>
                          <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                          <small style={{ color: "#666" }}>๐“ {order.zone}</small><br/>
                          <small style={{ color: "#666" }}>โฐ {order.window}</small><br/>
                          <small style={{ color: "#666" }}>๐“ฆ {order.boxes} เธเธฅเนเธญเธ ยท เธฟ{money(order.cod)}</small>
                        </div>
                        
                        <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #fcd34d" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>๐“ เธฅเธนเธเธเนเธฒ: {order.customerPhone}</small>
                          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                            <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>๐“ฑ เนเธ—เธฃ</a>
                            {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>๐—บ๏ธ เนเธเธเธ—เธตเน</a>}
                          </div>
                        </div>
                        
                        <div style={{ background: "#f3e8ff", padding: "8px", borderRadius: "6px", border: "1px solid #d8b4fe" }}>
                          <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>เธเนเธฒเธขเธเธฒเธข: {salesName}</small>
                          <small style={{ color: "#666", display: "block" }}>{salesPhone}</small>
                          <a href={`tel:${salesPhone}`} className="secondary" style={{ width: "100%", padding: "6px", fontSize: "11px", marginTop: "4px", display: "block", textAlign: "center", textDecoration: "none" }}>๐“ เนเธ—เธฃเธซเธฒเธเนเธฒเธขเธเธฒเธข</a>
                        </div>
                        
                        {order.address && <small style={{ color: "#999", borderTop: "1px solid #fcd34d", paddingTop: "8px" }}>๐“ฌ {order.address}</small>}
                        
                        <button 
                          className="primary" 
                          style={{ width: "100%", padding: "10px", fontWeight: "bold", fontSize: "13px" }} 
                          disabled={false}
                          onClick={() => {
                            // allow immediate next actions; no UI lock
                            updateOrder(order.id, { driverId, driverName: drivers.find(d => d.id === driverId)?.name, status: "เธเธณเธฅเธฑเธเธชเนเธ" });
                            setSyncStatus(`โ… เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเน "${order.id}" เน€เธฃเธตเธขเธเธฃเนเธญเธข`);
                          }}>โ“ เธฃเธฑเธเธญเธญเน€เธ”เธญเธฃเนเธเธตเน</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
            })()}

            {/* เธชเนเธงเธเธญเธญเน€เธ”เธญเธฃเนเธ—เธตเนเธฃเธฑเธเนเธฅเนเธง (In-Progress Orders) */}
	            {orders.filter(o => o.driverId === driverId && (o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ")).length > 0 && (
	              <section className="panel">
                <div className="panel-head"><h2>๐— เธญเธญเน€เธ”เธญเธฃเนเธ—เธตเนเธฃเธฑเธเนเธฅเนเธง</h2><span>{orders.filter(o => o.driverId === driverId && o.status !== "เธชเนเธเธชเธณเน€เธฃเนเธ").length} เธเธฒเธ ยท เธชเธณเน€เธฃเนเธ {orders.filter(o => o.driverId === driverId && o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                  {orders.filter(o => o.driverId === driverId && (o.status === "เธเธณเธฅเธฑเธเธชเนเธ" || o.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ")).map(order => (
                    <div key={order.id} style={{ background: order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ" ? "#f0fdf4" : "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${statusColor[order.status]}`, display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div>
                        <b style={{ fontSize: "14px", display: "block", marginBottom: "4px", color: statusColor[order.status] }}>{order.id}</b>
                        <b style={{ fontSize: "15px", color: "#1f2937", display: "block" }}>{order.customerName}</b>
                        <small style={{ color: "#666" }}>๐“ {order.zone}</small><br/>
                        <small style={{ color: "#666" }}>โฐ {order.window}</small><br/>
                        <small style={{ color: "#666" }}>๐“ฆ {order.boxes} เธเธฅเนเธญเธ ยท เธฟ{money(order.cod)}</small>
                      </div>
                      
                      <div style={{ background: "white", padding: "8px", borderRadius: "6px", border: "1px solid #ddd" }}>
                        <small style={{ color: "#666", display: "block", fontWeight: "bold" }}>๐“ {order.customerPhone}</small>
                        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                          <a href={`tel:${order.customerPhone}`} className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center", textDecoration: "none" }}>๐“ฑ เนเธ—เธฃ</a>
                          {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noreferrer" className="secondary" style={{ flex: 1, padding: "6px", fontSize: "11px", textAlign: "center" }}>๐—บ๏ธ เนเธเธเธ—เธตเน</a>}
                        </div>
                      </div>
                      
                      {order.address && <small style={{ color: "#999", borderTop: `1px solid ${statusColor[order.status]}`, paddingTop: "8px" }}>๐“ฌ {order.address}</small>}
                      
                      {/* Status Actions */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {order.status === "เธเธณเธฅเธฑเธเธชเนเธ" && (
                          <>
                            <button 
                              className="primary" 
                              style={{ padding: "8px", fontSize: "12px", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                              disabled={false}
                              onClick={() => {
                                // no UI lock; allow immediate next action
                                updateOrder(order.id, { status: "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ" });
                                setSyncStatus(`โ… เธ–เธถเธเธเธธเธ”เธซเธกเธฒเธขเนเธฅเนเธง เธญเธญเน€เธ”เธญเธฃเน "${order.id}"`);
                              }}>๐— เนเธเธ–เธถเธเนเธฅเนเธง</button>
                            <button 
                              className="secondary" 
                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                              disabled={false}
                              onClick={() => {
                                const reason = prompt("๐“ เน€เธซเธ•เธธเธเธฅเนเธเธเธฒเธฃเธขเธเน€เธฅเธดเธ:");
                                if (reason) {
                                  // no UI lock; allow immediate next action
                                  updateOrder(order.id, { status: "เธขเธเน€เธฅเธดเธ", complaint: reason });
                                  setSyncStatus(`โ เธขเธเน€เธฅเธดเธเธญเธญเน€เธ”เธญเธฃเน "${order.id}"`);
                                }
                              }}>โ เธขเธเน€เธฅเธดเธ</button>
                          </>
                        )}
                        {order.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ" && (
                          <>
                            <label 
                              className="primary" 
                              onClick={() => { const el = document.getElementById(`pod-file-${order.id}`); try { el?.click(); } catch {} }}
                              style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", background: "#176b3a", color: "white" }}>
                              ๐“ท เธ–เนเธฒเธขเธฃเธนเธ
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
                                const reason = prompt("๐“ เน€เธซเธ•เธธเธเธฅเนเธเธเธฒเธฃเธขเธเน€เธฅเธดเธ:");
                                if (reason) {
                                  // no UI lock; allow immediate next action
                                  updateOrder(order.id, { status: "เธขเธเน€เธฅเธดเธ", complaint: reason });
                                }
                              }}>โ เธขเธเน€เธฅเธดเธ</button>
                          </>
                        )}
                        {order.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ" && order.photo && !order.sharedToLine && (
                          <button
                            className="primary"
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#2563eb" }}
                            onClick={() => shareOrderToLine(order)}
                          >💬 แชร์รูป+รายละเอียด (LINE)</button>
                        )}
                        {order.status === "เธเธณเธฅเธฑเธเธเธฑเธ”เธชเนเธ" && order.photo && order.sharedToLine && (
                          <button 
                            className="primary" 
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                            disabled={false}
                            onClick={() => {
                              // Add to pending updates to prevent rapid clicks
                              // no UI lock; allow immediate next action
                              updateOrder(order.id, { status: "เธชเนเธเธชเธณเน€เธฃเนเธ", deliveredAt: new Date().toLocaleString("th-TH") });
                              setSyncStatus(`โ… เธชเนเธเธญเธญเน€เธ”เธญเธฃเน "${order.id}" เธชเธณเน€เธฃเนเธเนเธฅเนเธง`);
                            }}>โ… เธชเนเธเธชเธณเน€เธฃเนเธ</button>
                        )}
                        {order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ" && (
                          <button 
                            className="secondary" 
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                            disabled={false}
                            onClick={() => {
                              // no UI lock; allow immediate next action
                              alert(`โ… เธชเนเธเธชเธณเน€เธฃเนเธเนเธฅเนเธง\n\n๐“ฆ เธญเธญเน€เธ”เธญเธฃเน: ${order.customerName}\n๐“ ${order.zone}\n๐’ฐ COD: เธฟ${money(order.cod || 0)}\n๐“ธ POD: โ… เธกเธต\n\nเธชเธฒเธกเธฒเธฃเธ–เธฃเธฑเธเธญเธตเธเธเธฒเธเนเธ”เน`);
                            }}>๐  เธชเนเธเน€เธชเธฃเนเธเธชเธดเนเธ</button>
                        )}
                      </div>

                      {/* Photo Preview */}
                      {order.photo && (
                        <div style={{ marginTop: "8px", borderRadius: "6px", overflow: "hidden", border: "2px solid #22c55e" }}>
                          <img src={order.photo} alt="proof" style={{ width: "100%", height: "auto" }} />
                        </div>
                      )}
                      
                      {order.status === "เธชเนเธเธชเธณเน€เธฃเนเธ" && (
                        <div style={{ background: "#f0fdf4", padding: "6px", borderRadius: "4px", fontSize: "11px", color: "#166534", fontWeight: "bold", textAlign: "center" }}>
                          โ… {order.deliveredAt}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
	              </section>
	            )}

	            {orders.filter(o => o.driverId === driverId && o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length > 0 && (
	              <section className="panel" style={{ background: "#f8fafc" }}>
	                <div className="panel-head">
	                  <h2>๐“ เธเธฃเธฐเธงเธฑเธ•เธดเธชเนเธเธชเธณเน€เธฃเนเธ</h2>
	                  <span>{orders.filter(o => o.driverId === driverId && o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ").length} เธเธฒเธ</span>
	                </div>
	                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                  {orders
	                    .filter(o => o.driverId === driverId && o.status === "เธชเนเธเธชเธณเน€เธฃเนเธ")
	                    .slice()
	                    .sort((a, b) => (b.deliveredAt || "").localeCompare(a.deliveredAt || ""))
	                    .map(order => (
	                      <div key={order.id} style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "8px" }}>
	                        <div>
	                          <b style={{ fontSize: "14px", display: "block" }}>{order.id}</b>
	                          <b style={{ fontSize: "15px", display: "block", color: "#111827" }}>{order.customerName}</b>
	                          <small style={{ color: "#6b7280" }}>๐“ {order.zone} ยท ๐’ฐ เธฟ{money(order.cod || 0)}</small><br/>
	                          {order.deliveredAt && <small style={{ color: "#16a34a", fontWeight: "bold" }}>โ… {order.deliveredAt}</small>}
	                        </div>
	                        <div style={{ display: "flex", gap: "8px" }}>
	                          <button className="primary" style={{ flex: 1, padding: "8px", fontSize: "12px" }} onClick={() => shareOrderToLine(order)}>๐’ฌ เนเธเธฃเน LINE</button>
	                          {order.photo && <a className="secondary" style={{ flex: 1, padding: "8px", fontSize: "12px", textAlign: "center", textDecoration: "none" }} href={order.photo} target="_blank" rel="noreferrer">๐“ธ เน€เธเธดเธ”เธฃเธนเธ</a>}
	                        </div>
	                      </div>
	                    ))}
	                </div>
	              </section>
	            )}

	            {driverOrders.length === 0 && (
	              <section className="panel" style={{ background: "#f3f4f6", textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontSize: "32px", margin: "0" }}>๐ด</p>
                <p style={{ color: "#666", margin: "8px 0 0" }}>เธขเธฑเธเนเธกเนเธกเธตเธญเธญเน€เธ”เธญเธฃเน เธฅเธญเธเธฃเธตเน€เธเธฃเธ</p>
              </section>
            )}
          </div>
        )}

        {displayTab === "reports" && (
          <div className="report-grid">
            <section className="panel">
              <div className="panel-head"><h2>เธฃเธฒเธขเธเธฒเธเธเธฃเธฐเธเธณเธงเธฑเธ</h2><span>เธเนเธญเธกเธนเธฅ Supabase</span></div>
              <div className="report-lines">
                <p>เธญเธญเน€เธ”เธญเธฃเนเธ—เธฑเนเธเธซเธกเธ” <b>{orders.length}</b> เธเธฒเธ</p>
                <p>เธชเนเธเธชเธณเน€เธฃเนเธ <b>{report.delivered}</b> เธเธฒเธ</p>
                <p>COD เธฃเธงเธก <b>{money(report.cod)}</b> เธเธฒเธ—</p>
                <p>เธฃเนเธญเธเน€เธฃเธตเธขเธ/เธเธฑเธเธซเธฒ <b>{report.complaints.length}</b> เธฃเธฒเธขเธเธฒเธฃ</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เธเธฐเนเธเธเธเธเธเธฑเธ</h2><span>เธเธฒเธเธเธฒเธเธชเธณเน€เธฃเนเธ เธฃเธนเธเธขเธทเธเธขเธฑเธ เนเธฅเธฐเธเธฑเธเธซเธฒ</span></div>
              {report.driverScore.map(driver => (
                <div key={driver.id} className="score-row">
                  <div><b>{driver.name}</b><span>{driver.jobs} เธเธฒเธ ยท เธชเธณเน€เธฃเนเธ {driver.done} ยท เธเธฑเธเธซเธฒ {driver.issues}</span></div>
                  <strong><Star size={16} /> {driver.score}</strong>
                </div>
              ))}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>เธเธฒเธฃเธฃเนเธญเธเน€เธฃเธตเธขเธ</h2><span>{report.complaints.length} เธฃเธฒเธขเธเธฒเธฃ</span></div>
              {report.complaints.length === 0 ? <div className="empty"><MessageSquareWarning size={22} /> เธขเธฑเธเนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธฃเนเธญเธเน€เธฃเธตเธขเธ</div> : report.complaints.map(order => (
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
                <div className="panel-head"><h2>โ๏ธ Admin Control</h2><span>เน€เธเธเธฒเธฐเนเธญเธ”เธกเธดเธ</span></div>
                <p style={{ color: "#666", fontSize: "12px", marginBottom: "12px" }}>เธ—เนเธฒเธเน€เธเนเธฒเธชเธดเธ—เธเธดเนเนเธญเธ”เธกเธดเธเน€เธ•เนเธก</p>
                <button className="secondary" style={{ background: "#dc2626", color: "white", width: "100%", padding: "10px" }} onClick={() => {
                  const pwd = prompt("๐” เธเธฃเธธเธ“เธฒเธเธฃเธญเธเธฃเธซเธฑเธชเน€เธเธทเนเธญเธฃเธตเน€เธเนเธ•เนเธ”เธเธเธญเธฃเนเธ”:");
                  if (pwd === null) return; // User cancelled
                  if (pwd !== "2532") {
                    alert("โ เธฃเธซเธฑเธชเนเธกเนเธ–เธนเธเธ•เนเธญเธ");
                    return;
                  }
                  if (!window.confirm("เธขเธทเธเธขเธฑเธเธญเธตเธเธเธฃเธฑเนเธ: เธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•เนเธ”เธเธเธญเธฃเนเธ”เธ—เธฑเนเธเธซเธกเธ”เธซเธฃเธทเธญเนเธกเน? (เธเนเธญเธกเธนเธฅเธ—เธฑเนเธเธซเธกเธ”เธเธฐเธ–เธนเธเธฅเธ)")) return;
                  
                  (async () => {
                    try {
                      if (!supabase) supabase = initSupabase();
                      if (!supabase) {
                        alert("โ เธขเธฑเธเน€เธเธทเนเธญเธกเธ•เนเธญ Supabase เนเธกเนเนเธ”เน");
                        return;
                      }
                      const { error } = await supabase.from("orders").delete().neq("id", "__never__");
                      if (error) {
                        alert(`โ เธฅเธเนเธกเนเธชเธณเน€เธฃเนเธ: ${error.message}`);
                        return;
                      }
                      setState(prev => ({ ...prev, orders: [] }));
                      alert("โ… เธฃเธตเน€เธเนเธ•เนเธ”เธเธเธญเธฃเนเธ”เธชเธณเน€เธฃเนเธ!");
                    } catch (e) {
                      alert(`โ เธฃเธตเน€เธเนเธ•เนเธกเนเธชเธณเน€เธฃเนเธ: ${e?.message || String(e)}`);
                    }
                  })();
                }}>๐” เธฃเธตเน€เธเนเธ•เนเธ”เธเธเธญเธฃเนเธ”</button>
              </section>
            )}
            
            <section className="panel">
              <div className="panel-head"><h2>๐ข Online Status</h2><span>{Object.keys(state.onlineDrivers || {}).length} online</span></div>
              <div className="report-lines">
                {Object.keys(state.onlineDrivers || {}).length === 0 ? (
                  <p className="muted">เนเธกเนเธกเธตเธเธเธเธฑเธเธญเธญเธเนเธฅเธเน</p>
                ) : (
                  drivers.filter(d => state.onlineDrivers?.[d.id]).map(driver => {
                    const lastSeen = state.onlineDrivers?.[driver.id];
                    const timeDiff = Math.floor((new Date().getTime() - lastSeen) / 60000);
                    return (
                      <p key={driver.id}><b>๐ข {driver.name}</b><br/><small>{driver.plate} ({driver.zone}) - {timeDiff}m ago</small></p>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ Driver Locations</h2><span>Live Map - Chiang Mai</span></div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button className="secondary" onClick={() => setMapZoom(Math.max(10, mapZoom - 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>โ– Zoom Out</button>
                <button className="secondary" onClick={() => setMapZoom(Math.min(18, mapZoom + 1))} style={{ padding: "6px 12px", fontSize: "14px" }}>โ• Zoom In</button>
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
                <text x="70" y="75" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#b45309">เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน</text>
                
                <rect x="200" y="50" width="100" height="80" fill="#dcfce7" stroke="#16a34a" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="250" y="100" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#166534">เนเธกเนเธฃเธดเธก</text>
                
                <rect x="50" y="200" width="110" height="90" fill="#cffafe" stroke="#0891b2" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="105" y="250" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#164e63">เธฅเธณเธเธนเธ</text>
                
                <rect x="250" y="250" width="130" height="100" fill="#f3e8ff" stroke="#a855f7" strokeWidth="2" rx="6" opacity="0.9" />
                <text x="315" y="310" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#6b21a8">เธซเธฒเธเธ”เธ/เธชเธฑเธเธเนเธฒ</text>
                
                {drivers.map((driver, idx) => {
                  const location = state.driverLocations?.[driver.id];
                  const isOnline = state.onlineDrivers?.[driver.id];
                  let x, y;
                  if (location && location.zone) {
                    const zoneMap = {
                      "เน€เธกเธทเธญเธเน€เธเธตเธขเธเนเธซเธกเน": { x: 70, y: 70 },
                      "เนเธกเนเธฃเธดเธก": { x: 250, y: 90 },
                      "เธฅเธณเธเธนเธ": { x: 105, y: 245 },
                      "เธซเธฒเธเธ”เธ": { x: 315, y: 300 },
                      "เธชเธฑเธเธเนเธฒเธ•เธญเธ": { x: 315, y: 280 }
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
                <b>๐‘ฅ เธชเธ–เธฒเธเธฐเธเธเธเธฑเธเธญเธญเธเนเธฅเธเน ({Object.keys(state.onlineDrivers || {}).length})</b>
                {drivers.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "#999" }}>เธขเธฑเธเนเธกเนเธกเธตเธเธเธเธฑเธ</p>
                ) : (
                  drivers.map(d => (
                    <p key={d.id} style={{ fontSize: "12px", margin: "6px 0", padding: "6px", background: state.onlineDrivers?.[d.id] ? "#e8f5e9" : "#f5f5f5", borderRadius: "4px" }}>
                      <b>{state.onlineDrivers?.[d.id] ? "๐ข" : "โซ"} {d.name}</b>
                      <br />
                      <small>๐“ฑ {d.phone} ยท {d.plate} ยท {d.zone}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ Login History</h2><span>{(state.loginHistory || []).length} entries</span></div>
              <div className="report-lines" style={{ maxHeight: "400px", overflowY: "auto" }}>
                {(state.loginHistory || []).length === 0 ? (
                  <p className="muted">เธขเธฑเธเนเธกเนเธกเธตเธเธฒเธฃเธฅเนเธญเธเธญเธดเธ</p>
                ) : (
                  state.loginHistory.slice(0, 20).map(entry => (
                    <p key={entry.id} style={{ fontSize: "13px", paddingBottom: "8px", borderBottom: "1px solid #eee" }}>
                      <b>{entry.name}</b> ({entry.role === "driver" ? "๐— Driver" : "๐“ฆ Sales"}) <br/>
                      <small>๐“ฑ {entry.phone}</small> <br/>
                      <small>โฐ {entry.loginAt}</small>
                    </p>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐“ เธฃเธฒเธขเธเธฒเธเธเธฃเธฐเธเธณเธงเธฑเธ</h2><span>เธชเธฃเธธเธเธเนเธญเธกเธนเธฅเธเธฒเธฃเธชเนเธเธเธญเธเธ—เธฑเนเธเธงเธฑเธ</span></div>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                copyToClipboard(report);
              }}><FileText size={16} /> เธชเธฃเนเธฒเธเธฃเธฒเธขเธเธฒเธเนเธฅเธฐเธเธฑเธ”เธฅเธญเธ</button>
              <button className="secondary wide" onClick={() => {
                const report = generateDailyReport();
                const element = document.createElement("a");
                element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(report));
                element.setAttribute("download", `Hillkoff-Report-${new Date().toLocaleDateString("th-TH")}.txt`);
                element.style.display = "none";
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              }}><Download size={16} /> เธ”เธฒเธงเธเนเนเธซเธฅเธ”เน€เธเนเธเนเธเธฅเน</button>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>๐”ง System Control</h2><span>เน€เธเธเธฒเธฐเธเธธเธเน€เธเธดเธ</span></div>
              <button className="primary wide" onClick={() => window.location.reload()} style={{ background: "#2563eb", color: "white", padding: "12px", fontSize: "14px", fontWeight: "bold" }}>
                ๐” เธฃเธตเนเธซเธฅเธ”เธฃเธฐเธเธ
              </button>
              <p style={{ fontSize: "12px", color: "#666", marginTop: "10px", textAlign: "center" }}>
                เธเธฃเธ“เธตเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธฑเธเธเธฒเธ เธซเธฃเธทเธญเน€เธเธทเนเธญเธกเธ•เนเธญเน€เธเธดเธฃเนเธเน€เธงเธญเธฃเนเนเธกเนเนเธ”เน เธเธ” เธเธธเนเธกเธเธตเนเน€เธเธทเนเธญเธฃเธตเนเธซเธฅเธ”เธฃเธฐเธเธ
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
      title="เนเธเธ—"
    >
      ๐’ฌ
    </button>

    {chatOpen && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1300, display: "grid", placeItems: "end center", padding: "16px" }}>
        <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <b>๐’ฌ เนเธเธ—เธ—เธตเธก</b>
            <button className="secondary" onClick={() => setChatOpen(false)} style={{ padding: "6px 10px", fontSize: "12px" }}>เธเธดเธ”</button>
          </div>
          <div style={{ padding: "12px 14px", maxHeight: "280px", overflowY: "auto", background: "#f9fafb", display: "grid", gap: "8px" }}>
            {chatMessages.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธเธงเธฒเธก</p>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <b style={{ fontSize: "12px" }}>{m.sender_name || "เนเธกเนเธฃเธฐเธเธธ"} {m.sender_role ? `(${m.sender_role})` : ""}</b>
                    <small style={{ color: "#6b7280" }}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString("th-TH") : ""}</small>
                  </div>
                  <div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.message}</div>
                  {m.sender_phone && <a href={`tel:${m.sender_phone}`} style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}>๐“ {m.sender_phone}</a>}
                </div>
              ))
            )}
          </div>
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
            <input value={chatText} onChange={e => setChatText(e.target.value)} placeholder="เธเธดเธกเธเนเธเนเธญเธเธงเธฒเธก..." style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: "10px" }} />
            <button className="primary" onClick={sendChat} style={{ padding: "10px 14px" }}>เธชเนเธ</button>
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
          <h2 style={{ marginTop: 0, color: "#1f2937" }}>๐“ฆ เธขเธทเธเธขเธฑเธเธชเนเธเธญเธญเน€เธ”เธญเธฃเน</h2>
          <div style={{ background: "#f3f4f6", padding: "12px", borderRadius: "6px", margin: "12px 0" }}>
            <p><b>เธฅเธนเธเธเนเธฒ:</b> {pendingOrder.customerName}</p>
            <p><b>เธเธทเนเธเธ—เธตเน:</b> {pendingOrder.zone}</p>
            <p><b>เธซเธเนเธฒเธ•เนเธฒเธเน€เธงเธฅเธฒ:</b> {pendingOrder.window}</p>
            <p><b>เธเธณเธเธงเธเธเธฅเนเธญเธ:</b> {pendingOrder.boxes} เธเธฅเนเธญเธ</p>
            <p><b>COD:</b> เธฟ{money(pendingOrder.cod)}</p>
            {pendingOrder.salesNote && <p><b>เธซเธกเธฒเธขเน€เธซเธ•เธธ:</b> {pendingOrder.salesNote}</p>}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button className="secondary" style={{ flex: 1 }} onClick={() => setShowOrderConfirm(false)}>โ เธขเธเน€เธฅเธดเธ</button>
            <button className="primary" style={{ flex: 1 }} onClick={confirmOrder}>โ… เธขเธทเธเธขเธฑเธเธชเนเธ</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}



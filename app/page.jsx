"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { getFirebaseAuth, getFirestoreDb, fb, startPhoneSignInE164, fbLogout, onFirebaseAuthStateChanged } from "../lib/firebaseClient";
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

// Supabase removed: Firebase (Auth+Firestore) is used instead
let supabase = null;
function initSupabase() { return null; }

const initialDrivers = [];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUS = ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ", "ติดปัญหา", "ยกเลิก"];
const statusColor = { "รอคนขับรับ": "#92400e", "กำลังส่ง": "#1d4ed8", "กำลังจัดส่ง": "#f59e0b", "ส่งสำเร็จ": "#166534", "ติดปัญหา": "#b91c1c", "ยกเลิก": "#dc2626" };

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

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

function buildLineMessageForOrder(order) {
  const lines = [];
  lines.push("✅ ส่งของสำเร็จ");
  lines.push(`ออเดอร์: ${order.id}`);
  if (order.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
  if (order.customerPhone) lines.push(`โทร: ${order.customerPhone}`);
  if (order.address) lines.push(`ที่อยู่: ${order.address}`);
  if (order.zone) lines.push(`โซน: ${order.zone}`);
  if (order.window) lines.push(`ช่วงเวลา: ${order.window}`);
  if (order.boxes != null) lines.push(`จำนวน: ${order.boxes} กล่อง`);
  if (order.salesName) lines.push(`ฝ่ายขาย: ${order.salesName}`);
  if (order.salesPhone) lines.push(`ฝ่ายขายโทร: ${order.salesPhone}`);
  if (order.salesNote) lines.push(`หมายเหตุ: ${order.salesNote}`);
  lines.push(`COD: ฿${money(order.cod || 0)}`);
  if (order.deliveredAt) lines.push(`เวลา: ${order.deliveredAt}`);
  if (order.mapUrl) lines.push(`แผนที่: ${order.mapUrl}`);
  if (order.photo) lines.push("POD: (แนบรูปในแชท)");
  return lines.join("\n");
}

async function dataUrlToFile(dataUrl, fileName) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type || "image/jpeg").split("/").pop() || "jpg";
  return new File([blob], `${fileName}.${ext}`, { type: blob.type || "image/jpeg" });
}

function downloadFileToDevice(file, fileName) {
  try {
    const blobUrl = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName || file.name || "pod.jpg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(blobUrl); } catch {}
    }, 2000);
    return true;
  } catch {
    return false;
  }
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
  const [otpState, setOtpState] = useState({ stage: "idle", code: "", confirmation: null }); // idle | code
  const [rememberPhone, setRememberPhone] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [fbAuthReady, setFbAuthReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("hillkoff-last-phone");
    if (saved) {
      setLoginForm(p => ({ ...p, phone: saved }));
      setRememberPhone(true);
    }
    const savedSalesName = localStorage.getItem("hillkoff-last-sales-name");
    if (savedSalesName) setLoginForm(p => ({ ...p, name: savedSalesName }));
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
  const [selectedMapDriverId, setSelectedMapDriverId] = useState("");
  const [showDeliveredHistory, setShowDeliveredHistory] = useState(false);
  const podFilesRef = useRef({}); // { [orderId]: File } kept on-device only (not synced)
  const lastOrdersPullRef = useRef(null);
  const lastCustomersPullRef = useRef(null);
  const lastDriverLocationsPullRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  
  // Use useRef instead of useState for isResettingOrders to ensure synchronous updates
  // useState is async and causes stale closures in sync logic
  const isResettingOrdersRef = useRef(false);
  const pendingOrderUpdatesRef = useRef(new Set()); // Track orders being updated to debounce button clicks
  const previousOrderCountRef = useRef(0); // Track previous order count for new order notification
  const audioRef = useRef(null); // Reference to audio element for notification sound

	  useEffect(() => setState(readState()), []);

	  // Wait for Firebase Auth session to be ready (so Firestore rules see request.auth)
	  useEffect(() => {
	    const unsub = onFirebaseAuthStateChanged(() => setFbAuthReady(true));
	    return () => { try { unsub?.(); } catch {} };
	  }, []);

	  // Firestore realtime sync (orders/customers/driver_locations/chat)
	  useEffect(() => {
	    if (typeof window === "undefined") return;
	    if (!fbAuthReady) return;
	    if (!state.auth?.token) {
	      setSyncStatus("Please login");
	      return;
	    }
	    const db = getFirestoreDb();
	    const unsubs = [];

	    // Orders
	    try {
	      let ordersQ = fb.query(fb.collection(db, "orders"), fb.orderBy("updatedAt", "desc"), fb.limit(500));
	      if (state.auth?.role === "driver") {
	        const did = state.auth?.driverId || driverId || "";
	        if (did) {
	          ordersQ = fb.query(
	            fb.collection(db, "orders"),
	            fb.where("driverId", "in", ["", did]),
	            fb.orderBy("updatedAt", "desc"),
	            fb.limit(500)
	          );
	        } else {
	          ordersQ = fb.query(
	            fb.collection(db, "orders"),
	            fb.where("driverId", "==", ""),
	            fb.orderBy("updatedAt", "desc"),
	            fb.limit(500)
	          );
	        }
	      }
	      unsubs.push(
	        fb.onSnapshot(
	          ordersQ,
	          (snap) => {
	            const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	            setState((prev) => ({ ...prev, orders: rows }));
	          },
	          (err) => setSyncStatus?.(`⚠️ Firestore orders error: ${err.message || err}`)
	        )
	      );
	    } catch (e) {
	      console.warn("orders onSnapshot error", e);
	    }

	    // Customers
	    try {
	      const custQ = fb.query(fb.collection(db, "customers"), fb.orderBy("updatedAt", "desc"), fb.limit(500));
	      unsubs.push(
	        fb.onSnapshot(custQ, (snap) => {
	          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	          setState((prev) => ({ ...prev, customers: rows }));
	        })
	      );
	    } catch {}

	    // Driver locations
	    try {
	      const locQ = fb.query(fb.collection(db, "driver_locations"), fb.orderBy("updatedAt", "desc"), fb.limit(200));
	      unsubs.push(
	        fb.onSnapshot(locQ, (snap) => {
	          const next = {};
	          snap.docs.forEach((d) => {
	            const v = d.data() || {};
	            const did = v.driverId || d.id;
	            next[did] = { driverId: did, ...(v || {}) };
	          });
	          setState((prev) => ({ ...prev, driverLocations: next }));
	        })
	      );
	    } catch {}

	    // Chat messages (last 50)
	    try {
	      const chatQ = fb.query(fb.collection(db, "chat_messages"), fb.orderBy("createdAt", "desc"), fb.limit(50));
	      unsubs.push(
	        fb.onSnapshot(chatQ, (snap) => {
	          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	          setChatMessages(rows.reverse());
	        })
	      );
	    } catch {}

	    return () => {
	      unsubs.forEach((u) => {
	        try { u(); } catch {}
	      });
	    };
	    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [state.auth?.token, state.auth?.role, state.auth?.driverId, driverId]);

  // (Supabase removed) no forced polling needed

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
      
      console.log("🔊 Notification sound played");
    } catch (e) {
      console.error("❌ Error playing notification sound:", e);
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
    // Firestore chat is realtime via onSnapshot; no polling needed
  }, [chatOpen]);

  const sendChat = async () => {
    const text = (chatText || "").trim();
    if (!text) return;
    setChatText("");
    try {
      const db = getFirestoreDb();
      await fb.addDoc(fb.collection(db, "chat_messages"), {
        sender_role: state.auth?.role || "",
        sender_name: state.auth?.name || "",
        sender_phone: state.auth?.phone || "",
        message: text,
        createdAt: fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      });
    } catch (e) {
      alert(`❌ ส่งข้อความไม่สำเร็จ: ${e?.message || e}`);
    }
  };

		  // Legacy Supabase refresh (disabled). Firestore onSnapshot is used instead.
		  const refreshFromSupabase = async () => {};

  // Supabase realtime subscription removed (Firestore handles realtime).
  
	  const upsertOrderToFirestore = async (order) => {
	    try {
	      const db = getFirestoreDb();
	      const orderForDB = {
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
	        status: order.status || "รอคนขับรับ",
	        // POD is stored on-device only; never persist to Firestore
	        photo: "",
	        checkInAt: order.checkInAt || "",
	        deliveredAt: order.deliveredAt || "",
	        complaint: order.complaint || "",
	        salesNote: order.salesNote || "",
	        createdAt: order.createdAt || new Date().toISOString(),
	        updatedAt: new Date().toISOString()
	      };
	      await fb.setDoc(fb.doc(db, "orders", String(order.id)), orderForDB, { merge: true });
	      return { ok: true };
	    } catch (e) {
	      return { ok: false, error: e?.message || String(e) };
		    }
		  };

		  const upsertCustomerToFirestore = async (customer) => {
		    try {
		      const db = getFirestoreDb();
		      const customerForDB = {
		        name: customer.name || "",
		        contact: customer.contact || "",
		        phone: customer.phone || "",
		        zone: customer.zone || "",
		        address: customer.address || "",
		        mapUrl: customer.mapUrl || "",
		        note: customer.note || "",
		        updatedAt: new Date().toISOString()
		      };
		      await fb.setDoc(fb.doc(db, "customers", String(customer.id)), customerForDB, { merge: true });
		      return { ok: true };
		    } catch (e) {
		      return { ok: false, error: e?.message || String(e) };
		    }
		  };

	  // NOTE: Do not bulk sync state to Supabase on change.
	  // Supabase is the source of truth; we only upsert on explicit user actions (create/update).
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
    const delivered = orders.filter(order => order.status === "ส่งสำเร็จ");
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
	    setState(prev => ({ ...prev, customers: [nextCustomer, ...(prev.customers || [])] }));
    const saved = await upsertCustomerToFirestore(nextCustomer);
    if (!saved.ok) setSyncStatus(`⚠️ บันทึกลูกค้าไป Firestore ไม่สำเร็จ: ${saved.error}`);
	    setSelectedCustomerId(id);
	    setCustomerForm({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
	    setSyncStatus(`✅ บันทึกลูกค้า "${nextCustomer.name}" สำเร็จ`);
	  };

  const setAuth = authPatch => setState(prev => ({ ...prev, auth: { ...(prev.auth || {}), ...authPatch } }));

  const normalizePhoneToE164 = (raw) => {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    // Thailand default: allow 0xxxxxxxxx -> +66xxxxxxxxx
    if (digits.startsWith("0")) return `+66${digits.slice(1)}`;
    if (digits.startsWith("66")) return `+${digits}`;
    if (digits.startsWith("+")) return digits;
    // fallback: assume already national without 0
    return `+66${digits}`;
  };

  const startOtp = async () => {
    if (!loginForm.phone.trim()) return;
    try {
      setSyncStatus("⏳ กำลังส่งรหัส OTP...");
      const e164 = normalizePhoneToE164(loginForm.phone.trim());
      const confirmation = await startPhoneSignInE164(e164);
      setOtpState({ stage: "code", code: "", confirmation });
      setSyncStatus("✅ ส่ง OTP แล้ว กรุณากรอกรหัส");
    } catch (e) {
      setSyncStatus(`❌ ส่ง OTP ไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const verifyOtpAndLogin = async () => {
    if (otpState.stage !== "code" || !otpState.confirmation) return;
    const code = String(otpState.code || "").trim();
    if (!code) return;
    try {
      setSyncStatus("⏳ กำลังยืนยัน OTP...");
      const cred = await otpState.confirmation.confirm(code);
      const user = cred?.user;
      if (!user) throw new Error("No user");
      const idToken = await user.getIdToken(true);

      const role = loginForm.role;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          role,
          name: loginForm.name.trim(),
          phone: loginForm.phone.trim()
        })
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Login failed");

      const d = json.data || {};
      const newAuthState = {
        role: d.role || role,
        name: d.name || loginForm.name.trim() || "",
        phone: d.phone || loginForm.phone.trim(),
        driverId: d.driverId || "",
        email: "",
        token: idToken
      };
      localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
      setState(prev => ({ ...prev, auth: newAuthState }));
      if (newAuthState.driverId) setDriverId(newAuthState.driverId);
      setOtpState({ stage: "idle", code: "", confirmation: null });
      setSyncStatus("✅ เข้าสู่ระบบสำเร็จ");
      setTab(newAuthState.role === "driver" ? "driver" : "sales");
    } catch (e) {
      setSyncStatus(`❌ ยืนยัน OTP ไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const loginSales = async () => {
    // Firebase OTP flow
    if (otpState.stage === "code") return verifyOtpAndLogin();
    return startOtp();
  };

  const loginDriver = async () => {
    // Firebase OTP flow
    if (otpState.stage === "code") return verifyOtpAndLogin();
    return startOtp();
  };

	  const registerDriver = async () => {
	    if (!driverForm.firstName.trim() || !driverForm.phone.trim() || !driverForm.plate.trim()) return;
	    if (state.auth?.role !== "driver" || !state.auth?.token) {
	      setSyncStatus("⚠️ กรุณาเข้าสู่ระบบคนขับด้วย OTP ก่อน");
	      return;
	    }
	    try {
	      const res = await fetch("/api/auth/login", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({
	          idToken: state.auth.token,
	          role: "driver",
	          name: `${driverForm.firstName.trim()} ${driverForm.lastName.trim()}`.trim(),
	          phone: driverForm.phone.trim()
	        })
	      });
	      const json = await res.json();
	      if (!json?.ok) throw new Error(json?.error || "save failed");
	      const d = json.data || {};
	      const newAuthState = { ...state.auth, role: "driver", name: d.name || state.auth.name, driverId: d.driverId || state.auth.driverId || "" };
	      localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
	      setState(prev => ({ ...prev, auth: newAuthState }));
	      if (newAuthState.driverId) setDriverId(newAuthState.driverId);
	      setSyncStatus("✅ บันทึกข้อมูลคนขับแล้ว");
	    } catch (e) {
	      setSyncStatus(`❌ บันทึกข้อมูลคนขับไม่สำเร็จ: ${e?.message || e}`);
	    }
	  };

  const logout = () => {
    setState(prev => {
      const updated = { ...prev.onlineDrivers };
      if (auth.driverId) delete updated[auth.driverId];
      return { ...prev, onlineDrivers: updated };
    });
    try { fbLogout(); } catch {}
    localStorage.removeItem("hillkoff_auth");
    setAuth({ role: "", name: "", phone: "", driverId: "", email: state.auth?.email || "", token: "" });
  };

  const createOrder = async () => {
    if (!orderForm.customerName.trim()) {
      setSyncStatus("❌ กรุณากรอกชื่อลูกค้า");
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
	      if (supabase) {
	      const saved = await upsertCustomerToFirestore(customer);
	        if (!saved.ok) setSyncStatus(`⚠️ บันทึกลูกค้าไป Supabase ไม่สำเร็จ: ${saved.error}`);
	      }
	      setSyncStatus(`✅ บันทึกลูกค้าใหม่ "${customer.name}" อัตโนมัติ`);
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

	  const confirmOrder = async () => {
	    if (!pendingOrder) return;
    
    console.log("📤 confirmOrder: Adding order to state", pendingOrder.id);
	    setState(prev => ({ ...prev, orders: [pendingOrder, ...(prev.orders || [])] }));
	    if (supabase) {
	      const saved = await upsertOrderToFirestore(pendingOrder);
	      if (!saved.ok) setSyncStatus(`⚠️ ส่งออเดอร์ไป Supabase ไม่สำเร็จ: ${saved.error}`);
	    }
    
    setOrderForm({ customerName: "", window: "09:00-12:00", boxes: "4", cod: "", salesNote: "" });
    setShowOrderConfirm(false);
    setPendingOrder(null);
	    setSyncStatus(`✅ ส่งออเดอร์ "${pendingOrder.id}" เข้าคิวสำเร็จ`);
	    setTab("driver");
	  };

  const deleteOrder = (orderId) => {
    if (confirm("❌ ลบออเดอร์นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้")) {
      setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    }
  };

  const updateOrder = (id, patch) => {
    console.log(`📝 updateOrder: ${id}`, patch);
    setState(prev => {
      const updated = { ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) };
      
      // Auto-sync to Supabase immediately
      if (supabase) {
        const order = updated.orders.find(o => o.id === id);
        if (order) {
          (async () => {
            const { ok, error } = await upsertOrderToFirestore(order);
            if (!ok) {
              console.error(`❌ Failed to sync order ${id}:`, error);
            } else {
              console.log(`✅ Order ${id} synced to Supabase`);
            }
          })();
        }
      }
      
      return updated;
    });
	    setTimeout(() => {
	      try { pendingOrderUpdatesRef.current.delete(id); } catch {}
	    }, 250);
	  };
	  const updateCustomer = (id, patch) => {
	    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? { ...c, ...patch } : c) }));
	    if (supabase) {
	      const existing = state.customers.find(c => c.id === id);
	      if (existing) upsertCustomerToFirestore({ ...existing, ...patch });
	    }
	    setEditingCustomerId(null);
	  };
  const assignDriver = (id, nextDriverId) => updateOrder(id, {
    driverId: nextDriverId,
    status: nextDriverId ? "กำลังส่ง" : "รอคนขับรับ"
  });

  const uploadPod = async (order, file) => {
    if (!file) return;
    try {
      // Keep file on-device only (no Supabase upload). Use objectURL for instant UI; keep File in ref for sharing.
      podFilesRef.current[order.id] = file;
      const previewUrl = URL.createObjectURL(file);
      updateOrder(order.id, { photo: previewUrl, sharedToLine: false });
      setSyncStatus("✅ บันทึกรูป POD แล้ว (เก็บในเครื่อง) — โปรดกดแชร์ลง LINE");
    } catch (error) {
      setSyncStatus(`❌ บันทึกรูป POD ไม่สำเร็จ: ${error.message || error}`);
    }
  };

	  const shareOrderToLine = (order) => {
	    const text = buildLineMessageForOrder(order);
	    const file = podFilesRef.current?.[order.id];

	    if (!file) {
	      alert("ยังไม่พบไฟล์รูป POD ในเครื่อง (อาจรีเฟรชหน้า) กรุณาถ่าย/เลือกรูปใหม่อีกครั้ง");
	      return;
	    }
	    if (!navigator?.share) {
	      alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์ กรุณาเปิดผ่านมือถือ");
	      return;
	    }

	    (async () => {
	      try {
	        // Copy summary text, then immediately open share sheet (single flow)
	        let copied = false;
	        try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
	        if (!copied) {
	          const ok = confirm(`ไม่สามารถคัดลอกอัตโนมัติได้\n\nกรุณาก็อปข้อความนี้ไว้ก่อน แล้วกด OK เพื่อเปิดแชร์รูป:\n\n${text}`);
	          if (!ok) return;
	        }

	        // Step 1.5: Save POD image to device (best-effort)
	        const saved = downloadFileToDevice(file, `POD-${order.id}`);
	        if (!saved) {
	          // continue anyway
	        }

	        if (!navigator.canShare?.({ files: [file] })) {
	          alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์แบบแนบรูปอัตโนมัติ กรุณาเปิดผ่านมือถือ (Chrome/Safari) แล้วกดแชร์อีกครั้ง");
	          return;
	        }
	        // Step 2: Share image file (LINE may ignore text when file is attached)
	        await navigator.share({ files: [file] });
	        updateOrder(order.id, { sharedToLine: true });
	        if (copied) {
	          setSyncStatus("✅ คัดลอกสรุปแล้ว + แชร์รูปแล้ว (ไปวางสรุปในไลน์ได้ทันที)");
	        }
	      } catch {
	        // user cancelled or share failed
	      }
	    })();
	  };

	  const acceptOrder = async (id) => {
	    // Check if driver is logged in
	    if (!driverId) {
      setSyncStatus("⚠️ คนขับยังไม่ได้เลือก กรุณาตั้งค่าประจำตัวให้ถูกต้อง");
      return;
    }

    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`⚠️ ข้อมูลคนขับ "${driverId}" ไม่พบในระบบ ลองรีเฟรชหน้าดูครับ`);
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
            status: "กำลังส่ง"
          })
          .eq("id", id)
          .or("driverId.is.null,driverId.eq.")
          .select("*")
          .maybeSingle();

        if (error) {
          setSyncStatus(`❌ รับออเดอร์ไม่สำเร็จ: ${error.message}`);
          return;
        }

        if (!data) {
          setSyncStatus(`⚠️ ออเดอร์ "${id}" ถูกคนอื่นรับไปแล้ว`);
          await refreshFromSupabase();
          return;
        }

        console.log("✅ [ACCEPT] Order accepted in Supabase, updating local state...");
        // Update local state immediately to show change
        const accepted = convertToCamelCase(data);
        setState(prev => ({
          ...prev,
          orders: prev.orders.map(o => o.id === id ? accepted : o)
        }));
        setSyncStatus(`✅ รับออเดอร์ "${id}" เรียบร้อย`);
        // Don't refreshFromSupabase - let polling handle it to avoid race condition
        return;
      } catch (e) {
        setSyncStatus(`❌ รับออเดอร์ไม่สำเร็จ: ${e?.message || String(e)}`);
        return;
      }
    }

    updateOrder(id, { driverId, driverName, status: "กำลังส่ง" });
  };
  const checkIn = id => {
    if (!driverId) {
      setSyncStatus("⚠️ คนขับยังไม่ได้เลือก กรุณาตั้งค่าประจำตัวให้ถูกต้อง");
      return;
    }

    const order = orders.find(o => o.id === id);
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
      setSyncStatus(`⚠️ ข้อมูลคนขับ "${driverId}" ไม่พบในระบบ ลองรีเฟรชหน้าดูครับ`);
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
    updateOrder(id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH") });
    
    // Show order summary alert
    const summaryText = `✅ ส่งสำเร็จ!\n\n📦 ออเดอร์: ${order.customerName}\n📍 ${order.zone}\n💰 COD: ฿${money(order.cod || 0)}\n📸 POD: ${order.photo ? "✅ มี" : "❌ ไม่มี"}\n\nออเดอร์ถูกลงทะเบียนในระบบแล้ว`;
    alert(summaryText);
  };


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
              <div id="recaptcha-container" />
              {otpState.stage === "code" && (
                <input value={otpState.code} onChange={e => setOtpState(p => ({ ...p, code: e.target.value }))} placeholder="กรอกรหัส OTP" inputMode="numeric" />
              )}
              <button className="primary wide" onClick={loginForm.role === "sales" ? loginSales : loginDriver}>
                {otpState.stage === "code" ? "ยืนยัน OTP" : (loginForm.role === "sales" ? "ส่ง OTP เพื่อเข้าใช้งานฝ่ายขาย" : "ส่ง OTP เพื่อเข้าใช้งานคนขับ")}
              </button>
              {otpState.stage === "code" && (
                <button className="secondary wide" onClick={() => setOtpState({ stage: "idle", code: "", confirmation: null })}>เปลี่ยนเบอร์</button>
              )}
              <p className="login-note">เข้าสู่ระบบด้วย OTP (Firebase Auth) และซิงก์ข้อมูลผ่าน Firestore</p>
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
          {auth.role === "driver" && (
            <Stat icon={Star} label="ส่งสำเร็จของฉัน" value={`${orders.filter(o => o.status === "ส่งสำเร็จ" && o.driverId === driverId).length} งาน`} sub="งานของคุณทั้งหมด" tone="#22c55e" />
          )}
        </div>

        {displayTab === "sales" && (
          <>
            <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
              <button className="secondary" onClick={() => {
                const pwd = prompt("🔐 กรุณากรอกรหัสเพื่อรีเซ็ตออเดอร์:");
                if (pwd === null) return; // User cancelled
                if (pwd !== "2532") {
                  alert("❌ รหัสไม่ถูกต้อง");
                  return;
                }
                if (!window.confirm("ยืนยันอีกครั้ง: ต้องการรีเซ็ตออเดอร์ทั้งหมดหรือไม่? (ข้อมูลทั้งหมดจะถูกลบ)")) return;

                (async () => {
                  try {
                    // Disable polling during reset to prevent race condition
                    isResettingOrdersRef.current = true;
                    
                    if (!supabase) supabase = initSupabase();
                    if (!supabase) {
                      alert("❌ ยังเชื่อมต่อ Supabase ไม่ได้");
                      isResettingOrdersRef.current = false;
                      return;
                    }

                    setSyncStatus("⏳ กำลังลบออเดอร์ทั้งหมด (Supabase)...");
                    console.log("🔍 [RESET] Starting complete order reset process...");
                      
                      // STEP 1: Clear React state
                      console.log("🧹 [RESET] Step 1: Clearing React state (orders = [])...");
                      const emptyState = JSON.parse(JSON.stringify(state)); // Deep copy
                      emptyState.orders = [];
                      emptyState.customers = [];
                      setState(emptyState);
                      console.log("✅ [RESET] React state cleared", { orders: emptyState.orders.length, customers: emptyState.customers.length });
                      
                      // Wait for state update
                      await new Promise(resolve => setTimeout(resolve, 200));
                      console.log("✅ [RESET] State update delay completed");
                      
                      // STEP 2: Delete from Supabase
                      console.log("🗑️ [RESET] Step 2: Deleting from Supabase...");
                      
                      try {
                        // Fetch all order IDs
                        console.log("📋 [RESET] Fetching all order IDs...");
                        const { data: allOrders, error: fetchError } = await supabase
                          .from("orders")
                          .select("id");
                        
                        console.log("📋 [RESET] Fetch result:", { 
                          ordersCount: allOrders?.length || 0, 
                          hasError: !!fetchError,
                          errorMsg: fetchError?.message || "none"
                        });
                        
                        if (fetchError) {
                          console.error("❌ [RESET] Fetch failed:", fetchError);
                          throw new Error(`Fetch failed: ${fetchError.message}`);
                        }
                        
                        // Delete orders
                        if (allOrders && allOrders.length > 0) {
                          const orderIds = allOrders.map(o => o.id);
                          console.log(`🗑️ [RESET] Deleting ${orderIds.length} orders...`);
                          console.log("🗑️ [RESET] Order IDs:", orderIds);
                          
                          const { error: deleteError, count, status } = await supabase
                            .from("orders")
                            .delete()
                            .in("id", orderIds);
                          
                          console.log("🗑️ [RESET] Delete response:", { 
                            totalRequested: orderIds.length,
                            deletedCount: count, 
                            httpStatus: status,
                            hasError: !!deleteError,
                            errorMsg: deleteError?.message || "none"
                          });
                          
                          if (deleteError) {
                            console.error("❌ [RESET] Delete query failed:", deleteError);
                            throw new Error(`Delete failed: ${deleteError.message}`);
                          }
                          
                          if (count !== orderIds.length) {
                            console.warn(`⚠️ [RESET] WARNING: Only ${count} of ${orderIds.length} orders were deleted!`);
                          }
                          
                          // Verify deletion
                          console.log("✅ [RESET] Delete query completed, verifying...");
                          await new Promise(resolve => setTimeout(resolve, 1000));
                          
                          const { data: afterDelete, error: verifyError } = await supabase
                            .from("orders")
                            .select("id");
                          
                          console.log("✅ [RESET] Verification:", { 
                            ordersRemaining: afterDelete?.length || 0,
                            verifyError: verifyError?.message || "none"
                          });
                          
                          if (afterDelete && afterDelete.length > 0) {
                            console.warn("⚠️ [RESET] WARNING: Orders still exist after delete:", afterDelete.map(o => o.id));
                            console.warn("⚠️ [RESET] Remaining order IDs should be:", afterDelete.map(o => o.id).join(", "));
                          }
                        } else {
                          console.log("ℹ️ [RESET] No orders to delete");
                        }
                      } catch (e) {
                        console.error("❌ [RESET] Delete step failed:", e);
                        throw e;
                      }
                      
                      // STEP 3: Wait to ensure everything is synced
                      console.log("⏳ [RESET] Step 3: Waiting 5 seconds to ensure deletion is complete...");
                      await new Promise(resolve => setTimeout(resolve, 5000));
                      
                      // STEP 4: Final verification: fetching from Supabase
                      console.log("🔄 [RESET] Step 4: Final verification: fetching from Supabase...");
                      const { data: finalCheck, error: finalCheckError } = await supabase
                        .from("orders")
                        .select("id");
                      
                      console.log("🔄 [RESET] Final Supabase check:", {
                        ordersRemaining: finalCheck?.length || 0,
                        error: finalCheckError?.message || "none"
                      });
                      
                      if (finalCheck && finalCheck.length > 0) {
                        console.warn("⚠️ [RESET] WARNING: Orders still in Supabase after delete:", finalCheck.map(o => o.id));
                        console.log("🔄 [RESET] Attempting second delete round...");
                        
                        // Try delete again
                        const remainingIds = finalCheck.map(o => o.id);
                        const { error: deleteRetryError, count: retryCount } = await supabase
                          .from("orders")
                          .delete()
                          .in("id", remainingIds);
                        
                        console.log("🗑️ [RESET] Second delete attempt:", { 
                          retryCount, 
                          retryError: deleteRetryError?.message || "none"
                        });
                        
                        // Verify again
                        console.log("🔄 [RESET] After retry");
                      }
                      
                      // STEP 5: Re-enable sync
                      console.log("🔄 [RESET] Step 5: Re-enabling polling and sync...");
                      setSyncStatus("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ!");
                      alert("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ!\n\n✓ ลบออเดอร์ทั้งหมดจาก Supabase\n✓ รีเซ็ตสถานะทั้งระบบ");
                      isResettingOrdersRef.current = false;
                      
                      console.log("✅ [RESET] Process completed successfully!");
                    } catch (e) {
                      console.error("❌ [RESET] Process failed:", e);
                      setSyncStatus(`❌ รีเซ็ตไม่สำเร็จ: ${e?.message || String(e)}`);
                      alert(`❌ รีเซ็ตไม่สำเร็จ:\n${e?.message || String(e)}\n\n(ตรวจสอบ console สำหรับรายละเอียด)`);
                      isResettingOrdersRef.current = false;
                    }
                  })();
              }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>🔄 รีเซ็ตออเดอร์</button>
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

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              {(() => {
                const locs = state.driverLocations || {};
                const driverIds = Object.keys(locs).filter(did => locs[did]?.lat && locs[did]?.lng);
                const effectiveId = selectedMapDriverId || driverIds[0] || "";
                const selected = effectiveId ? locs[effectiveId] : null;
                const embed = selected ? osmEmbedUrl(selected.lat, selected.lng, 15) : "";

                return (
                  <>
                    <div className="panel-head"><h2>🗺️ Mini-map (OSM)</h2><span>{driverIds.length} คนมีพิกัด</span></div>
                    {driverIds.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>ยังไม่มีพิกัดคนขับ (ให้คนขับอนุญาต GPS และเปิดหน้า Driver ไว้)</p>
                    ) : (
                      <>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                          {driverIds.map(did => {
                            const d = locs[did];
                            const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
                            return (
                              <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
                                📍 {name}
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
                              เปิดแผนที่เต็ม (OpenStreetMap)
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
                const inProgress = orders.filter(o => o.driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง"));
                const byDriver = {};
                inProgress.forEach(o => {
                  byDriver[o.driverId] = byDriver[o.driverId] || [];
                  byDriver[o.driverId].push(o);
                });

                return (
                  <>
                    <div className="panel-head"><h2>🚚 งานที่คนขับกำลังส่ง</h2><span>{inProgress.length} งาน</span></div>
                    {inProgress.length === 0 ? (
                      <p className="muted" style={{ textAlign: "center", padding: "8px 0" }}>ยังไม่มีงานที่กำลังส่ง</p>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                        {Object.keys(byDriver).map(did => {
                          const driver = drivers.find(d => d.id === did);
                          const items = byDriver[did] || [];
                          return (
                            <div key={did} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                                <b>{driver?.name || items[0]?.driverName || "ไม่ทราบชื่อคนขับ"}</b>
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
                                    <small style={{ color: "#374151" }}>{o.customerName} · {o.zone}</small>
                                  </div>
                                ))}
                                {items.length > 5 && <small style={{ color: "#6b7280" }}>+ อีก {items.length - 5} งาน</small>}
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
              <div className="panel-head"><h2>ข้อมูลลูกค้าเก่า</h2><span>{customers.length} ร้าน</span></div>
              {customers.length === 0 ? (
                <p className="muted" style={{ textAlign: "center", padding: "20px", color: "#999" }}>📭 ยังไม่มีลูกค้า กดเพิ่มลูกค้าใหม่ด้านล่าง</p>
              ) : (
                <>
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
                </>
              )}

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
                  const pwd = prompt("🔐 กรุณากรอกรหัสเพื่อรีเซ็ตออเดอร์:");
                  if (pwd === null) return; // User cancelled
                  if (pwd !== "2532") {
                    alert("❌ รหัสไม่ถูกต้อง");
                    return;
                  }
                  if (!window.confirm("ยืนยันอีกครั้ง: ต้องการรีเซ็ตออเดอร์ทั้งหมดหรือไม่? (ข้อมูลทั้งหมดจะถูกลบ)")) return;

	                  (async () => {
	                    try {
	                      setSyncStatus("⏳ กำลังลบออเดอร์ทั้งหมด...");
	                      const res = await fetch("/api/admin/reset-orders", {
	                        method: "POST",
	                        headers: { "Content-Type": "application/json" },
	                        body: JSON.stringify({ password: pwd })
	                      });
	                      const json = await res.json();
	                      if (!json?.ok) {
	                        alert(`❌ ลบออเดอร์ไม่สำเร็จ: ${json?.error || "unknown error"}`);
	                        setSyncStatus(`❌ ลบออเดอร์ไม่สำเร็จ: ${json?.error || "unknown error"}`);
	                        return;
	                      }

	                      // Clear local state
	                      setState(prev => ({ ...prev, orders: [] }));
	                      
	                      setSyncStatus("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ");
	                      alert("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ");
	                    } catch (e) {
	                      alert(`❌ รีเซ็ตไม่สำเร็จ: ${e?.message || String(e)}`);
	                    }
	                    })();
                }} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>🔄 รีเซ็ตออเดอร์</button>
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

        {auth.role === "driver" && displayTab === "driver" && (
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
            {(() => {
              const pending = orders.filter(o => o.status === "รอคนขับรับ");
              console.log("📋 Driver page - Total orders:", orders.length, "Pending:", pending.length, "driverId:", driverId);
              return (
                <section className="panel">
                  <div className="panel-head"><h2>📦 รับออเดอร์ใหม่</h2><span>{pending.length} งาน</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                    {pending.map(order => {
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
                        
                        <button 
                          className="primary" 
                          style={{ width: "100%", padding: "10px", fontWeight: "bold", fontSize: "13px", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                          disabled={pendingOrderUpdatesRef.current.has(order.id)}
                          onClick={() => {
                            pendingOrderUpdatesRef.current.add(order.id);
                            updateOrder(order.id, { driverId, driverName: drivers.find(d => d.id === driverId)?.name, status: "กำลังส่ง" });
                            setSyncStatus(`✅ รับออเดอร์ "${order.id}" เรียบร้อย`);
                          }}>✓ รับออเดอร์นี้</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
            })()}

	            {/* ส่วนออเดอร์ที่รับแล้ว (In-Progress Orders) */}
	            {orders.filter(o => o.driverId === driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง")).length > 0 && (
	              <section className="panel">
	                <div className="panel-head"><h2>🚗 ออเดอร์ที่กำลังส่ง</h2><span>{orders.filter(o => o.driverId === driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง")).length} งาน</span></div>
	                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                  {orders.filter(o => o.driverId === driverId && (o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง")).map(order => (
	                    <div key={order.id} style={{ background: "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${statusColor[order.status]}`, display: "flex", flexDirection: "column", gap: "10px" }}>
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
	                            <button 
	                              className="primary" 
	                              style={{ padding: "8px", fontSize: "12px" }} 
	                              disabled={false}
	                              onClick={() => {
	                                updateOrder(order.id, { status: "กำลังจัดส่ง" });
	                                setSyncStatus(`✅ ถึงจุดหมายแล้ว ออเดอร์ "${order.id}"`);
	                              }}>🚗 ไปถึงแล้ว</button>
	                            <button 
	                              className="secondary" 
	                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} 
	                              disabled={false}
	                              onClick={() => {
	                                const reason = prompt("📝 เหตุผลในการยกเลิก:");
	                                if (reason) {
	                                  updateOrder(order.id, { status: "ยกเลิก", complaint: reason });
	                                  setSyncStatus(`❌ ยกเลิกออเดอร์ "${order.id}"`);
	                                }
	                              }}>❌ ยกเลิก</button>
                          </>
                        )}
                        {order.status === "กำลังจัดส่ง" && (
                          <>
	                            <label 
	                              className="primary" 
	                              style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", background: "#176b3a", color: "white" }}>
	                              📷 ถ่ายรูป
	                              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} disabled={false} onChange={(e) => {
	                                const file = e.target.files?.[0];
	                                if (file) uploadPod(order, file);
	                                e.target.value = "";
	                              }} />
	                            </label>
	                            <button 
	                              className="secondary" 
	                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} 
	                              disabled={false}
	                              onClick={() => {
	                                const reason = prompt("📝 เหตุผลในการยกเลิก:");
	                                if (reason) {
	                                  updateOrder(order.id, { status: "ยกเลิก", complaint: reason });
	                                }
	                              }}>❌ ยกเลิก</button>
                          </>
                        )}
	                        {order.status === "กำลังจัดส่ง" && order.photo && !order.sharedToLine && (
	                          <button
	                            className="primary"
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#2563eb" }}
	                            onClick={() => shareOrderToLine(order)}
	                          >💬 แชร์รูป+รายละเอียด (LINE)</button>
	                        )}
	                        {order.status === "กำลังจัดส่ง" && order.photo && order.sharedToLine && (
	                          <button 
	                            className="primary" 
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669" }} 
	                            disabled={false}
	                            onClick={() => {
	                              updateOrder(order.id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH") });
	                              setSyncStatus(`✅ ส่งออเดอร์ "${order.id}" สำเร็จแล้ว`);
	                            }}>✅ ส่งสำเร็จ</button>
	                        )}
                        {order.status === "ส่งสำเร็จ" && (
                          <button 
                            className="secondary" 
                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", opacity: pendingOrderUpdatesRef.current.has(order.id) ? 0.5 : 1, cursor: pendingOrderUpdatesRef.current.has(order.id) ? "not-allowed" : "pointer" }} 
                            disabled={pendingOrderUpdatesRef.current.has(order.id)}
                            onClick={() => {
                              pendingOrderUpdatesRef.current.add(order.id);
                              alert(`✅ ส่งสำเร็จแล้ว\n\n📦 ออเดอร์: ${order.customerName}\n📍 ${order.zone}\n💰 COD: ฿${money(order.cod || 0)}\n📸 POD: ✅ มี\n\nสามารถรับอีกงานได้`);
                            }}>🏠 ส่งเสร็จสิ้น</button>
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

	            {/* สรุป/ประวัติออเดอร์ที่ส่งสำเร็จ (พับเก็บ) */}
	            {orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").length > 0 && (
	              <section className="panel" style={{ background: "#f8fafc" }}>
	                <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
	                  <h2 style={{ margin: 0 }}>✅ ส่งสำเร็จแล้ว</h2>
	                  <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setShowDeliveredHistory(v => !v)}>
	                    {showDeliveredHistory ? "ซ่อนรายการ" : "ดูรายการ"}
	                  </button>
	                </div>
	                <div style={{ color: "#6b7280", fontSize: "12px" }}>
	                  {orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").length} งาน · รวม COD ฿{money(orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").reduce((sum, o) => sum + Number(o.cod || 0), 0))}
	                </div>

	                {showDeliveredHistory && (
	                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                    {orders
	                      .filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ")
	                      .slice()
	                      .reverse()
	                      .map(order => (
	                        <div key={order.id} style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", gap: "8px" }}>
	                          <div>
	                            <b style={{ fontSize: "14px", display: "block" }}>{order.id}</b>
	                            <b style={{ fontSize: "15px", display: "block", color: "#111827" }}>{order.customerName}</b>
	                            <small style={{ color: "#6b7280" }}>📍 {order.zone} · 💰 ฿{money(order.cod || 0)}</small><br/>
	                            {order.deliveredAt && <small style={{ color: "#16a34a", fontWeight: "bold" }}>✅ {order.deliveredAt}</small>}
	                          </div>
	                          {order.photo?.startsWith?.("data:") && (
	                            <div style={{ borderRadius: "6px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
	                              <img src={order.photo} alt="pod" style={{ width: "100%", height: "auto" }} />
	                            </div>
	                          )}
	                          <button className="primary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => shareOrderToLine(order)}>
	                            💬 แชร์รูป+รายละเอียด (LINE)
	                          </button>
	                        </div>
	                      ))}
	                  </div>
	                )}
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
		              {(() => {
		                const today = new Date();
		                const todayOrders = (orders || []).filter(o => {
		                  const created = o.createdAt ? new Date(o.createdAt) : null;
		                  return created && isSameLocalDay(created, today);
		                });
		                const total = todayOrders.length;
		                const waiting = todayOrders.filter(o => o.status === "รอคนขับรับ").length;
		                const active = todayOrders.filter(o => o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง").length;
		                const done = todayOrders.filter(o => o.status === "ส่งสำเร็จ").length;
		                const canceled = todayOrders.filter(o => o.status === "ยกเลิก").length;
		                const codAll = todayOrders.reduce((sum, o) => sum + Number(o.cod || 0), 0);
		                const codDone = todayOrders.filter(o => o.status === "ส่งสำเร็จ").reduce((sum, o) => sum + Number(o.cod || 0), 0);
		                return (
		                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #eee" }}>
		                    <b>ภาพรวมวันนี้ ({todayText()})</b>
		                    <div className="report-lines" style={{ marginTop: "8px" }}>
		                      <p>ออเดอร์วันนี้ <b>{total}</b> งาน</p>
		                      <p>รอคนขับรับ <b>{waiting}</b> · กำลังส่ง <b>{active}</b> · ส่งสำเร็จ <b>{done}</b> · ยกเลิก <b>{canceled}</b></p>
		                      <p>COD วันนี้รวม <b>{money(codAll)}</b> บาท · ส่งสำเร็จ <b>{money(codDone)}</b> บาท</p>
		                    </div>
		                  </div>
		                );
		              })()}
		            </section>

		            <section className="panel">
		              {(() => {
		                const locs = state.driverLocations || {};
		                const driverIds = Object.keys(locs).filter(did => locs[did]?.lat && locs[did]?.lng);
		                const effectiveId = selectedMapDriverId || driverIds[0] || "";
		                const selected = effectiveId ? locs[effectiveId] : null;
		                const embed = selected ? osmEmbedUrl(selected.lat, selected.lng, 15) : "";

		                return (
		                  <>
		                    <div className="panel-head"><h2>🗺️ Mini-map (OSM)</h2><span>{driverIds.length} คนมีพิกัด</span></div>
		                    {driverIds.length === 0 ? (
		                      <p className="muted" style={{ margin: 0 }}>ยังไม่มีพิกัดคนขับ (ให้คนขับอนุญาต GPS และเปิดหน้า Driver ไว้)</p>
		                    ) : (
		                      <>
		                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
		                          {driverIds.map(did => {
		                            const d = locs[did];
		                            const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
		                            return (
		                              <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
		                                📍 {name}
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
		                            <iframe title="osm-mini-map-settings" src={embed} style={{ width: "100%", height: "260px", border: "1px solid #e5e7eb", borderRadius: "8px" }} loading="lazy" />
		                            <a href={osmPageUrl(selected.lat, selected.lng, 16)} target="_blank" rel="noreferrer" className="secondary" style={{ display: "block", textAlign: "center", padding: "8px", textDecoration: "none" }}>
		                              เปิดแผนที่เต็ม (OpenStreetMap)
		                            </a>
		                          </div>
		                        )}
		                      </>
		                    )}
		                  </>
		                );
		              })()}
		            </section>

		            {auth.email === "online_marketing@hillkoff.com" && (
		              <section className="panel">
	                <div className="panel-head"><h2>⚙️ Admin Control</h2><span>เฉพาะแอดมิน</span></div>
	                <p style={{ color: "#666", fontSize: "12px", marginBottom: "12px" }}>ท่านเข้าสิทธิ์แอดมินเต็ม</p>
	                <button className="secondary" style={{ background: "#dc2626", color: "white", width: "100%", padding: "10px" }} onClick={() => {
	                  const pwd = prompt("🔐 กรุณากรอกรหัสเพื่อรีเซ็ตแดชบอร์ด:");
	                  if (pwd === null) return; // User cancelled
	                  if (pwd !== "2532") {
	                    alert("❌ รหัสไม่ถูกต้อง");
                    return;
                  }
                  if (!window.confirm("ยืนยันอีกครั้ง: ต้องการรีเซ็ตแดชบอร์ดทั้งหมดหรือไม่? (ข้อมูลทั้งหมดจะถูกลบ)")) return;
                  
	                  (async () => {
	                    try {
	                      const res = await fetch("/api/admin/reset-orders", {
	                        method: "POST",
	                        headers: { "Content-Type": "application/json" },
	                        body: JSON.stringify({ password: pwd })
	                      });
	                      const json = await res.json();
	                      if (!json?.ok) {
	                        alert(`❌ ลบไม่สำเร็จ: ${json?.error || "unknown error"}`);
	                        return;
	                      }
	                      setState(prev => ({ ...prev, orders: [] }));
	                      alert("✅ รีเซ็ตแดชบอร์ดสำเร็จ!");
	                    } catch (e) {
	                      alert(`❌ รีเซ็ตไม่สำเร็จ: ${e?.message || String(e)}`);
	                    }
	                  })();
                }}>🔄 รีเซ็ตแดชบอร์ด</button>
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
      title="แชท"
    >
      💬
    </button>

    {chatOpen && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1300, display: "grid", placeItems: "end center", padding: "16px" }}>
        <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <b>💬 แชททีม</b>
            <button className="secondary" onClick={() => setChatOpen(false)} style={{ padding: "6px 10px", fontSize: "12px" }}>ปิด</button>
          </div>
          <div style={{ padding: "12px 14px", maxHeight: "280px", overflowY: "auto", background: "#f9fafb", display: "grid", gap: "8px" }}>
            {chatMessages.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>ยังไม่มีข้อความ</p>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <b style={{ fontSize: "12px" }}>{m.sender_name || "ไม่ระบุ"} {m.sender_role ? `(${m.sender_role})` : ""}</b>
                    <small style={{ color: "#6b7280" }}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString("th-TH") : ""}</small>
                  </div>
                  <div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.message}</div>
                  {m.sender_phone && <a href={`tel:${m.sender_phone}`} style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}>📞 {m.sender_phone}</a>}
                </div>
              ))
            )}
          </div>
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
            <input value={chatText} onChange={e => setChatText(e.target.value)} placeholder="พิมพ์ข้อความ..." style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: "10px" }} />
            <button className="primary" onClick={sendChat} style={{ padding: "10px 14px" }}>ส่ง</button>
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


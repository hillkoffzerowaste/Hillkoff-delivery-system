"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { getFirebaseAuth, getFirestoreDb, fb, fbLogout, onFirebaseAuthStateChanged, onFirebaseIdTokenChanged, signInAnon, signInWithGoogle, signInWithStaffCredentials, getFcmToken } from "../lib/firebaseClient";
import { HILLKOFF_VEHICLES, findDefaultVehicleForDriver, findVehicleById, vehicleDisplayName } from "../lib/vehicleMaster";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FolderSync,
  MapPinned,
  MessageSquareWarning,
  Navigation,
  PackagePlus,
  BellRing,
  Search,
  Star,
  Store,
  Sparkles,
  Truck,
  UserCheck,
  Users,
  Settings
} from "lucide-react";

const STORE_KEY = "hillkoff-delivery-ops:v2";
const DRIVER_ORDERS_HISTORY_LIMIT = 1000;

// Supabase removed: Firebase (Auth+Firestore) is used instead
let supabase = null;
function initSupabase() { return null; }

const initialDrivers = [];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUS = ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ", "ติดปัญหา", "ยกเลิก"];
const statusColor = { "รอคนขับรับ": "#92400e", "กำลังส่ง": "#1d4ed8", "กำลังจัดส่ง": "#f59e0b", "ส่งสำเร็จ": "#166534", "ติดปัญหา": "#b91c1c", "ยกเลิก": "#dc2626" };

const BRANCH_ROUTE_STOPS = ["สาขาช้างเผือก", "สาขาโรงงานป่าแพ่ง", "สาขาสำนักงานใหญ่", "สาขามหิดล", "สาขาทับเดื่อ"];
const LONG_ROUTE_STOPS = ["ร้านหอมไกล จ.ชลบุรี", "สาขาราติก้า จ.กรุงเทพมหานคร"];
const LONG_ROUTE_RETURN_STOPS = ["สาขาราติก้า จ.กรุงเทพมหานคร", "เชียงใหม่"];
const routeTaskStatusColor = { "กำลังวิ่ง": "#1d4ed8", "เช็คอินแล้ว": "#92400e", "เสร็จงาน": "#166534", "ยกเลิก": "#dc2626" };

const DRIVER_DAILY_CHECK_ITEMS = [
  { id: "coolant", label: "ระดับน้ำหม้อพักน้ำอยู่ที่ Full ตอนเครื่องเย็น", detail: "ห้ามเปิดฝาหม้อน้ำเมื่อเครื่องร้อน" },
  { id: "engineOil", label: "น้ำมันเครื่องอยู่ระหว่าง F และ L", detail: "อุ่นเครื่อง ดับ 2-3 นาที เช็ดก้านวัดแล้ววัดซ้ำ" },
  { id: "leakage", label: "ไม่มีรอยรั่วใต้ท้องรถหรือในห้องเครื่อง", detail: "ตรวจน้ำมันเครื่อง เกียร์ เฟืองท้าย และน้ำหล่อเย็น" },
  { id: "warningLights", label: "ไฟเตือนหน้าปัดและมาตรวัดความร้อนปกติ", detail: "พบไฟเตือนให้จอดในที่ปลอดภัยและแจ้งหัวหน้า" }
];

const DRIVER_MORNING_NOTICE = [
  "ทำแบบประเมินและตรวจรถก่อนออกงานทุกเช้า",
  "พบความผิดปกติให้หยุดใช้รถก่อน แล้วแจ้งหัวหน้า/ฝ่ายขายทันที",
  "บันทึกหมายเหตุให้ชัด: อาการที่พบ เวลา เลขไมล์ และจุดที่เกิดปัญหา"
];

const DRIVER_CARE_BASICS = [
  "เติมเชื้อเพลิงให้พอรอบงาน และไม่ปล่อยน้ำมันต่ำต่อเนื่อง",
  "รักษาความสะอาดห้องโดยสาร/ท้ายรถ ไม่ให้สิ่งของกีดขวางหรือหล่นเสียหาย",
  "ขับนุ่มนวล ไม่เร่ง/เบรกกระชาก ลดการสึกหรอของยาง เบรก และช่วงล่าง",
  "จอดรถในที่ปลอดภัย ดับเครื่อง ล็อกรถ และเก็บกุญแจตามจุดที่กำหนด",
  "รถใช้งานหนัก ฝุ่นมาก หรือถนนขรุขระ ให้แจ้งตรวจเร็วกว่าระยะปกติ"
];

const DRIVER_WEEKLY_CHECK_ITEMS = [
  "ลมยางและสภาพยาง: เช็คตอนยางเย็น ดอกยางไม่สึกผิดปกติ ไม่มีตะปูหรือรอยแตก",
  "น้ำมันเบรกและน้ำมันคลัตช์: ระดับอยู่ที่ MAX",
  "แบตเตอรี่: น้ำกลั่นอยู่ระดับ UPPER/LEVEL ไม่เติมเกิน",
  "น้ำมันพาวเวอร์: วัดตามขีด COLD/HOT และอยู่ระดับ MAX",
  "ระบบไฟ: ไฟหน้า ไฟท้าย ไฟเลี้ยว ไฟเบรก ไฟถอย ไฟฉุกเฉินครบ",
  "สายพาน: สายพานปั๊มลมและแอร์ไม่มีรอยแตก ไม่หย่อน ไม่ดัง",
  "รายการเสริม: น้ำมันเกียร์อัตโนมัติ น้ำยาฉีดกระจก ใบปัดน้ำฝนพร้อมใช้งาน"
];

const DRIVER_RESPONSIBILITIES = [
  "ตรวจเช็ครถประจำวัน/สัปดาห์ก่อนใช้งานและบันทึกข้อเท็จจริง",
  "เฝ้าระวังอาการผิดปกติระหว่างขับขี่และหยุดรถเมื่อมีความเสี่ยง",
  "รายงานปัญหาตามลำดับงาน ไม่สรุปสาเหตุเองเกินข้อมูลที่พบ",
  "นำรถเข้าซ่อมตามคำสั่ง และทดสอบการใช้งานจริงหลังซ่อมก่อนรับรถ"
];

const DRIVER_PRECAUTIONS = [
  "มอง: ตรวจไฟเตือน เครื่องยนต์ แบตเตอรี่ น้ำมันเครื่อง และความร้อน",
  "ดม: กลิ่นไหม้ กลิ่นน้ำมัน หรือกลิ่นผิดปกติให้หยุดรถทันที",
  "ฟัง: เสียงเครื่อง ช่วงล่าง หรือสายพานดังผิดปกติให้บันทึกอาการ",
  "สัมผัส: พวงมาลัยดึง เบรกสั่น รถสั่น หรือแรงตก ให้แจ้งซ่อม",
  "วินัย: ปรับเบาะ/กระจกก่อนออกรถ และไม่พักเท้าบนคลัตช์หรือเบรก"
];

const DRIVER_REPAIR_STEPS = [
  "พนักงานขับรถรายงานข้อเท็จจริง อาการ หรือระยะทางที่ถึงกำหนด",
  "ผู้อำนวยการกองคลังพิจารณาความเห็นเบื้องต้นและเสนออนุมัติ",
  "หัวหน้างานธุรการดำเนินการจัดซื้อจัดจ้าง/เบิกจ่ายและสั่งนำรถเข้าซ่อม",
  "พนักงานขับรถทดสอบหลังซ่อมจริง ตรวจว่าปัญหาหายก่อนลงชื่อรับรถ"
];

const DRIVER_MAINTENANCE_SCHEDULE = [
  ["น้ำมันเครื่องและกรองน้ำมันเครื่อง", "10,000 กม.", "เปลี่ยนทุกระยะ"],
  ["ไส้กรองอากาศ", "20,000 กม.", "ตรวจความสะอาดทุก 2,500 กม."],
  ["น้ำมันเกียร์", "20,000 กม.", "ตรวจตามคู่มือรถ"],
  ["น้ำมันเฟืองท้าย", "20,000 กม.", "ครั้งแรกที่ 10,000 กม."],
  ["น้ำยาหล่อเย็น", "ทุก 2 ปี", "ใช้งานหนักให้ตรวจเร็วกว่ากำหนด"]
];

const initialCustomers = [];

const initialOrders = [];

function defaultState() {
  return {
    customers: initialCustomers,
    orders: initialOrders,
    routeTasks: [],
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

function formatThaiDateTime(dateLike) {
  return new Date(dateLike).toLocaleString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function generateOrderId() {
  const now = new Date();
  const datePart = now.toISOString().slice(2, 10).replaceAll("-", "");
  const timePart = [
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  ].map((part, index) => String(part).padStart(index === 3 ? 3 : 2, "0")).join("");
  const randomPart = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();

  return `DO-${datePart}-${timePart}-${randomPart}`;
}

function osmPageUrl(lat, lng, zoom = 16) {
  if (lat == null || lng == null) return "";
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=${encodeURIComponent(zoom)}/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
}

function osmEmbedUrl(lat, lng, zoom = 16, marker = true) {
  if (lat == null || lng == null) return "";
  const delta = 0.01;
  const left = Number(lng) - delta;
  const right = Number(lng) + delta;
  const top = Number(lat) + delta;
  const bottom = Number(lat) - delta;
  const bbox = `${left},${bottom},${right},${top}`;
  const base = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
  if (!marker) return base;
  return `${base}&marker=${encodeURIComponent(`${lat},${lng}`)}`;
}

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  // YYYY-MM-DD in Asia/Bangkok
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function digitsOnly(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

function normalizeCustomerText(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_.(),/\\]+/g, " ");
}

function compactCustomerText(raw) {
  return normalizeCustomerText(raw).replace(/\s+/g, "");
}

function customerSearchValues(customer) {
  const fields = [
    customer?.id,
    customer?.name,
    customer?.contact,
    customer?.phone,
    customer?.zone,
    customer?.address,
    customer?.note
  ];
  return {
    text: normalizeCustomerText(fields.join(" ")),
    compact: compactCustomerText(fields.join(" ")),
    phone: digitsOnly(customer?.phone)
  };
}

function customerMatchesQuery(customer, rawQuery) {
  const query = normalizeCustomerText(rawQuery);
  if (!query) return true;
  const values = customerSearchValues(customer);
  const compactQuery = compactCustomerText(query);
  const phoneQuery = digitsOnly(rawQuery);
  const words = query.split(/\s+/).filter(Boolean);
  return (
    words.every((word) => values.text.includes(word) || values.compact.includes(compactCustomerText(word))) ||
    (compactQuery && values.compact.includes(compactQuery)) ||
    (phoneQuery.length >= 3 && values.phone.includes(phoneQuery))
  );
}

function customerNameKey(rawName) {
  return compactCustomerText(rawName);
}

function generateCustomerId() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `C-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

function formatWithCommas(rawDigits) {
  const d = digitsOnly(rawDigits);
  if (!d) return "";
  try {
    return new Intl.NumberFormat("en-US").format(Number(d));
  } catch {
    return d;
  }
}

function parseServiceDateKey(key) {
  const m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
}

function privacySafeName(name) {
  const value = String(name || "").trim();
  if (!value) return "";
  return value.split(/\s+/)[0] || value;
}

function buildLineMessageForOrder(order) {
  const lines = [];
  lines.push("✅ ส่งของสำเร็จ");
  lines.push(`งาน: ${order.id}`);
  if (order.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
  if (order.zone) lines.push(`โซน: ${order.zone}`);
  if (order.deliveredAt) lines.push(`เวลา: ${order.deliveredAt}`);
  if (order.driverNote) lines.push(`หมายเหตุคนขับ: ${order.driverNote}`);
  return lines.join("\n");
}

function buildLineMessageForRouteTask(task, stop) {
  const lines = [];
  lines.push(stop?.kind === "midway" ? "📍 เช็คอินระหว่างทาง" : "✅ เช็คอินงานวิ่ง");
  lines.push(`งาน: ${task.id}`);
  lines.push(`ประเภท: ${task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"}`);
  if (task.driverName) lines.push(`คนขับ: ${task.driverName}`);
  if (task.origin) lines.push(`ต้นทาง: ${task.origin}`);
  if (task.destinationSummary) lines.push(`ปลายทาง: ${task.destinationSummary}`);
  if (stop?.name) lines.push(`จุดเช็คอิน: ${stop.name}`);
  if (stop?.checkedInAt) lines.push(`เวลา: ${stop.checkedInAt}`);
  if (stop?.note) lines.push(`หมายเหตุ: ${stop.note}`);
  return lines.join("\n");
}

function buildLineMessageForNewOrder(order) {
  const lines = [];
  lines.push("📦 มีออเดอร์ใหม่เข้าคิวคนขับ");
  if (order?.id) lines.push(`งาน: ${order.id}`);
  if (order?.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
  if (order?.zone) lines.push(`พื้นที่: ${order.zone}`);
  if (order?.address) lines.push(`ที่อยู่: ${order.address}`);
  if (order?.window) lines.push(`เวลา: ${order.window}`);
  if (order?.boxes != null) lines.push(`จำนวน: ${order.boxes} กล่อง`);
  if (order?.cod != null) lines.push(`COD: ฿${money(order.cod || 0)}`);
  if (order?.salesNote) lines.push(`หมายเหตุ: ${order.salesNote}`);
  lines.push("กรุณาเปิดแอพเพื่อรับงาน");
  return lines.join("\n");
}

function routeTaskStopKey(taskId, stopId) {
  return `${taskId}_${stopId}`;
}

async function dataUrlToFile(dataUrl, fileName) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = (blob.type || "image/jpeg").split("/").pop() || "jpg";
  return new File([blob], `${fileName}.${ext}`, { type: blob.type || "image/jpeg" });
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
  const [appClock, setAppClock] = useState(() => new Date());
  const [state, setState] = useState(defaultState);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [driverId, setDriverId] = useState("D1");
  const [loginForm, setLoginForm] = useState({ role: "sales", name: "", phone: "", pin: "", username: "", password: "" });
  const [rememberPhone, setRememberPhone] = useState(false);
  const [loginStage, setLoginStage] = useState("login"); // login | set_pin
  const [googleOtpStage, setGoogleOtpStage] = useState("idle"); // idle | otp
  const [googleOtpSession, setGoogleOtpSession] = useState(null);
  const [googleOtpCode, setGoogleOtpCode] = useState("");
  const [googleOtpDevCode, setGoogleOtpDevCode] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatMeta, setChatMeta] = useState(null);
  const [chatText, setChatText] = useState("");
  const [typingUsers, setTypingUsers] = useState([]); // [{uid,name,phone,updatedAtMs}]
  const chatListRef = useRef(null);
  const lastChatIdRef = useRef("");
  const lastEmergencyIdRef = useRef("");
  const lastEmergencySeenIdFromStorage = useMemo(() => {
    try { return localStorage.getItem("hillkoff_last_emergency_id") || ""; } catch { return ""; }
  }, []);
  const typingDebounceRef = useRef(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const chatLastReadKey = useMemo(() => {
    const phone = String(state.auth?.phone || "").trim();
    const role = String(state.auth?.role || "").trim();
    return `hillkoff_chat_last_read_${role || "anon"}_${phone || "unknown"}`;
  }, [state.auth?.phone, state.auth?.role]);
  const [fbAuthReady, setFbAuthReady] = useState(false);
  const [pushStatus, setPushStatus] = useState("");
  const [staffAccountForm, setStaffAccountForm] = useState({ username: "", password: "", name: "", role: "store" });
  const [notificationPermission, setNotificationPermission] = useState("default");

  // Sales-only database chatbot sidebar
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState([]); // [{role:'user'|'model', text:string}]
  const aiListRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setAppClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("hillkoff-last-phone");
    if (saved) {
      setLoginForm(p => ({ ...p, phone: saved }));
      setRememberPhone(true);
    }
    const savedSalesName = localStorage.getItem("hillkoff-last-sales-name");
    if (savedSalesName) setLoginForm(p => ({ ...p, name: savedSalesName }));
  }, []);

  // Keep driver "online" in local state for UI filtering (no server writes)
  useEffect(() => {
    if (state.auth?.role !== "driver") return;
    const did = state.auth?.driverId || driverId || "";
    if (!did) return;
    setState(prev => ({ ...prev, onlineDrivers: { ...(prev.onlineDrivers || {}), [did]: Date.now() } }));
    const t = setInterval(() => {
      setState(prev => ({ ...prev, onlineDrivers: { ...(prev.onlineDrivers || {}), [did]: Date.now() } }));
    }, 60_000);
    return () => clearInterval(t);
  }, [state.auth?.role, state.auth?.driverId, driverId]);

  const getOrCreateDeviceId = () => {
    try {
      const existing = localStorage.getItem("hillkoff-device-id");
      if (existing) return existing;
      const id = `dev_${Math.random().toString(16).slice(2)}_${Date.now()}`;
      localStorage.setItem("hillkoff-device-id", id);
      return id;
    } catch {
      return `dev_${Date.now()}`;
    }
  };
  const [driverForm, setDriverForm] = useState({ firstName: "", lastName: "", phone: "", vehicle: "รถยนต์", plate: "", zone: "เมืองเชียงใหม่" });
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderZoneFilter, setOrderZoneFilter] = useState("all");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [orderForm, setOrderForm] = useState({
    pickupWaitMinutes: "5",
    qty: "",
    paymentType: "COD",
    codAmount: "",
    salesNote: "",
    workflowType: "store_route"
  });
  const [orderCustomerSearch, setOrderCustomerSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("⏳ Connecting to Firestore...");
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [shareNewOrderToLine, setShareNewOrderToLine] = useState(false);
  const [selectedMapDriverId, setSelectedMapDriverId] = useState("");
  const [openReportDate, setOpenReportDate] = useState("");
  const [reportExportMode, setReportExportMode] = useState("single");
  const [reportExportDate, setReportExportDate] = useState(() => toServiceDateKey(new Date()));
  const [reportExportStartDate, setReportExportStartDate] = useState(() => toServiceDateKey(new Date()));
  const [reportExportEndDate, setReportExportEndDate] = useState(() => toServiceDateKey(new Date()));
  const [ordersLimit, setOrdersLimit] = useState(20);
  const customersLimit = 3000;
  const [driverLocationsLimit, setDriverLocationsLimit] = useState(20);
  const [chatLimit, setChatLimit] = useState(20);
  const [driverDailyChecks, setDriverDailyChecks] = useState({});
  const [driverWeeklyChecks, setDriverWeeklyChecks] = useState({});
  const [driverVehicleId, setDriverVehicleId] = useState("");
  const [driverVehicleChangedToday, setDriverVehicleChangedToday] = useState(false);
  const [driverOdometerStart, setDriverOdometerStart] = useState("");
  const [showDriverVehiclePicker, setShowDriverVehiclePicker] = useState(false);
  const [fuelBillForm, setFuelBillForm] = useState({
    odometer: "",
    fuelType: "ดีเซล",
    liters: "",
    amount: "",
    pricePerLiter: "",
    station: "",
    receiptNo: "",
    note: ""
  });
  const [fuelBillStatus, setFuelBillStatus] = useState("");
  const [fuelBillSubmitting, setFuelBillSubmitting] = useState(false);
  const [dailyVehicleStartSaved, setDailyVehicleStartSaved] = useState(false);
  const [dailyVehicleStartSubmitting, setDailyVehicleStartSubmitting] = useState(false);
  const [vehicleUsageForm, setVehicleUsageForm] = useState({
    odometer: "",
    usageType: "ส่งของ",
    detail: "",
    note: ""
  });
  const [vehicleEndForm, setVehicleEndForm] = useState({
    odometer: "",
    summary: "",
    note: ""
  });
  const [vehicleUsageStatus, setVehicleUsageStatus] = useState("");
  const [vehicleUsageSubmitting, setVehicleUsageSubmitting] = useState(false);
  const [driverAssessmentNotes, setDriverAssessmentNotes] = useState("");
  const [driverAssessmentStatus, setDriverAssessmentStatus] = useState("");
  const [driverAssessmentSubmitting, setDriverAssessmentSubmitting] = useState(false);
  const [driverAssessments, setDriverAssessments] = useState([]);
  const [driverAssessmentDrivers, setDriverAssessmentDrivers] = useState([]);
  const [routeTaskForm, setRouteTaskForm] = useState({
    type: "branch",
    origin: "สาขาสำนักงานใหญ่",
    branchDestination: "สาขาช้างเผือก",
    longDirection: "outbound",
    longDestinations: ["ร้านหอมไกล จ.ชลบุรี", "สาขาราติก้า จ.กรุงเทพมหานคร"],
    longReturnDestinations: ["สาขาราติก้า จ.กรุงเทพมหานคร", "เชียงใหม่"],
    note: ""
  });

  // Determine active screen early (used for data subscriptions)
  const displayTab = state.auth?.role === "driver"
    ? (tab === "driver-sop" ? "driver-sop" : tab === "driver-vehicle" ? "driver-vehicle" : tab === "driver-prep" ? "driver-prep" : "driver")
    : state.auth?.role === "store" ? "store-work"
    : state.auth?.role === "pack" ? "pack-work"
    : (tab === "driver" ? "sales" : tab);

  const todayServiceDate = toServiceDateKey(appClock);
  const getOrderServiceDate = (o) => {
    if (o?.serviceDate) return String(o.serviceDate).slice(0, 10);
    const sourceDate = o?.createdAt || o?.updatedAt || "";
    return sourceDate ? toServiceDateKey(sourceDate) : "";
  };
  const isTodayOrder = (o) => getOrderServiceDate(o) === todayServiceDate;
  const isOpenDeliveryStatus = (status) => ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง"].includes(String(status || ""));
  const isBacklogOrder = (o) => {
    const serviceDate = getOrderServiceDate(o);
    return Boolean(serviceDate) && serviceDate < todayServiceDate && isOpenDeliveryStatus(o?.status);
  };
  const [showDeliveredHistory, setShowDeliveredHistory] = useState(false);
  const [showDriverDailyReport, setShowDriverDailyReport] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const podFilesRef = useRef({}); // { [orderId]: File } kept on-device only (not synced)
  const routeTaskFilesRef = useRef({}); // { [taskId_stopId]: File } kept on-device only (not synced)
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

  const setAppBadgeSafe = async (count) => {
    try {
      if (navigator?.setAppBadge) await navigator.setAppBadge(count);
      else if (navigator?.clearAppBadge && (!count || count <= 0)) await navigator.clearAppBadge();
    } catch {}
  };

  const requestNotifyPermission = async () => {
    try {
      if (typeof Notification === "undefined") return false;
      setNotificationPermission(Notification.permission);
      if (Notification.permission === "granted") return true;
      if (Notification.permission === "denied") return false;
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      return res === "granted";
    } catch {
      return false;
    }
  };

  const ensureWebPushForDriver = async (authState, options = {}) => {
    const showStatus = Boolean(options.showStatus);
    try {
      if (typeof window === "undefined") return;
      if (!authState?.token) {
        if (showStatus) setPushStatus("กรุณาเข้าสู่ระบบใหม่เพื่อเปิดแจ้งเตือน");
        return;
      }
      if (authState.role !== "driver") return;
      if (!("serviceWorker" in navigator)) {
        if (showStatus) setPushStatus("อุปกรณ์นี้ไม่รองรับการแจ้งเตือนพื้นหลัง");
        return;
      }
      if (showStatus) setPushStatus("กำลังเปิดการแจ้งเตือน...");
      await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/", updateViaCache: "none" });
      const registration = await navigator.serviceWorker.ready;
      const ok = await requestNotifyPermission();
      if (!ok) {
        if (showStatus) setPushStatus("ยังไม่ได้อนุญาตการแจ้งเตือนในเบราว์เซอร์");
        return;
      }
      const tokenRes = await getFcmToken(registration);
      if (!tokenRes.ok) {
        if (showStatus) setPushStatus(`เปิดแจ้งเตือนไม่สำเร็จ: ${tokenRes.error || "ไม่มี token"}`);
        return;
      }
      const phoneDigits = String(authState.phone || "").replace(/\D/g, "");
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenRes.token,
          role: "driver",
          phoneDigits,
          driverId: authState.driverId || "",
          deviceId: getOrCreateDeviceId()
        }),
      });
      if (!res.ok) {
        if (showStatus) setPushStatus("บันทึก token แจ้งเตือนไม่สำเร็จ");
        return;
      }
      if (showStatus) setPushStatus("เปิดแจ้งเตือนออเดอร์แล้ว");
    } catch (e) {
      if (showStatus) setPushStatus(`เปิดแจ้งเตือนไม่สำเร็จ: ${e?.message || e}`);
    }
  };

	  useEffect(() => setState(readState()), []);

  useEffect(() => {
    try {
      if (typeof Notification !== "undefined") setNotificationPermission(Notification.permission);
    } catch {}
  }, []);

  useEffect(() => {
    if (state.auth?.role !== "driver") return;
    if (!state.auth?.token) return;
    try {
      if (typeof Notification !== "undefined") setNotificationPermission(Notification.permission);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        ensureWebPushForDriver(state.auth);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.auth?.role, state.auth?.token, state.auth?.driverId, state.auth?.phone]);

	  // Wait for Firebase Auth session to be ready (so Firestore rules see request.auth)
	  useEffect(() => {
	    // onAuthStateChanged should fire immediately (even with null user).
	    // As a safety net, mark ready after 2s to avoid a stuck "connecting" UI.
	    const t = setTimeout(() => setFbAuthReady(true), 2000);
      let unsubAuth = null;
      let unsubToken = null;
      try {
	      unsubAuth = onFirebaseAuthStateChanged(() => {
	        clearTimeout(t);
	        setFbAuthReady(true);
	      });
	      unsubToken = onFirebaseIdTokenChanged(async (user) => {
	        clearTimeout(t);
	        setFbAuthReady(true);
	        if (!user) return;
	        try {
	          const token = await user.getIdToken();
	          setState((prev) => {
	            if (!prev.auth?.role || prev.auth?.token === token) return prev;
	            const nextAuth = { ...(prev.auth || {}), token };
	            try { localStorage.setItem("hillkoff_auth", JSON.stringify(nextAuth)); } catch {}
	            return { ...prev, auth: nextAuth };
	          });
	        } catch (e) {
	          console.warn("Firebase ID token refresh listener failed", e);
	        }
	      });
      } catch (e) {
        clearTimeout(t);
        setFbAuthReady(true);
        console.warn("Firebase Auth listener disabled", e?.message || e);
      }
	    return () => {
	      clearTimeout(t);
	      try { unsubAuth?.(); } catch {}
	      try { unsubToken?.(); } catch {}
	    };
	  }, []);

	  // Firestore sync (minimize reads): subscribe only where realtime is needed.
	  useEffect(() => {
	    if (typeof window === "undefined") return;
	    if (!fbAuthReady) {
	      setSyncStatus("⏳ Waiting for Firebase Auth...");
	      return;
	    }
	    if (!state.auth?.token) {
	      setSyncStatus("Please login");
	      return;
	    }
	    const db = getFirestoreDb();
	    const unsubs = [];
	    let gotAnySnapshot = false;
	    const markConnected = () => {
	      if (gotAnySnapshot) return;
	      gotAnySnapshot = true;
	      setSyncStatus("🟢 Firestore realtime connected");
	    };

	    const needsOrdersRealtime = ["sales", "dispatch", "driver", "driver-prep", "store-work", "pack-work", "chiangmai", "reports", "settings"].includes(String(displayTab || ""));
	    const effectiveOrdersLimit = state.auth?.role === "driver"
	      ? Math.max(ordersLimit, DRIVER_ORDERS_HISTORY_LIMIT)
	      : ["reports", "settings"].includes(String(displayTab || "")) ? Math.max(ordersLimit, 500) : ordersLimit;
	    const needsRouteTasksRealtime = ["sales", "dispatch", "driver", "reports"].includes(String(displayTab || ""));
	    const needsCustomers = String(displayTab || "") === "sales";
	    const needsDriverLocations = ["sales", "dispatch"].includes(String(displayTab || ""));
	    const needsDriverAssessments = ["driver-sop-report", "settings"].includes(String(displayTab || ""));
	    const needsChat = Boolean(chatOpen);

      if (needsChat) {
        try {
          unsubs.push(
            fb.onSnapshot(
              fb.doc(db, "chat_meta", "team"),
              (snap) => {
                setChatMeta(snap.exists() ? { id: snap.id, ...(snap.data() || {}) } : null);
                markConnected();
              },
              (err) => {
                console.warn("Firestore chat status error", err);
                setChatMeta(null);
              }
            )
          );
        } catch {}
      }

	    // Orders: keep realtime (core UX), but limit results.
	    if (needsOrdersRealtime) {
	      try {
	        let ordersQ = fb.query(fb.collection(db, "orders"), fb.orderBy("updatedAt", "desc"), fb.limit(effectiveOrdersLimit));
	        if (state.auth?.role === "driver") {
	          const did = state.auth?.driverId || driverId || "";
	          if (did) {
	            ordersQ = fb.query(
	              fb.collection(db, "orders"),
	              fb.where("driverId", "in", ["", did]),
	              fb.orderBy("updatedAt", "desc"),
	              fb.limit(effectiveOrdersLimit)
	            );
	          } else {
	            ordersQ = fb.query(
	              fb.collection(db, "orders"),
	              fb.where("driverId", "==", ""),
	              fb.orderBy("updatedAt", "desc"),
	              fb.limit(effectiveOrdersLimit)
	            );
	          }
	        }
	        unsubs.push(
	          fb.onSnapshot(
	            ordersQ,
	            (snap) => {
	              const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	              setState((prev) => {
	                const prevById = {};
	                (prev.orders || []).forEach((o) => { prevById[o.id] = o; });
	                const merged = rows.map((r) => {
	                  const p = prevById[r.id];
	                  const keepLocalPhoto = p?.photo && (String(p.photo).startsWith("blob:") || String(p.photo).startsWith("data:"));
	                  const photo = keepLocalPhoto ? p.photo : (r.photo || "");
	                  const sharedToLine = p?.sharedToLine != null ? p.sharedToLine : Boolean(r.sharedToLine);
	                  return { ...r, photo, sharedToLine };
	                });
	                return { ...prev, orders: merged };
	              });
	              markConnected();
	            },
	            (err) => setSyncStatus?.(`⚠️ Firestore orders error: ${err.message || err}`)
	          )
	        );
	      } catch (e) {
	        console.warn("orders onSnapshot error", e);
	      }
	    }

	    if (needsRouteTasksRealtime) {
	      try {
	        const routeTasksQ = fb.query(fb.collection(db, "route_tasks"), fb.orderBy("updatedAt", "desc"), fb.limit(100));
	        unsubs.push(
	          fb.onSnapshot(
	            routeTasksQ,
	            (snap) => {
	              const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	              setState((prev) => {
	                const prevById = {};
	                (prev.routeTasks || []).forEach((task) => { prevById[task.id] = task; });
	                const merged = rows.map((task) => {
	                  const previous = prevById[task.id] || {};
	                  const prevStops = Array.isArray(previous.stops) ? previous.stops : [];
	                  const stops = Array.isArray(task.stops) ? task.stops.map((stop) => {
	                    const prevStop = prevStops.find((item) => item.id === stop.id) || {};
	                    const keepLocalPhoto = prevStop?.photo && (String(prevStop.photo).startsWith("blob:") || String(prevStop.photo).startsWith("data:"));
	                    return { ...stop, photo: keepLocalPhoto ? prevStop.photo : (stop.photo || "") };
	                  }) : [];
	                  return { ...task, stops };
	                });
	                return { ...prev, routeTasks: merged };
	              });
	              markConnected();
	            },
	            (err) => setSyncStatus?.(`⚠️ Firestore route tasks error: ${err.message || err}`)
	          )
	        );
	      } catch (e) {
	        console.warn("route_tasks onSnapshot error", e);
	      }
	    }

	    // Customers: keep the full searchable list current across sales devices.
	    if (needsCustomers) {
	      try {
	        const custQ = fb.query(fb.collection(db, "customers"), fb.orderBy("updatedAt", "desc"), fb.limit(customersLimit));
	        unsubs.push(
	          fb.onSnapshot(
	            custQ,
	            (snap) => {
	              const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	              setState((prev) => ({ ...prev, customers: rows }));
	              markConnected();
	            },
	            (err) => setSyncStatus?.(`⚠️ Firestore customers error: ${err.message || err}`)
	          )
	        );
	      } catch (e) {
	        console.warn("customers onSnapshot error", e);
	      }
	    }

	    // Driver locations: one-time fetch (check-in based; no constant realtime needed).
	    if (needsDriverLocations) {
	      (async () => {
	        try {
	          const locQ = fb.query(fb.collection(db, "driver_locations"), fb.orderBy("updatedAt", "desc"), fb.limit(driverLocationsLimit));
	          const snap = await fb.getDocs(locQ);
	          const next = {};
	          snap.docs.forEach((d) => {
	            const v = d.data() || {};
	            const did = v.driverId || d.id;
	            next[did] = { driverId: did, ...(v || {}) };
	          });
	          setState((prev) => ({ ...prev, driverLocations: next }));
	          markConnected();
	        } catch {}
	      })();
	    }

	    // Driver daily vehicle assessments: sales report view only.
	    if (needsDriverAssessments) {
	      (async () => {
	        try {
	          const idToken = await refreshAuthToken(true);
	          const res = await fetch("/api/driver-assessments/today", {
	            method: "POST",
	            headers: { "Content-Type": "application/json" },
	            body: JSON.stringify({ idToken, serviceDate: todayServiceDate })
	          });
	          const json = await res.json();
	          if (!json?.ok) throw new Error(json?.error || "load failed");
	          const rows = Array.isArray(json?.data?.assessments) ? json.data.assessments : [];
	          rows.sort((a, b) => String(b.updatedAt?.seconds || b.updatedAt || "").localeCompare(String(a.updatedAt?.seconds || a.updatedAt || "")));
	          setDriverAssessments(rows);
	          setDriverAssessmentDrivers(Array.isArray(json?.data?.drivers) ? json.data.drivers : []);
	          markConnected();
	        } catch (e) {
	          setSyncStatus(`⚠️ โหลดรายงานตรวจรถไม่สำเร็จ: ${e?.message || e}`);
	        }
	      })();
	    }

	    // Chat: realtime only while chat UI is open.
	    if (needsChat) {
	      try {
	        const chatQ = fb.query(fb.collection(db, "chat_messages"), fb.orderBy("createdAt", "desc"), fb.limit(chatLimit));
	        unsubs.push(
	          fb.onSnapshot(chatQ, (snap) => {
	            const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
	            setChatMessages(rows.reverse());
	            markConnected();
	          })
	        );
	      } catch {}

	      setTypingUsers([]);
	    }

	    return () => {
	      unsubs.forEach((u) => {
	        try { u(); } catch {}
	      });
	    };
	    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [fbAuthReady, state.auth?.token, state.auth?.role, state.auth?.driverId, driverId, displayTab, chatOpen, ordersLimit, customersLimit, driverLocationsLimit, chatLimit, todayServiceDate]);

  // (Supabase removed) no forced polling needed

  // Driver location: record only on "check-in" events (no continuous tracking)
  
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

  useEffect(() => {
    if (!chatOpen) return;
    // Firestore chat is realtime via onSnapshot; no polling needed
  }, [chatOpen]);

  const updateChatSummary = async ({ messageRef, type, text }) => {
    const db = getFirestoreDb();
    await fb.setDoc(fb.doc(db, "chat_meta", "team"), {
      lastMessageId: messageRef?.id || "",
      lastMessageAt: fb.serverTimestamp(),
      lastMessageText: String(text || "").slice(0, 160),
      lastMessageType: type || "chat",
      lastSenderRole: state.auth?.role || "",
      lastSenderName: state.auth?.name || "",
      lastSenderPhone: state.auth?.phone || "",
      messageCount: fb.increment(1),
      updatedAt: fb.serverTimestamp()
    }, { merge: true });
  };

  const finalizeChatSend = async ({ messageRef, type, text }) => {
    try {
      await updateChatSummary({ messageRef, type, text });
      markChatReadToCount(Number(chatMeta?.messageCount || 0) + 1);
    } catch (e) {
      console.warn("chat summary update failed after message send", e);
      setSyncStatus("✅ ส่งข้อความแล้ว (อัปเดตสถานะแชทไม่สำเร็จ แต่ข้อความถูกส่งแล้ว)");
    }
  };

  const sendChat = async () => {
    const text = (chatText || "").trim();
    if (!text) return;
    setChatText("");
    try {
      const db = getFirestoreDb();
      const messageRef = await fb.addDoc(fb.collection(db, "chat_messages"), {
        sender_role: state.auth?.role || "",
        sender_name: state.auth?.name || "",
        sender_phone: state.auth?.phone || "",
        type: "chat",
        message: text,
        createdAt: fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      });
      await finalizeChatSend({ messageRef, type: "chat", text });
      // Clear my typing flag
      updateTyping(false);
    } catch (e) {
      alert(`❌ ส่งข้อความไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const updateTyping = (isTyping) => {
    // Disabled intentionally to avoid high-frequency Firestore writes while typing.
  };

  const sendEmergency = async () => {
    const note = prompt("🚨 ขอความช่วยเหลือ (ใส่รายละเอียด เช่น รถเสีย/อุบัติเหตุ/ต้องการคนมาเปลี่ยน):");
    if (note === null) return;
    const text = String(note || "").trim();
    if (!text) return;
    try {
      const db = getFirestoreDb();
      const messageRef = await fb.addDoc(fb.collection(db, "chat_messages"), {
        sender_role: state.auth?.role || "",
        sender_name: state.auth?.name || "",
        sender_phone: state.auth?.phone || "",
        type: "emergency",
        message: text,
        createdAt: fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      });
      await finalizeChatSend({ messageRef, type: "emergency", text });
      // Local immediate feedback
      playNotificationSound();
    } catch (e) {
      alert(`❌ ส่งแจ้งเหตุฉุกเฉินไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  // Driver notifications: show badge + optional notification when new orders arrive.
  useEffect(() => {
    if (state.auth?.role !== "driver") return;
    const did = state.auth?.driverId || driverId || "";
    if (!did) return;
    const pending = (state.orders || []).filter(o => (!o.driverId || o.driverId === "" || o.driverId === did) && o.status === "รอคนขับรับ" && (!o.queueStatus || o.queueStatus === "queued"));
    const count = pending.length;
    setAppBadgeSafe(count);
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "hidden") return;

    if (count > (previousOrderCountRef.current || 0)) {
      playNotificationSound();
      requestNotifyPermission().then((ok) => {
        if (!ok) return;
        try {
          const first = pending[0];
          new Notification("📦 มีออเดอร์ใหม่", {
            body: first ? `${first.customerName || ""} · ${first.zone || ""}` : "มีออเดอร์ใหม่เข้ามา",
            icon: "/icon-192.png",
            tag: first?.id ? `new-order-${first.id}` : "new-order",
            requireInteraction: true,
          });
        } catch {}
      });
    }
    previousOrderCountRef.current = count;
  }, [state.auth?.role, state.auth?.driverId, driverId, state.orders]);

  // Chat UX: auto-scroll to latest message + emergency alert to everyone
  const scrollChatToBottom = () => {
    try {
      const el = chatListRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {}
  };

  const scrollAiToBottom = () => {
    try {
      const el = aiListRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    } catch {}
  };

  useEffect(() => {
    if (!aiOpen) return;
    setTimeout(scrollAiToBottom, 0);
  }, [aiOpen, aiMessages]);

  const refreshAuthToken = async (forceRefresh = true) => {
    const authClient = getFirebaseAuth();
    const user = authClient.currentUser;
    if (!user) {
      throw new Error("กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
    }

    const token = await user.getIdToken(forceRefresh);
    const nextAuth = { ...(state.auth || {}), token };
    localStorage.setItem("hillkoff_auth", JSON.stringify(nextAuth));
    setState((prev) => ({ ...prev, auth: { ...(prev.auth || {}), token } }));
    return token;
  };

  const sendToChatbot = async (text) => {
    const q = String(text || "").trim();
    if (!q) return;
    if (state.auth?.role !== "sales") return;
    if (!state.auth?.token) return;

    setAiBusy(true);
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: q }, { role: "model", text: "" }]);

    const phoneDigits = String(state.auth?.phone || "").replace(/\D/g, "");

    try {
      const idToken = await refreshAuthToken();
      const res = await fetch("/api/chat/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          phoneDigits,
          question: q,
          history: aiMessages.slice(-8).map((m) => ({ role: m.role, text: m.text }))
        }),
      });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => null);
        throw new Error(errorPayload?.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "chatbot failed");
      setAiMessages((prev) => {
        const next = prev.slice();
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "model") {
            next[i] = { ...next[i], text: json?.data?.answer || "ไม่พบคำตอบจากฐานข้อมูลครับ" };
            break;
          }
        }
        return next;
      });
    } catch (e) {
      setAiMessages((prev) => {
        const next = prev.slice();
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "model") {
            next[i] = { ...next[i], text: `❌ ขออภัย แชทบอทฐานข้อมูลตอบไม่ได้: ${e?.message || String(e)}` };
            break;
          }
        }
        return next;
      });
    } finally {
      setAiBusy(false);
    }
  };

  const parseChatTime = (v) => {
    try {
      if (!v) return null;
      if (typeof v?.toDate === "function") return v.toDate(); // Firestore Timestamp
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!chatOpen) return;
    scrollChatToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen]);

  const getLastReadChatCount = () => {
    try {
      const v = localStorage.getItem(chatLastReadKey);
      const n = Number(v || 0);
      if (n > 1_000_000) return 0; // Old versions stored timestamps in this key.
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  };

  const markChatReadToCount = (count) => {
    try {
      const n = Math.max(0, Number(count || 0));
      localStorage.setItem(chatLastReadKey, String(Number.isFinite(n) ? n : 0));
      setUnreadChatCount(0);
    } catch {}
  };

  const markChatReadUpToLatest = () => {
    const latestCount = Number(chatMeta?.messageCount || 0);
    if (latestCount > 0) markChatReadToCount(latestCount);
  };

  useEffect(() => {
    // Update unread badge from the one-doc chat summary, not from the messages list.
    const latestCount = Number(chatMeta?.messageCount || 0);
    if (!latestCount) {
      setUnreadChatCount(0);
      return;
    }
    if (chatOpen) {
      markChatReadToCount(latestCount);
      return;
    }
    const lastRead = getLastReadChatCount();
    setUnreadChatCount(Math.max(0, latestCount - lastRead));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMeta?.messageCount, chatOpen, chatLastReadKey]);

  useEffect(() => {
    if (!chatOpen) return;
    if (!chatMessages?.length) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (latest?.id && latest.id !== lastChatIdRef.current) {
      lastChatIdRef.current = latest.id;
      // next tick so DOM paints first
      setTimeout(scrollChatToBottom, 0);
    }
  }, [chatOpen, chatMessages]);

  useEffect(() => {
    if (!chatMessages?.length) return;
    // Find latest emergency in the last 50
    const latestEmergency = [...chatMessages].reverse().find((m) => m?.type === "emergency");
    if (!latestEmergency?.id) return;
    if (latestEmergency.id === lastEmergencyIdRef.current) return;
    if (latestEmergency.id === lastEmergencySeenIdFromStorage) {
      lastEmergencyIdRef.current = latestEmergency.id;
      return;
    }

    // If emergency is old (e.g., refresh), don't keep alerting.
    const t = parseChatTime(latestEmergency.createdAt);
    if (t && (Date.now() - t.getTime()) > 2 * 60_000) {
      lastEmergencyIdRef.current = latestEmergency.id;
      try { localStorage.setItem("hillkoff_last_emergency_id", latestEmergency.id); } catch {}
      return;
    }
    lastEmergencyIdRef.current = latestEmergency.id;
    try { localStorage.setItem("hillkoff_last_emergency_id", latestEmergency.id); } catch {}

    // Don't alert the sender repeatedly on their own device
    const myPhone = String(state.auth?.phone || "");
    const isMine = myPhone && String(latestEmergency.sender_phone || "") === myPhone;
    if (isMine) return;

    // Alert everyone
    playNotificationSound();
    requestNotifyPermission().then((ok) => {
      if (!ok) return;
      try {
        new Notification("🚨 แจ้งเหตุฉุกเฉิน", {
          body: `${latestEmergency.sender_name || "ไม่ระบุ"}: ${latestEmergency.message || ""}`.slice(0, 180),
        });
      } catch {}
    });
    try {
      if (typeof window !== "undefined") {
        alert(`🚨 แจ้งเหตุฉุกเฉิน\n\nจาก: ${latestEmergency.sender_name || "-"}\nโทร: ${latestEmergency.sender_phone || "-"}\n\n${latestEmergency.message || ""}`);
      }
    } catch {}
  }, [chatMessages, state.auth?.phone, lastEmergencySeenIdFromStorage]);

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
	        // POD is stored on-device only; never persist photo/blob URLs to Firestore
	        sharedToLine: Boolean(order.sharedToLine),
	        checkInAt: order.checkInAt || "",
	        deliveredAt: order.deliveredAt || "",
	        complaint: order.complaint || "",
	        salesNote: order.salesNote || "",
	        driverNote: order.driverNote || "",
	        createdAt: order.createdAt || new Date().toISOString(),
	        updatedAt: new Date().toISOString()
	      };
	      await fb.setDoc(fb.doc(db, "orders", String(order.id)), orderForDB, { merge: true });
	      return { ok: true };
	    } catch (e) {
	      return { ok: false, error: e?.message || String(e) };
		    }
		  };

		  const upsertDriverLocationToFirestore = async (payload) => {
		    try {
		      const db = getFirestoreDb();
		      const driverIdDoc = String(payload?.driverId || driverId || "").trim();
		      if (!driverIdDoc) return { ok: false, error: "Missing driverId" };
		      await fb.setDoc(fb.doc(db, "driver_locations", driverIdDoc), {
		        ...payload,
		        driverId: driverIdDoc,
		        updatedAt: new Date().toISOString()
		      }, { merge: true });
		      return { ok: true };
		    } catch (e) {
		      return { ok: false, error: e?.message || String(e) };
		    }
		  };

		  const upsertRouteTaskToFirestore = async (task) => {
		    try {
		      const db = getFirestoreDb();
		      const taskForDB = {
		        type: task.type || "branch",
		        routeDirection: task.routeDirection || "",
		        origin: task.origin || "",
		        destinationSummary: task.destinationSummary || "",
		        driverId: task.driverId || "",
		        driverName: task.driverName || "",
		        driverPhone: task.driverPhone || "",
		        status: task.status || "กำลังวิ่ง",
		        note: task.note || "",
		        stops: Array.isArray(task.stops) ? task.stops.map((stop) => ({
		          id: stop.id || "",
		          name: stop.name || "",
		          kind: stop.kind || "destination",
		          status: stop.status || "รอเช็คอิน",
		          checkedInAt: stop.checkedInAt || "",
		          note: stop.note || "",
		          sharedToLine: Boolean(stop.sharedToLine)
		        })) : [],
		        originStartedAt: task.originStartedAt || "",
		        startedAt: task.startedAt || new Date().toISOString(),
		        completedAt: task.completedAt || "",
		        serviceDate: task.serviceDate || toServiceDateKey(task.startedAt || new Date()),
		        updatedAt: new Date().toISOString()
		      };
		      await fb.setDoc(fb.doc(db, "route_tasks", String(task.id)), taskForDB, { merge: true });
		      return { ok: true };
		    } catch (e) {
		      return { ok: false, error: e?.message || String(e) };
		    }
		  };

		  const getCurrentLocationOnce = () => new Promise((resolve, reject) => {
		    if (typeof window === "undefined") return reject(new Error("no window"));
		    if (!navigator?.geolocation) return reject(new Error("geolocation not supported"));
		    navigator.geolocation.getCurrentPosition(
		      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
		      (err) => reject(err),
		      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 }
		    );
		  });

		  const recordDriverCheckInLocation = async (order) => {
		    try {
		      if (state.auth?.role !== "driver") return;
		      const did = state.auth?.driverId || driverId || "";
		      if (!did) return;
		      const d = (state.drivers || []).find(x => x.id === did) || {};
		      const loc = await getCurrentLocationOnce();
		      const payload = {
		        driverId: did,
		        driverName: order?.driverName || d?.name || state.auth?.name || "",
		        driverPhone: d?.phone || state.auth?.phone || "",
		        plate: d?.plate || "",
		        zone: order?.zone || d?.zone || "",
		        lat: loc.lat,
		        lng: loc.lng,
		        lastOrderId: order?.id || "",
		        lastCustomerName: order?.customerName || "",
		        checkInAt: new Date().toISOString()
		      };
		      // Best-effort: local UI + Firestore
		      setState(prev => ({
		        ...prev,
		        driverLocations: { ...(prev.driverLocations || {}), [did]: { ...(prev.driverLocations?.[did] || {}), ...payload } }
		      }));
		      const saved = await upsertDriverLocationToFirestore(payload);
		      if (!saved.ok) setSyncStatus(`⚠️ บันทึกพิกัดเช็คอินไม่สำเร็จ: ${saved.error}`);
		    } catch (e) {
		      // ignore (permissions/timeout)
		    }
		  };

		  const recordRouteTaskCheckInLocation = async (task, stop) => {
		    try {
		      if (state.auth?.role !== "driver") return;
		      const did = state.auth?.driverId || driverId || "";
		      if (!did) return;
		      const d = (state.drivers || []).find(x => x.id === did) || {};
		      const loc = await getCurrentLocationOnce();
		      const payload = {
		        driverId: did,
		        driverName: task?.driverName || d?.name || state.auth?.name || "",
		        driverPhone: d?.phone || state.auth?.phone || "",
		        plate: d?.plate || "",
		        zone: stop?.name || task?.destinationSummary || "",
		        lat: loc.lat,
		        lng: loc.lng,
		        lastOrderId: "",
		        lastCustomerName: stop?.name || "",
		        lastRouteTaskId: task?.id || "",
		        checkInAt: new Date().toISOString()
		      };
		      setState(prev => ({
		        ...prev,
		        driverLocations: { ...(prev.driverLocations || {}), [did]: { ...(prev.driverLocations?.[did] || {}), ...payload } }
		      }));
		      const saved = await upsertDriverLocationToFirestore(payload);
		      if (!saved.ok) setSyncStatus(`⚠️ บันทึกพิกัดงานวิ่งไม่สำเร็จ: ${saved.error}`);
		    } catch (e) {
		      // ignore GPS permission/timeout
		    }
		  };

		  const upsertCustomerToFirestore = async (customer) => {
		    try {
		      const idToken = await refreshAuthToken(true);
		      const res = await fetch("/api/customers/upsert", {
		        method: "POST",
		        headers: { "Content-Type": "application/json" },
		        body: JSON.stringify({ idToken, customer })
		      });
		      const json = await res.json().catch(() => null);
		      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
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
  const preparationOrders = (orders || []).filter(order => order.workflowType && order.queueStatus !== "queued");
  const storeWorkOrders = preparationOrders.filter(order => order.workflowType === "store_route" && ["pending", "working", "returned"].includes(order.storeStatus));
  const packWorkOrders = preparationOrders.filter(order => order.packStatus !== "blocked" && ["pending", "working", "waiting", "returned"].includes(order.packStatus));
  const routeTasks = state.routeTasks || [];
  const todayOrdersOnly = (orders || []).filter(isTodayOrder);
  const todayRouteTasks = (routeTasks || []).filter(task => String(task?.serviceDate || toServiceDateKey(task?.startedAt || new Date())) === todayServiceDate);
  const routeTaskSortValue = (task) => new Date(task?.updatedAt || task?.completedAt || task?.startedAt || 0).getTime() || 0;
  const sortedTodayRouteTasks = todayRouteTasks.slice().sort((a, b) => routeTaskSortValue(b) - routeTaskSortValue(a));
  const latestTodayRouteTask = sortedTodayRouteTasks[0] || null;
  const olderTodayRouteTasks = sortedTodayRouteTasks.slice(1);
  const activeTodayRouteTasks = todayRouteTasks
    .filter(task => task.status !== "เสร็จงาน" && task.status !== "ยกเลิก")
    .slice()
    .sort((a, b) => routeTaskSortValue(b) - routeTaskSortValue(a));
  const completedTodayRouteTasks = todayRouteTasks
    .filter(task => task.status === "เสร็จงาน")
    .slice()
    .sort((a, b) => routeTaskSortValue(b) - routeTaskSortValue(a));
  const driverRouteTasks = (routeTasks || []).filter(task => task.driverId === driverId);
  const activeDriverRouteTasks = driverRouteTasks.filter(task => task.status !== "เสร็จงาน" && task.status !== "ยกเลิก");
  const backlogUndelivered = (orders || []).filter(isBacklogOrder);
  const drivers = state.drivers?.length ? state.drivers : initialDrivers;
  const auth = state.auth || {};
  const selectedDriverProfile = useMemo(() => {
    return (drivers || []).find(d => d.id === (auth.driverId || driverId)) || {
      id: auth.driverId || driverId || "",
      name: auth.name || "",
      phone: auth.phone || ""
    };
  }, [drivers, auth.driverId, auth.name, auth.phone, driverId]);
  const defaultDriverVehicle = useMemo(() => findDefaultVehicleForDriver(selectedDriverProfile), [selectedDriverProfile]);
  const latestDriverVehicleKey = useMemo(() => {
    if (auth.role !== "driver") return "";
    const driverKey = auth.driverId || auth.phone || driverId || "driver";
    return `hillkoff_latest_vehicle:${driverKey}`;
  }, [auth.role, auth.driverId, auth.phone, driverId]);
  const [latestDriverVehicleId, setLatestDriverVehicleId] = useState("");
  const selectedDriverVehicle = useMemo(() => {
    return findVehicleById(driverVehicleId) || defaultDriverVehicle || HILLKOFF_VEHICLES[0] || null;
  }, [driverVehicleId, defaultDriverVehicle]);
  const selectedDriverVehicleId = selectedDriverVehicle?.id || "";
  const selectedDriverVehicleIsDefault = Boolean(defaultDriverVehicle?.id && selectedDriverVehicle?.id === defaultDriverVehicle.id);
  const dailyVehicleStartKey = useMemo(() => {
    if (auth.role !== "driver") return "";
    const driverKey = auth.driverId || auth.phone || driverId || "driver";
    return `hillkoff_vehicle_start:${driverKey}:${todayServiceDate}`;
  }, [auth.role, auth.driverId, auth.phone, driverId, todayServiceDate]);
  useEffect(() => {
    if (!dailyVehicleStartKey || typeof window === "undefined") {
      setDailyVehicleStartSaved(false);
      return;
    }
    try {
      const raw = localStorage.getItem(dailyVehicleStartKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved?.odometerStart && saved?.vehicleId) {
        setDailyVehicleStartSaved(true);
        setDriverOdometerStart(formatWithCommas(saved.odometerStart));
        setDriverVehicleId(saved.vehicleId);
        return;
      }
    } catch {}
    setDailyVehicleStartSaved(false);
  }, [dailyVehicleStartKey]);
  const needsDailyVehicleStart = auth.role === "driver" && (!dailyVehicleStartSaved || !driverOdometerStart || !selectedDriverVehicle?.id);
  useEffect(() => {
    if (!latestDriverVehicleKey || typeof window === "undefined") {
      setLatestDriverVehicleId("");
      return;
    }
    try {
      setLatestDriverVehicleId(localStorage.getItem(latestDriverVehicleKey) || "");
    } catch {
      setLatestDriverVehicleId("");
    }
  }, [latestDriverVehicleKey]);
  useEffect(() => {
    if (auth.role !== "driver") return;
    if (driverVehicleId) return;
    const nextVehicle = findVehicleById(latestDriverVehicleId) || findDefaultVehicleForDriver(selectedDriverProfile);
    if (nextVehicle?.id) setDriverVehicleId(nextVehicle.id);
  }, [auth.role, driverVehicleId, latestDriverVehicleId, selectedDriverProfile]);
  const driverAssessmentRoster = useMemo(() => {
    const map = new Map();
    const addDriver = (id, data = {}) => {
      const did = String(id || "").trim();
      if (!did) return;
      const current = map.get(did) || {};
      map.set(did, {
        id: did,
        name: data.name || data.driverName || current.name || did,
        phone: data.phone || data.driverPhone || current.phone || "",
        plate: data.plate || current.plate || "",
        zone: data.zone || current.zone || ""
      });
    };
    (driverAssessmentDrivers || []).forEach(d => addDriver(d.id, d));
    (drivers || []).forEach(d => addDriver(d.id, d));
    (orders || []).forEach(o => {
      if (o.driverId) addDriver(o.driverId, { driverName: o.driverName });
    });
    Object.values(state.driverLocations || {}).forEach(loc => addDriver(loc.driverId, loc));
    (driverAssessments || []).forEach(a => addDriver(a.driverId, a));
    return Array.from(map.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  }, [driverAssessmentDrivers, drivers, orders, state.driverLocations, driverAssessments]);
  const todayAssessmentByDriver = useMemo(() => {
    const map = new Map();
    (driverAssessments || []).forEach(a => {
      if (a.driverId) map.set(String(a.driverId), a);
    });
    return map;
  }, [driverAssessments]);
  const selectedCustomer = customers.find(customer => customer.id === selectedCustomerId) || null;
  // Driver can only see: (1) available orders (no driverId assigned), or (2) orders assigned to them specifically
  const driverOrders = orders.filter(order => {
    if (order.queueStatus && order.queueStatus !== "queued") return false;
    const isAvailable = !order.driverId || order.driverId === "";
    const isAssignedToMe = order.driverId === driverId;
    return isAvailable || isAssignedToMe;
  });
  const driverTodayOrders = (orders || [])
    .filter(order => order.driverId === driverId && isTodayOrder(order))
    .slice()
    .sort((a, b) => {
      const av = new Date(a.updatedAt || a.deliveredAt || a.createdAt || 0).getTime() || 0;
      const bv = new Date(b.updatedAt || b.deliveredAt || b.createdAt || 0).getTime() || 0;
      if (bv !== av) return bv - av;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
  const driverTodayCompletedOrders = driverTodayOrders.filter(order => order.status === "ส่งสำเร็จ");
  const driverTodayRouteTasks = (routeTasks || [])
    .filter(task => task.driverId === driverId && String(task?.serviceDate || "") === todayServiceDate)
    .slice()
    .sort((a, b) => routeTaskSortValue(b) - routeTaskSortValue(a));
  const driverTodayCompletedRouteTasks = driverTodayRouteTasks.filter(task => task.status === "เสร็จงาน");
  const driverTodayWorkSummary = {
    orders: driverTodayOrders.length,
    completedOrders: driverTodayCompletedOrders.length,
    routeTasks: driverTodayRouteTasks.length,
    completedRouteTasks: driverTodayCompletedRouteTasks.length,
    cod: driverTodayOrders.reduce((sum, order) => sum + Number(order.cod || 0), 0),
    codDone: driverTodayCompletedOrders.reduce((sum, order) => sum + Number(order.cod || 0), 0)
  };

  const report = useMemo(() => {
    const delivered = orders.filter(order => order.status === "ส่งสำเร็จ");
    const complaints = orders.filter(order => order.status === "ติดปัญหา" || order.complaint);
    const cod = orders.reduce((sum, order) => sum + Number(order.cod || 0), 0);
    // Note: driverScore is now skipped since drivers table is intentionally empty
    return { delivered: delivered.length, complaints, cod, driverScore: [] };
  }, [orders]);

  const filteredCustomers = customers.filter(customer => customerMatchesQuery(customer, customerQuery));
  const customerNameCounts = useMemo(() => {
    const counts = {};
    (customers || []).forEach((customer) => {
      const key = customerNameKey(customer?.name);
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [customers]);
  const customerPreviewCount = 3;
  const filteredOrders = orders.filter(order => {
    const queryText = [order.id, order.customerName, order.phone, order.zone, order.address, order.salesNote].join(" ").toLowerCase();
    const matchesQuery = queryText.includes(orderQuery.toLowerCase());
    const matchesStatus = orderStatusFilter === "all" || order.status === orderStatusFilter;
    const matchesZone = orderZoneFilter === "all" || order.zone === orderZoneFilter;
    return matchesQuery && matchesStatus && matchesZone;
  });

  const saveCustomer = async () => {
	    const normalizedName = String(customerForm.name || "").trim();
	    if (!normalizedName) {
	      setSyncStatus("⚠️ กรุณากรอกชื่อลูกค้า");
	      return;
	    }
	    const nameKey = customerNameKey(normalizedName);
	    const phoneKey = digitsOnly(customerForm.phone);
	    const existingByName = customers.find(customer => customerNameKey(customer?.name) === nameKey);
	    if (existingByName) {
	      setSelectedCustomerId(existingByName.id);
	      setCustomerQuery(normalizedName);
	      setSyncStatus(`⚠️ มีลูกค้า "${existingByName.name}" อยู่แล้ว กรุณาเลือกใช้หรือแก้ไขข้อมูลเดิม`);
	      return;
	    }
	    const existingByPhone = phoneKey.length >= 8
	      ? customers.find(customer => digitsOnly(customer?.phone) === phoneKey)
	      : null;
	    if (existingByPhone) {
	      const shouldCreate = window.confirm(
	        `พบเบอร์ ${customerForm.phone} อยู่ในข้อมูลลูกค้า "${existingByPhone.name}" แล้ว\n\nต้องการเพิ่มเป็นลูกค้ารายใหม่จริงหรือไม่?`
	      );
	      if (!shouldCreate) {
	        setSelectedCustomerId(existingByPhone.id);
	        setCustomerQuery(customerForm.phone);
	        setSyncStatus(`ℹ️ เลือกข้อมูลลูกค้า "${existingByPhone.name}" ที่ใช้เบอร์นี้อยู่แล้ว`);
	        return;
	      }
	    }
	    const id = generateCustomerId();
	    const nextCustomer = { id, ...customerForm, name: normalizedName };
	    setSyncStatus(`⏳ กำลังบันทึกลูกค้า "${nextCustomer.name}"...`);
    const saved = await upsertCustomerToFirestore(nextCustomer);
    if (!saved.ok) {
      setSyncStatus(`⚠️ บันทึกลูกค้าไป Firestore ไม่สำเร็จ: ${saved.error}`);
      return;
    }
	    setState(prev => ({
	      ...prev,
	      customers: [nextCustomer, ...(prev.customers || []).filter(customer => customer.id !== id)]
	    }));
	    setSelectedCustomerId(id);
	    setCustomerForm({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
	    setSyncStatus(`✅ บันทึกลูกค้า "${nextCustomer.name}" สำเร็จ`);
	  };

  const setAuth = authPatch => setState(prev => ({ ...prev, auth: { ...(prev.auth || {}), ...authPatch } }));

  const applyLoginSession = async (data, idToken) => {
    const d = data || {};
    const dp = d.driverProfile || null;
    const profileName =
      dp && (dp.firstName || dp.lastName)
        ? `${String(dp.firstName || "").trim()} ${String(dp.lastName || "").trim()}`.trim()
        : "";
    const role = d.role || loginForm.role;
    const newAuthState = {
      role,
      name: role === "driver" ? (profileName || d.name || loginForm.name.trim() || "") : (d.name || loginForm.name.trim() || ""),
      phone: d.phone || loginForm.phone.trim(),
      driverId: d.driverId || "",
      email: d.email || "",
      token: idToken
    };
    localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
    setState(prev => ({ ...prev, auth: newAuthState }));
    if (newAuthState.driverId) setDriverId(newAuthState.driverId);
    ensureWebPushForDriver(newAuthState);
    if (rememberPhone && newAuthState.phone) {
      try { localStorage.setItem("hillkoff-last-phone", newAuthState.phone); } catch {}
    }
    if (newAuthState.role === "driver") {
      const missing = !dp?.firstName || !dp?.plate || !dp?.vehicle;
      if (dp) {
        setDriverForm(p => ({
          ...p,
          firstName: dp.firstName || p.firstName,
          lastName: dp.lastName || p.lastName,
          phone: newAuthState.phone || p.phone,
          vehicle: dp.vehicle || p.vehicle,
          plate: dp.plate || p.plate,
          zone: dp.zone || p.zone
        }));
      } else {
        setDriverForm(p => ({ ...p, phone: newAuthState.phone || p.phone }));
      }
      if (missing || d.status === "pending_profile") {
        setAuth({ role: "driver-register" });
        setTab("driver");
        setSyncStatus("⚠️ กรุณากรอกข้อมูลคนขับครั้งแรก");
        return;
      }
      setTab("driver");
    } else {
      setTab("sales");
    }
  };

  const startGoogleOtpLogin = async () => {
    if (loginForm.role === "driver" && !loginForm.phone.trim()) {
      setSyncStatus("⚠️ คนขับต้องกรอกเบอร์โทรเพื่อผูกโปรไฟล์");
      return;
    }
    try {
      setSyncStatus("⏳ กำลังเปิด Google Login...");
      setGoogleOtpCode("");
      setGoogleOtpDevCode("");
      const cred = await signInWithGoogle();
      const user = cred?.user;
      if (!user) throw new Error("No Google user");
      const idToken = await user.getIdToken(true);
      const res = await fetch("/api/auth/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          role: loginForm.role,
          name: loginForm.name.trim() || user.displayName || "",
          phone: loginForm.phone.trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setGoogleOtpSession(json.data || null);
      setGoogleOtpDevCode(json.data?.devOtp || "");
      setGoogleOtpStage("otp");
      setSyncStatus("✅ ยืนยัน Google แล้ว กรุณากรอก OTP ภายใน 5 นาที");
    } catch (e) {
      setSyncStatus(`❌ Google Login ไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const verifyGoogleOtpLogin = async () => {
    if (!googleOtpSession?.sessionId || !googleOtpCode.trim()) {
      setSyncStatus("⚠️ กรุณากรอก OTP");
      return;
    }
    try {
      setSyncStatus("⏳ กำลังตรวจ OTP...");
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("Google session expired");
      const idToken = await user.getIdToken(true);
      const res = await fetch("/api/auth/google/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          sessionId: googleOtpSession.sessionId,
          otp: googleOtpCode.trim(),
          deviceId: getOrCreateDeviceId()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const errorText = {
          OTP_INVALID: "OTP ไม่ถูกต้อง",
          OTP_EXPIRED: "OTP หมดอายุแล้ว กรุณาขอใหม่",
          OTP_ALREADY_USED: "OTP นี้ถูกใช้ไปแล้ว",
          OTP_TOO_MANY_ATTEMPTS: "กรอกผิดเกินจำนวนที่กำหนด กรุณาขอใหม่"
        }[json?.error] || json?.error || `HTTP ${res.status}`;
        throw new Error(errorText);
      }
      await applyLoginSession(json.data, idToken);
      setGoogleOtpStage("idle");
      setGoogleOtpSession(null);
      setGoogleOtpCode("");
      setGoogleOtpDevCode("");
      setSyncStatus("✅ เข้าสู่ระบบด้วย Google + OTP สำเร็จ");
    } catch (e) {
      setSyncStatus(`❌ ตรวจ OTP ไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const pinLogin = async () => {
    if (!loginForm.phone.trim()) return;
    const deviceId = getOrCreateDeviceId();

    if (loginStage === "set_pin") {
      if (!loginForm.pin.trim()) return;
      if (loginForm.pin.trim().length < 4) {
        setSyncStatus("⚠️ PIN อย่างน้อย 4 ตัว");
        return;
      }
      if (loginForm.pin.trim() !== String(pinConfirm || "").trim()) {
        setSyncStatus("⚠️ PIN ไม่ตรงกัน");
        return;
      }
    } else {
      if (!loginForm.pin.trim()) return;
    }
    try {
      setSyncStatus("⏳ กำลังเข้าสู่ระบบ...");
      const cred = await signInAnon();
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
          phone: loginForm.phone.trim(),
          pin: loginForm.pin.trim(),
          setPin: loginStage === "set_pin",
          deviceId,
          rememberDevice: rememberPhone
        })
      });
      const json = await res.json();
      if (!json?.ok) {
        if (json?.error === "PIN_NOT_SET") {
          setLoginStage("set_pin");
          setSyncStatus("⚠️ ยังไม่ตั้ง PIN: กรุณาตั้ง PIN ครั้งแรก");
          return;
        }
        if (json?.error === "PIN_REQUIRED") {
          setLoginStage("login");
          setSyncStatus("⚠️ กรุณากรอก PIN");
          return;
        }
        if (json?.error === "INVALID_PIN") {
          setLoginStage("login");
          setSyncStatus("❌ PIN ไม่ถูกต้อง");
          return;
        }
        throw new Error(json?.error || "Login failed");
      }

      const d = json.data || {};
      const dp = d.driverProfile || null;
      const profileName =
        dp && (dp.firstName || dp.lastName)
          ? `${String(dp.firstName || "").trim()} ${String(dp.lastName || "").trim()}`.trim()
          : "";
      const newAuthState = {
        role: d.role || role,
        // Prefer driver's registered profile name over whatever was typed on the PIN screen (often phone)
        name: (d.role || role) === "driver" ? (profileName || d.name || loginForm.name.trim() || "") : (d.name || loginForm.name.trim() || ""),
        phone: d.phone || loginForm.phone.trim(),
        driverId: d.driverId || "",
        email: "",
        token: idToken
      };
      localStorage.setItem("hillkoff_auth", JSON.stringify(newAuthState));
      setState(prev => ({ ...prev, auth: newAuthState }));
      if (newAuthState.driverId) setDriverId(newAuthState.driverId);
      ensureWebPushForDriver(newAuthState);
      setSyncStatus("✅ เข้าสู่ระบบสำเร็จ");
      setLoginStage("login");
      setPinConfirm("");
      if (rememberPhone) {
        try { localStorage.setItem("hillkoff-last-phone", loginForm.phone.trim()); } catch {}
      }
      if (newAuthState.role === "driver") {
        const missing = !dp?.firstName || !dp?.plate || !dp?.vehicle;
        if (dp) {
          setDriverForm(p => ({
            ...p,
            firstName: dp.firstName || p.firstName,
            lastName: dp.lastName || p.lastName,
            phone: newAuthState.phone || p.phone,
            vehicle: dp.vehicle || p.vehicle,
            plate: dp.plate || p.plate,
            zone: dp.zone || p.zone
          }));
        } else {
          setDriverForm(p => ({ ...p, phone: newAuthState.phone || p.phone }));
        }
        if (missing) {
          setAuth({ role: "driver-register" });
          setTab("driver");
          setSyncStatus("⚠️ กรุณากรอกข้อมูลคนขับครั้งแรก");
          return;
        }
        setTab("driver");
      } else {
        setTab("sales");
      }
    } catch (e) {
      setSyncStatus(`❌ เข้าสู่ระบบไม่สำเร็จ: ${e?.message || e}`);
    }
  };

  const loginSales = async () => {
    return pinLogin();
  };

  const loginDriver = async () => {
    return pinLogin();
  };

  const loginStaff = async () => {
    try {
      setSyncStatus("⏳ กำลังเข้าสู่ระบบพนักงาน...");
      const cred = await signInWithStaffCredentials(loginForm.username, loginForm.password);
      const idToken = await cred.user.getIdToken(true);
      const res = await fetch("/api/auth/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const json = await res.json();
      if (!json?.valid || !["store", "pack"].includes(json?.data?.role)) throw new Error(json?.error || "บัญชีไม่มีสิทธิ์สโตร์/ห้องแพ็ค");
      await applyLoginSession(json.data, idToken);
      setTab(json.data.role === "store" ? "store-work" : "pack-work");
      setSyncStatus("✅ เข้าสู่ระบบสำเร็จ");
    } catch (e) { setSyncStatus(`❌ เข้าสู่ระบบไม่สำเร็จ: ${e?.message || e}`); }
  };

	  const registerDriver = async () => {
	    if (!driverForm.firstName.trim() || !driverForm.phone.trim() || !driverForm.plate.trim()) return;
	    if (!state.auth?.token) {
	      setSyncStatus("⚠️ กรุณาเข้าสู่ระบบก่อน");
	      return;
	    }
      if (!loginForm.pin.trim()) {
        setSyncStatus("⚠️ กรุณากรอก PIN");
        return;
      }
	    try {
	      const idToken = await refreshAuthToken(true);
	      const res = await fetch("/api/auth/login", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({
	          idToken,
	          role: "driver",
	          name: `${driverForm.firstName.trim()} ${driverForm.lastName.trim()}`.trim(),
	          phone: driverForm.phone.trim(),
	          pin: loginForm.pin.trim(),
	          driverProfile: {
	            firstName: driverForm.firstName.trim(),
	            lastName: driverForm.lastName.trim(),
	            phone: driverForm.phone.trim(),
	            vehicle: driverForm.vehicle,
	            plate: driverForm.plate.trim(),
	            zone: driverForm.zone
	          }
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
	      setAuth({ role: "driver" });
	      setTab("driver");
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
    if (!selectedCustomerId) {
      setSyncStatus("❌ กรุณาเลือกลูกค้าจากรายชื่อ");
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) {
      setSyncStatus("❌ ไม่พบลูกค้าที่เลือก กรุณาเลือกใหม่");
      return;
    }
    
    const id = generateOrderId();
    const serviceDate = toServiceDateKey(new Date());
    const nextOrder = {
      id,
      serviceDate,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone || "",
      zone: customer.zone,
      address: customer.address,
      mapUrl: customer.mapUrl,
      window: `รอรับ ${Number(orderForm.pickupWaitMinutes || 0) || 0} นาที`,
      boxes: Number(orderForm.qty || 0),
      paymentType: orderForm.paymentType || "COD",
      cod: (orderForm.paymentType || "COD") === "COD" ? Number(digitsOnly(orderForm.codAmount) || 0) : 0,
      driverId: "",
      driverName: "",
      salesName: auth.name,
      salesPhone: auth.phone,
      status: "รอจัดเตรียมสินค้า",
      workflowType: orderForm.workflowType,
      storeStatus: orderForm.workflowType === "direct_pack" ? "skipped" : "pending",
      packStatus: orderForm.workflowType === "direct_pack" ? "pending" : "blocked",
      queueStatus: "preparing",
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
    const shouldShareLine = shareNewOrderToLine;
    const orderForLine = pendingOrder;
    const text = buildLineMessageForNewOrder(orderForLine);
    let copied = false;
    let shareOpened = false;
    try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
    if (shouldShareLine) {
      if (!navigator?.share) {
        setSyncStatus(copied
          ? `⏳ คัดลอกข้อความคิวงานแล้ว กำลังส่งออเดอร์ "${orderForLine.id}" เข้าคิว...`
          : `⏳ กำลังส่งออเดอร์ "${orderForLine.id}" เข้าคิว...`);
      } else {
        try {
          if (!copied) {
            const ok = confirm(`ไม่สามารถคัดลอกอัตโนมัติได้\n\nกรุณาก็อปข้อความนี้ไว้ก่อน แล้วกด OK เพื่อเปิดแชร์:\n\n${text}`);
            if (!ok) return;
          }
          await navigator.share({ text });
          shareOpened = true;
        } catch {}
      }
    }
    
    console.log("📤 confirmOrder: Adding order to state", pendingOrder.id);
	    setState(prev => ({ ...prev, orders: [pendingOrder, ...(prev.orders || [])] }));
    setOrderForm({ pickupWaitMinutes: "5", qty: "", paymentType: "COD", codAmount: "", salesNote: "", workflowType: "store_route" });
    setSelectedCustomerId("");
    setOrderCustomerSearch("");
    setShowOrderConfirm(false);
    setPendingOrder(null);
    setShareNewOrderToLine(false);
    setTab("driver");
    setSyncStatus(copied
      ? `⏳ คัดลอกข้อความคิวงานแล้ว กำลังส่งออเดอร์ "${orderForLine.id}" เข้าคิว...`
      : `⏳ กำลังส่งออเดอร์ "${orderForLine.id}" เข้าคิว...`);
	    // Create via server so it can trigger Web Push notifications (FCM)
	    const idToken = await refreshAuthToken(true);
	    const res = await fetch("/api/orders/create", {
	      method: "POST",
	      headers: { "Content-Type": "application/json" },
	      body: JSON.stringify({ idToken, order: pendingOrder })
	    });
	    const json = await res.json();
	    if (!json?.ok) {
	      setSyncStatus(`⚠️ ส่งออเดอร์ไป Firestore ไม่สำเร็จ: ${json?.error || "create failed"}`);
	      return;
	    }
    if (shouldShareLine) {
      if (!navigator?.share) {
        setSyncStatus(copied
          ? `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวแล้ว และคัดลอกข้อความคิวงานแล้ว`
          : `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวแล้ว แต่อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์`);
      } else {
        setSyncStatus(shareOpened
          ? `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวแล้ว และเปิดแชร์ LINE แล้ว`
          : `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวแล้ว หากแชร์ LINE ไม่ขึ้น ให้เปิด LINE แล้ววางข้อความที่คัดลอกไว้`);
      }
    } else {
	    setSyncStatus(copied
        ? `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวแล้ว และคัดลอกข้อความคิวงานแล้ว`
        : `✅ ส่งออเดอร์ "${orderForLine.id}" เข้าคิวสำเร็จ (Firestore)`);
    }
	  };

  const deleteOrder = async (orderId) => {
    if (!confirm("❌ ลบออเดอร์นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้")) return;
    const previousOrders = state.orders || [];
    setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    setSyncStatus(`⏳ กำลังลบออเดอร์ "${orderId}" จาก Firestore...`);
    try {
      const db = getFirestoreDb();
      await fb.deleteDoc(fb.doc(db, "orders", String(orderId)));
      setSyncStatus(`✅ ลบออเดอร์ "${orderId}" สำเร็จ`);
    } catch (error) {
      setState(prev => ({ ...prev, orders: previousOrders }));
      setSyncStatus(`❌ ลบออเดอร์ไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  const updateOrder = (id, patch) => {
    console.log(`📝 updateOrder: ${id}`, patch);
    setState(prev => {
      const updated = { ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) };
      
      // Auto-sync to Supabase immediately
      const order = updated.orders.find(o => o.id === id);
      if (order) {
        (async () => {
          const { ok, error } = await upsertOrderToFirestore(order);
          if (!ok) {
            console.error(`❌ Failed to sync order ${id}:`, error);
          } else {
            console.log(`✅ Order ${id} synced to Firestore`);
            try {
              const idToken = await refreshAuthToken(true);
              await fetch("/api/orders/sync-sheet", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ orderId: id }) });
            } catch (sheetError) {
              console.warn(`⚠️ Failed to sync order ${id} to delivery sheet`, sheetError);
            }
          }
        })();
      }
      
      return updated;
    });
	    setTimeout(() => {
	      try { pendingOrderUpdatesRef.current.delete(id); } catch {}
	    }, 250);
	  };

  const submitDriverDailyAssessment = async () => {
    if (driverAssessmentSubmitting) return;
    if (state.auth?.role !== "driver") return;
    const did = state.auth?.driverId || driverId || "";
    if (!did) {
      setDriverAssessmentStatus("⚠️ ไม่พบรหัสคนขับ กรุณาออกเข้าใหม่");
      return;
    }
    if (needsDailyVehicleStart) {
      setDriverAssessmentStatus("⚠️ กรุณาบันทึกเริ่มใช้รถวันนี้ก่อนส่งแบบประเมิน");
      setTab("driver-vehicle");
      return;
    }
    const missing = DRIVER_DAILY_CHECK_ITEMS.filter(item => !driverDailyChecks[item.id]);
    if (missing.length) {
      setDriverAssessmentStatus(`⚠️ กรุณาตรวจเช็คประจำวันให้ครบก่อนบันทึก (${missing.length} รายการยังไม่ครบ)`);
      return;
    }
    const odometerStart = Number(digitsOnly(driverOdometerStart));
    if (!odometerStart || odometerStart <= 0) {
      setDriverAssessmentStatus("⚠️ กรุณาไปแถบ บันทึกการใช้รถ เพื่อกรอกเลขไมล์เริ่มต้นก่อนส่งแบบประเมิน");
      setTab("driver-vehicle");
      return;
    }
    if (!selectedDriverVehicle?.id) {
      setDriverAssessmentStatus("⚠️ กรุณาไปแถบ บันทึกการใช้รถ เพื่อเลือกรถที่ใช้วันนี้ก่อนส่งแบบประเมิน");
      setTab("driver-vehicle");
      return;
    }

    try {
      setDriverAssessmentSubmitting(true);
      setDriverAssessmentStatus("⏳ กำลังบันทึกแบบประเมินประจำวัน...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/driver-assessments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          assessmentType: "daily",
          driverId: did,
          phoneDigits: String(state.auth?.phone || "").replace(/\D/g, ""),
          vehicle: selectedDriverVehicle,
          vehicleChangedToday: driverVehicleChangedToday || !selectedDriverVehicleIsDefault,
          odometerStart,
          dailyChecks: driverDailyChecks,
          weeklyChecks: driverWeeklyChecks,
          notes: String(driverAssessmentNotes || "").trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setDriverAssessmentStatus("✅ บันทึกแบบประเมินประจำวันแล้ว พร้อมเริ่มงาน");
    } catch (error) {
      setDriverAssessmentStatus(`❌ บันทึกไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setDriverAssessmentSubmitting(false);
    }
  };

  const submitDriverWeeklyAssessment = async () => {
    if (driverAssessmentSubmitting) return;
    if (state.auth?.role !== "driver") return;
    const did = state.auth?.driverId || driverId || "";
    if (!did) {
      setDriverAssessmentStatus("⚠️ ไม่พบรหัสคนขับ กรุณาออกเข้าใหม่");
      return;
    }
    const missing = DRIVER_WEEKLY_CHECK_ITEMS.filter((_, index) => !driverWeeklyChecks[index]);
    if (missing.length) {
      setDriverAssessmentStatus(`⚠️ กรุณาตรวจเช็คประจำสัปดาห์ให้ครบก่อนบันทึก (${missing.length} รายการยังไม่ครบ)`);
      return;
    }

    try {
      setDriverAssessmentSubmitting(true);
      setDriverAssessmentStatus("⏳ กำลังบันทึกแบบประเมินประจำสัปดาห์...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/driver-assessments/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          assessmentType: "weekly",
          driverId: did,
          phoneDigits: String(state.auth?.phone || "").replace(/\D/g, ""),
          weeklyChecks: driverWeeklyChecks,
          notes: String(driverAssessmentNotes || "").trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setDriverAssessmentStatus("✅ บันทึกแบบประเมินประจำสัปดาห์แล้ว");
    } catch (error) {
      setDriverAssessmentStatus(`❌ บันทึกรายสัปดาห์ไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setDriverAssessmentSubmitting(false);
    }
  };

  const updatePreparationWorkflow = async (order, action, patch = {}) => {
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/orders/workflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderId: order.id, action, ...patch })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...json.data } : item) }));
      setSyncStatus(`✅ อัปเดตออเดอร์ ${order.id} แล้ว`);
    } catch (e) { setSyncStatus(`❌ อัปเดตไม่สำเร็จ: ${e?.message || e}`); }
  };

  const createStaffAccount = async () => {
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(staffAccountForm) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStaffAccountForm({ username: "", password: "", name: "", role: "store" });
      setSyncStatus(`✅ สร้างบัญชี ${json.data.username} สำเร็จ`);
    } catch (e) { setSyncStatus(`❌ สร้างบัญชีไม่สำเร็จ: ${e?.message || e}`); }
  };

  const setupDailyDeliverySheet = async () => {
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/admin/delivery-sheet/setup", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setSyncStatus(`✅ ตั้งค่า Google Sheet แล้ว: ${json?.data?.spreadsheetUrl || json?.spreadsheetUrl || ""}`);
      if (json?.data?.spreadsheetUrl || json?.spreadsheetUrl) window.open(json.data?.spreadsheetUrl || json.spreadsheetUrl, "_blank", "noopener");
    } catch (e) { setSyncStatus(`❌ ตั้งค่า Google Sheet ไม่สำเร็จ: ${e?.message || e}`); }
  };

  const submitDailyVehicleStart = async () => {
    if (dailyVehicleStartSubmitting) return;
    if (state.auth?.role !== "driver") return;
    const odometerStart = Number(digitsOnly(driverOdometerStart));
    if (!selectedDriverVehicle?.id) {
      setVehicleUsageStatus("⚠️ กรุณาเลือกรถที่ใช้วันนี้");
      return;
    }
    if (!odometerStart || odometerStart <= 0) {
      setVehicleUsageStatus("⚠️ กรุณากรอกเลขไมล์เริ่มต้นวันนี้");
      return;
    }

    try {
      setDailyVehicleStartSubmitting(true);
      setVehicleUsageStatus("⏳ กำลังบันทึกเริ่มใช้รถวันนี้...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/vehicle-usage/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          eventType: "start",
          driverId: state.auth?.driverId || driverId || "",
          driverName: state.auth?.name || selectedDriverProfile?.name || "",
          driverPhone: state.auth?.phone || "",
          vehicleId: selectedDriverVehicle.id,
          vehicle: selectedDriverVehicle,
          odometer: odometerStart,
          odometerStart,
          usageType: "เริ่มใช้รถวันนี้",
          detail: "บันทึกเริ่มต้นประจำวัน",
          note: ""
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      if (dailyVehicleStartKey && typeof window !== "undefined") {
        localStorage.setItem(dailyVehicleStartKey, JSON.stringify({
          serviceDate: todayServiceDate,
          vehicleId: selectedDriverVehicle.id,
          odometerStart,
          savedAt: new Date().toISOString()
        }));
      }
      if (latestDriverVehicleKey && typeof window !== "undefined") {
        localStorage.setItem(latestDriverVehicleKey, selectedDriverVehicle.id);
        setLatestDriverVehicleId(selectedDriverVehicle.id);
      }
      setDailyVehicleStartSaved(true);
      const autoClosed = json?.data?.autoClosed;
      setVehicleUsageStatus(autoClosed?.id
        ? "✅ บันทึกเริ่มใช้รถวันนี้แล้ว และปิดงานค้างของรถคันนี้ให้อัตโนมัติ"
        : "✅ บันทึกเริ่มใช้รถวันนี้แล้ว");
    } catch (error) {
      setVehicleUsageStatus(`❌ บันทึกเริ่มใช้รถไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setDailyVehicleStartSubmitting(false);
    }
  };

	  const updateCustomer = async (id, patch) => {
	    const existing = state.customers.find(c => c.id === id);
	    if (!existing) return;
	    const nextCustomer = { ...existing, ...patch, name: String(patch.name || existing.name || "").trim() };
	    if (!nextCustomer.name) {
	      setSyncStatus("⚠️ กรุณากรอกชื่อลูกค้า");
	      return;
	    }
	    setSyncStatus(`⏳ กำลังบันทึกข้อมูลลูกค้า "${nextCustomer.name}"...`);
	    const saved = await upsertCustomerToFirestore(nextCustomer);
	    if (!saved.ok) {
	      setSyncStatus(`⚠️ แก้ไขข้อมูลลูกค้าไม่สำเร็จ: ${saved.error}`);
	      return;
	    }
	    setState(prev => ({ ...prev, customers: prev.customers.map(c => c.id === id ? nextCustomer : c) }));
	    setEditingCustomerId(null);
	    setSyncStatus(`✅ แก้ไขข้อมูลลูกค้า "${nextCustomer.name}" สำเร็จ`);
	  };

	  const deleteCustomer = async (customer) => {
	    const id = String(customer?.id || "");
	    const name = String(customer?.name || "").trim() || id;
	    if (!id) return;
	    const confirmed = window.confirm(`ลบข้อมูลลูกค้า "${name}" ใช่ไหม?`);
	    if (!confirmed) return;
	    setSyncStatus(`⏳ กำลังลบลูกค้า "${name}"...`);
	    try {
	      const idToken = await refreshAuthToken(true);
	      const res = await fetch("/api/customers/delete", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ idToken, customerId: id })
	      });
	      const json = await res.json().catch(() => null);
	      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
	      setState(prev => {
	        const nextCustomers = (prev.customers || []).filter(c => c.id !== id);
	        return { ...prev, customers: nextCustomers };
	      });
	      if (selectedCustomerId === id) setSelectedCustomerId("");
	      if (editingCustomerId === id) setEditingCustomerId(null);
	      setSyncStatus(`✅ ลบลูกค้า "${name}" สำเร็จ`);
	    } catch (e) {
	      setSyncStatus(`⚠️ ลบลูกค้าไม่สำเร็จ: ${e?.message || e}`);
	    }
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
      setSyncStatus("✅ บันทึกรูป POD แล้ว (เก็บในเครื่อง) — พร้อมกดส่งสำเร็จ + แชร์สรุป LINE");
    } catch (error) {
      setSyncStatus(`❌ บันทึกรูป POD ไม่สำเร็จ: ${error.message || error}`);
    }
  };

  const createRouteTask = async () => {
    const did = state.auth?.driverId || driverId || "";
    if (!did) {
      setSyncStatus("⚠️ ไม่พบรหัสคนขับ กรุณาออกเข้าใหม่");
      return;
    }
    const driver = drivers.find(d => d.id === did) || {};
    const type = routeTaskForm.type === "long" ? "long" : "branch";
    const longDirection = routeTaskForm.longDirection === "return" ? "return" : "outbound";
    const selectedDestinations = type === "long"
      ? (longDirection === "return" ? (routeTaskForm.longReturnDestinations || []).filter(Boolean) : (routeTaskForm.longDestinations || []).filter(Boolean))
      : [routeTaskForm.branchDestination].filter(Boolean);
    const destinations = Array.from(new Set(selectedDestinations));
    if (!routeTaskForm.origin || destinations.length === 0) {
      setSyncStatus("⚠️ กรุณาเลือกต้นทางและปลายทางงานวิ่ง");
      return;
    }
    const now = new Date();
    const id = `RT-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const stops = destinations.map((name, index) => ({
      id: `dest-${index + 1}`,
      name,
      kind: "destination",
      status: "รอเช็คอิน",
      checkedInAt: "",
      note: "",
      photo: "",
      sharedToLine: false
    }));
    const task = {
      id,
      type,
      routeDirection: type === "long" ? longDirection : "",
      origin: routeTaskForm.origin,
      destinationSummary: destinations.join(" + "),
      driverId: did,
      driverName: state.auth?.name || driver.name || "",
      driverPhone: driver.phone || state.auth?.phone || "",
      status: "กำลังวิ่ง",
      note: String(routeTaskForm.note || "").trim(),
      stops,
      originStartedAt: now.toLocaleString("th-TH"),
      startedAt: now.toISOString(),
      serviceDate: toServiceDateKey(now)
    };
    setState(prev => ({ ...prev, routeTasks: [task, ...(prev.routeTasks || [])] }));
    const saved = await upsertRouteTaskToFirestore(task);
    setSyncStatus(saved.ok ? `✅ เริ่ม${type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"} ${task.destinationSummary}` : `⚠️ บันทึกงานวิ่งไม่สำเร็จ: ${saved.error}`);
  };

  const updateRouteTask = (id, patch) => {
    setState(prev => {
      const updatedTasks = (prev.routeTasks || []).map(task => task.id === id ? { ...task, ...patch } : task);
      const task = updatedTasks.find(item => item.id === id);
      if (task) {
        (async () => {
          const saved = await upsertRouteTaskToFirestore(task);
          if (!saved.ok) console.error(`Failed to sync route task ${id}:`, saved.error);
        })();
      }
      return { ...prev, routeTasks: updatedTasks };
    });
  };

  const uploadRouteTaskPhoto = (task, stopId, file) => {
    if (!file) return;
    const key = routeTaskStopKey(task.id, stopId);
    routeTaskFilesRef.current[key] = file;
    const previewUrl = URL.createObjectURL(file);
    const stops = (task.stops || []).map(stop => stop.id === stopId ? { ...stop, photo: previewUrl, sharedToLine: false } : stop);
    updateRouteTask(task.id, { stops });
    setSyncStatus("✅ บันทึกรูปเช็คอินงานวิ่งแล้ว พร้อมแชร์ LINE");
  };

  const addRouteTaskMidwayCheckIn = (task) => {
    const note = prompt("หมายเหตุเช็คอินระหว่างทาง:", "");
    if (note === null) return;
    const stop = {
      id: `mid-${Date.now()}`,
      name: "เช็คอินระหว่างทาง",
      kind: "midway",
      status: "เช็คอินแล้ว",
      checkedInAt: new Date().toLocaleString("th-TH"),
      note: String(note || "").trim(),
      photo: "",
      sharedToLine: false
    };
    const stops = [...(task.stops || []), stop];
    updateRouteTask(task.id, { stops, status: "เช็คอินแล้ว" });
    recordRouteTaskCheckInLocation(task, stop);
    setSyncStatus(`✅ เพิ่มเช็คอินระหว่างทาง ${task.id}`);
  };

  const checkInRouteTaskStop = (task, stopId) => {
    const note = prompt("หมายเหตุจุดเช็คอิน (ถ้ามี):", "");
    if (note === null) return;
    let checkedStop = null;
    const stops = (task.stops || []).map(stop => {
      if (stop.id !== stopId) return stop;
      checkedStop = {
        ...stop,
        status: "เช็คอินแล้ว",
        checkedInAt: new Date().toLocaleString("th-TH"),
        note: String(note || "").trim(),
        sharedToLine: false
      };
      return checkedStop;
    });
    updateRouteTask(task.id, { stops, status: "เช็คอินแล้ว" });
    if (checkedStop) recordRouteTaskCheckInLocation(task, checkedStop);
    setSyncStatus(`✅ เช็คอิน ${checkedStop?.name || ""} แล้ว กรุณาถ่ายรูปและแชร์ LINE`);
  };

  const shareRouteTaskStopToLine = (task, stop) => {
    if (!navigator?.share) {
      alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์ กรุณาเปิดผ่านมือถือ");
      return;
    }
    (async () => {
      try {
        const nextStop = {
          ...stop,
          status: "เช็คอินแล้ว",
          checkedInAt: stop.checkedInAt || new Date().toLocaleString("th-TH"),
          sharedToLine: true
        };
        const stops = (task.stops || []).map(item => item.id === stop.id ? nextStop : item);
        updateRouteTask(task.id, { stops, status: "เช็คอินแล้ว" });
        const text = buildLineMessageForRouteTask(task, nextStop);
        const file = routeTaskFilesRef.current?.[routeTaskStopKey(task.id, stop.id)];
        let copied = false;
        try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
        if (!copied) {
          const ok = confirm(`ไม่สามารถคัดลอกอัตโนมัติได้\n\nกรุณาก็อปข้อความนี้ไว้ก่อน แล้วกด OK เพื่อเปิดแชร์:\n\n${text}`);
          if (!ok) return;
        }
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text });
        } else {
          await navigator.share({ text });
        }
        setSyncStatus(`✅ แชร์ LINE งานวิ่ง ${task.id} แล้ว`);
      } catch (error) {
        setSyncStatus(`✅ บันทึกเช็คอินแล้ว หากแชร์ LINE ไม่ขึ้น ให้เปิด LINE แล้ววางข้อความที่คัดลอกไว้ (${task.id})`);
      }
    })();
  };

  const completeRouteTask = (task) => {
    const destinationStops = (task.stops || []).filter(stop => stop.kind !== "midway");
    const missing = destinationStops.filter(stop => !stop.checkedInAt || !stop.sharedToLine);
    if (missing.length && !confirm(`ยังมีปลายทางที่ยังไม่แชร์ LINE ครบ (${missing.length} จุด) ต้องการจบงานเลยหรือไม่?`)) return;
    updateRouteTask(task.id, { status: "เสร็จงาน", completedAt: new Date().toLocaleString("th-TH") });
    setSyncStatus(`✅ จบงานวิ่ง ${task.id} แล้ว`);
  };

  const submitFuelBill = async () => {
    if (fuelBillSubmitting) return;
    if (state.auth?.role !== "driver") return;
    if (!selectedDriverVehicle?.id) {
      setFuelBillStatus("⚠️ กรุณาเลือกรถก่อนบันทึกบิลน้ำมัน");
      return;
    }
    const odometer = Number(digitsOnly(fuelBillForm.odometer));
    const liters = Number(String(fuelBillForm.liters || "").replace(/,/g, ""));
    const amount = Number(String(fuelBillForm.amount || "").replace(/,/g, ""));
    const typedPrice = Number(String(fuelBillForm.pricePerLiter || "").replace(/,/g, ""));
    if (!odometer || odometer <= 0) {
      setFuelBillStatus("⚠️ กรุณากรอกเลขไมล์ตอนเติมน้ำมัน");
      return;
    }
    if (!amount || amount <= 0) {
      setFuelBillStatus("⚠️ กรุณากรอกยอดเงินบิลน้ำมัน");
      return;
    }
    if (!liters || liters <= 0) {
      setFuelBillStatus("⚠️ กรุณากรอกจำนวนลิตรให้มากกว่า 0");
      return;
    }
    const pricePerLiter = typedPrice || (liters > 0 ? Number((amount / liters).toFixed(2)) : 0);

    try {
      setFuelBillSubmitting(true);
      setFuelBillStatus("⏳ กำลังบันทึกบิลน้ำมัน...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/fuel-bills/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          driverId: state.auth?.driverId || driverId || "",
          phoneDigits: String(state.auth?.phone || "").replace(/\D/g, ""),
          vehicle: selectedDriverVehicle,
          odometer,
          fuelType: String(fuelBillForm.fuelType || "").trim(),
          liters,
          amount,
          pricePerLiter,
          station: String(fuelBillForm.station || "").trim(),
          receiptNo: String(fuelBillForm.receiptNo || "").trim(),
          note: String(fuelBillForm.note || "").trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setFuelBillStatus("✅ บันทึกบิลน้ำมันแล้ว");
      setFuelBillForm({
        odometer: "",
        fuelType: fuelBillForm.fuelType || "ดีเซล",
        liters: "",
        amount: "",
        pricePerLiter: "",
        station: "",
        receiptNo: "",
        note: ""
      });
    } catch (error) {
      setFuelBillStatus(`❌ บันทึกบิลน้ำมันไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setFuelBillSubmitting(false);
    }
  };

  const submitVehicleUsageEvent = async (eventType = "segment") => {
    if (vehicleUsageSubmitting) return;
    if (state.auth?.role !== "driver") return;
    if (!selectedDriverVehicle?.id) {
      setVehicleUsageStatus("⚠️ กรุณาเลือกรถที่ใช้ก่อนบันทึก");
      return;
    }
    const source = eventType === "end" ? vehicleEndForm : vehicleUsageForm;
    const odometer = Number(digitsOnly(source.odometer));
    if (!odometer || odometer <= 0) {
      setVehicleUsageStatus("⚠️ กรุณากรอกเลขไมล์ให้ถูกต้อง");
      return;
    }
    const startOdometer = Number(digitsOnly(driverOdometerStart));
    if (eventType === "end" && startOdometer && odometer < startOdometer) {
      setVehicleUsageStatus("⚠️ เลขไมล์สิ้นสุดต้องไม่น้อยกว่าเลขไมล์เริ่มต้น");
      return;
    }

    try {
      setVehicleUsageSubmitting(true);
      setVehicleUsageStatus(eventType === "end" ? "⏳ กำลังบันทึกจบการใช้รถ..." : "⏳ กำลังบันทึกเลขไมล์ระหว่างวัน...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/vehicle-usage/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          eventType,
          driverId: state.auth?.driverId || driverId || "",
          driverName: state.auth?.name || selectedDriverProfile?.name || "",
          driverPhone: state.auth?.phone || "",
          vehicleId: selectedDriverVehicle.id,
          vehicle: selectedDriverVehicle,
          odometer,
          odometerStart: startOdometer || 0,
          usageType: eventType === "end" ? "จบการใช้รถวันนี้" : String(vehicleUsageForm.usageType || "").trim(),
          detail: eventType === "end" ? String(vehicleEndForm.summary || "").trim() : String(vehicleUsageForm.detail || "").trim(),
          note: String(source.note || "").trim()
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      if (latestDriverVehicleKey && typeof window !== "undefined") {
        localStorage.setItem(latestDriverVehicleKey, selectedDriverVehicle.id);
        setLatestDriverVehicleId(selectedDriverVehicle.id);
      }
      setVehicleUsageStatus(eventType === "end" ? "✅ บันทึกจบการใช้รถวันนี้แล้ว" : "✅ บันทึกเลขไมล์ระหว่างวันแล้ว");
      if (eventType === "end") {
        setVehicleEndForm({ odometer: "", summary: "", note: "" });
      } else {
        setVehicleUsageForm({ odometer: "", usageType: vehicleUsageForm.usageType || "ส่งของ", detail: "", note: "" });
      }
    } catch (error) {
      setVehicleUsageStatus(`❌ บันทึกการใช้รถไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setVehicleUsageSubmitting(false);
    }
  };

  const sharePendingOrderQueueToLine = (order) => {
    const text = buildLineMessageForNewOrder(order);

    (async () => {
      let copied = false;
      try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}

      if (navigator?.share) {
        try {
          if (!copied) {
            const ok = confirm(`ไม่สามารถคัดลอกอัตโนมัติได้\n\nกรุณาก็อปข้อความนี้ไว้ก่อน แล้วกด OK เพื่อเปิดแชร์:\n\n${text}`);
            if (!ok) return;
          }
          await navigator.share({ text });
          setSyncStatus(`✅ คัดลอกและเปิดแชร์ LINE สำหรับออเดอร์ "${order.id}" แล้ว`);
          return;
        } catch {}
      }

      setSyncStatus(copied
        ? `✅ คัดลอกข้อความคิวงานของออเดอร์ "${order.id}" แล้ว นำไปวางในกลุ่ม LINE ได้เลย`
        : `⚠️ คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกข้อความนี้เอง:\n${text}`);
    })();
  };

	  const shareOrderToLine = (order) => {
	    if (!navigator?.share) {
	      alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์ กรุณาเปิดผ่านมือถือ");
	      return;
	    }

	    (async () => {
	      let completedOrder = null;
	      try {
          const note = prompt("หมายเหตุจากคนขับ (ถ้ามี):", order.driverNote || "");
          if (note === null) return;
          const deliveredAt = order.deliveredAt || new Date().toLocaleString("th-TH");
          completedOrder = {
            ...order,
            status: "ส่งสำเร็จ",
            deliveredAt,
            driverNote: String(note || "").trim(),
            driverName: order.driverName || state.auth?.name || "",
            driverId: order.driverId || state.auth?.driverId || driverId || "",
            sharedToLine: false
          };
	        const text = buildLineMessageForOrder(completedOrder);
	        const file = podFilesRef.current?.[order.id];

	        // Copy summary text, then immediately open share sheet (single flow)
	        let copied = false;
	        try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
	        if (!copied) {
	          const ok = confirm(`ไม่สามารถคัดลอกอัตโนมัติได้\n\nกรุณาก็อปข้อความนี้ไว้ก่อน แล้วกด OK เพื่อเปิดแชร์:\n\n${text}`);
	          if (!ok) return;
	        }

	        if (file && navigator.canShare?.({ files: [file] })) {
	          // LINE may ignore text when a file is attached, so the text is copied above.
	          await navigator.share({ files: [file], text });
	        } else {
	          await navigator.share({ text });
	        }
	        updateOrder(order.id, { ...completedOrder, sharedToLine: true });
	        if (copied) {
	          setSyncStatus(`✅ ส่งสำเร็จและคัดลอกสรุปสั้นสำหรับ LINE แล้ว (${order.id})`);
	        }
	      } catch (error) {
	        if (completedOrder) updateOrder(order.id, completedOrder);
	        setSyncStatus(`✅ บันทึกส่งสำเร็จแล้ว หากแชร์ LINE ไม่ขึ้น ให้เปิด LINE แล้ววางข้อความที่คัดลอกไว้ (${order.id})`);
	      }
	    })();
	  };

	  const acceptOrder = async (id) => {
	    // Check if driver is logged in
	    if (!driverId) {
      setSyncStatus("⚠️ คนขับยังไม่ได้เลือก กรุณาตั้งค่าประจำตัวให้ถูกต้อง");
      return;
    }

    const driverName = state.auth?.name || "";
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
    updateOrder(id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH"), driverName: order.driverName || state.auth?.name || "", driverId: order.driverId || state.auth?.driverId || driverId || "" });
    
    // Show order summary alert
    const summaryText = `✅ ส่งสำเร็จ!\n\n📦 ออเดอร์: ${order.customerName}\n📍 ${order.zone}\n💰 COD: ฿${money(order.cod || 0)}\n📸 POD: ${order.photo ? "✅ มี" : "❌ ไม่มี"}\n\nออเดอร์ถูกลงทะเบียนในระบบแล้ว`;
    alert(summaryText);
  };


  const generateDailyReport = () => {
    const today = new Date().toLocaleDateString("th-TH");
    const todayOrders = todayOrdersOnly;
    const driverStats = {};
    let totalCOD = 0;

    todayOrders.forEach(order => {
      totalCOD += Number(order.cod || 0);
      if (order.driverId) {
        if (!driverStats[order.driverId]) {
          const driver = (state.drivers || []).find(d => d.id === order.driverId);
          driverStats[order.driverId] = {
            name: order.driverName || driver?.name || "ไม่ทราบ",
            plate: driver?.plate || "-",
            zone: driver?.zone || "-",
            phone: driver?.phone || "-",
            total: 0,
            completed: 0,
            active: 0,
            failed: 0,
            cod: 0,
            checkins: [],
            customerSet: new Set(),
            orders: []
          };
        }
        driverStats[order.driverId].total += 1;
        driverStats[order.driverId].cod += Number(order.cod || 0);
        driverStats[order.driverId][order.status === "ส่งสำเร็จ" ? "completed" : order.status === "กำลังส่ง" ? "active" : "failed"] += 1;
        driverStats[order.driverId].customerSet.add(order.customerId || order.customerName || order.id);
        driverStats[order.driverId].orders.push({
          id: order.id,
          customer: order.customerName,
          zone: order.zone,
          status: order.status,
          cod: Number(order.cod || 0)
        });
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
      report += `  🏪 จำนวนร้าน: ${stats.customerSet.size} ร้าน\n`;
      report += `     ✅ สำเร็จ: ${stats.completed} งาน\n`;
      report += `     🟡 กำลังส่ง: ${stats.active} งาน\n`;
      report += `     ❌ ไม่สำเร็จ: ${stats.failed} งาน\n`;
      report += `  💰 COD รวม: ${money(stats.cod)} บาท\n`;
      report += `  ⏱️ ประสิทธิภาพ: ${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(0) : 0}%\n`;

      if (stats.orders.length) {
        report += `  📄 รายการออเดอร์:\n`;
        stats.orders.slice(0, 20).forEach((o) => {
          report += `     • ${o.id} (${o.status}) - ${o.customer} · ${o.zone} · COD ฿${money(o.cod)}\n`;
        });
        if (stats.orders.length > 20) report += `     ... และอีก ${stats.orders.length - 20} งาน\n`;
      }
      
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
    jobs: todayOrdersOnly.length,
    waiting: todayOrdersOnly.filter(order => order.status === "รอคนขับรับ").length,
    active: todayOrdersOnly.filter(order => order.status === "กำลังส่ง" || order.status === "กำลังจัดส่ง").length,
    done: todayOrdersOnly.filter(order => order.status === "ส่งสำเร็จ").length
  };

  const summarizeOrders = (list = []) => {
    const total = list.length;
    const waiting = list.filter(order => order.status === "รอคนขับรับ").length;
    const active = list.filter(order => order.status === "กำลังส่ง" || order.status === "กำลังจัดส่ง").length;
    const done = list.filter(order => order.status === "ส่งสำเร็จ").length;
    const issues = list.filter(order => order.status === "ติดปัญหา" || order.complaint).length;
    const cod = list.reduce((sum, order) => sum + Number(order.cod || 0), 0);
    const codDone = list.filter(order => order.status === "ส่งสำเร็จ").reduce((sum, order) => sum + Number(order.cod || 0), 0);
    const completionRate = total ? Math.round((done / total) * 100) : 0;
    return { total, waiting, active, done, issues, cod, codDone, completionRate };
  };

  const ordersByServiceDate = useMemo(() => {
    const groups = {};
    (state.orders || []).forEach((o) => {
      const k = getOrderServiceDate(o);
      if (!k) return;
      groups[k] = groups[k] || [];
      groups[k].push(o);
    });
    const keys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)); // desc
    return { keys, groups };
  }, [state.orders]);

  const todaySummary = useMemo(() => summarizeOrders(todayOrdersOnly), [todayOrdersOnly]);
  const currentMonthKey = todayServiceDate.slice(0, 7);
  const monthAnalytics = useMemo(() => {
    const monthKeys = ordersByServiceDate.keys.filter((key) => key.startsWith(currentMonthKey));
    const days = monthKeys.map((key) => {
      const list = ordersByServiceDate.groups[key] || [];
      return { key, ...summarizeOrders(list) };
    });
    const monthOrders = days.flatMap((day) => ordersByServiceDate.groups[day.key] || []);
    const summary = summarizeOrders(monthOrders);
    const maxDailyTotal = Math.max(1, ...days.map((day) => day.total));
    const avgDailyOrders = days.length ? Math.round(summary.total / days.length) : 0;
    return { days, summary, maxDailyTotal, avgDailyOrders };
  }, [ordersByServiceDate, currentMonthKey]);

  const getOrderDriverName = (order) => {
    const driver = drivers.find(d => d.id === order.driverId);
    return order.driverName || driver?.name || order.driverId || "ยังไม่ระบุคนขับ";
  };

  const appendDriverOrderSummary = (lines, list) => {
    const groups = {};
    (list || []).forEach((order) => {
      const name = getOrderDriverName(order);
      groups[name] = groups[name] || [];
      groups[name].push(order);
    });
    lines.push("", "สรุปตามคนส่ง:");
    Object.entries(groups).forEach(([driverName, driverOrders], index) => {
      const doneCount = driverOrders.filter(order => order.status === "ส่งสำเร็จ").length;
      const cod = driverOrders.reduce((sum, order) => sum + Number(order.cod || 0), 0);
      lines.push(`${index + 1}. ${driverName} | ${driverOrders.length} งาน | สำเร็จ ${doneCount} | COD ฿${money(cod)}`);
      driverOrders.forEach((order) => {
        const deliveredAt = order.deliveredAt ? ` | เสร็จ ${order.deliveredAt}` : "";
        lines.push(`   - ${order.id} | ${order.customerName || "-"} | ${order.zone || "-"} | ${order.status || "-"} | COD ฿${money(order.cod || 0)}${deliveredAt}`);
      });
    });
    if (!Object.keys(groups).length) lines.push("-");
  };

  const buildServiceDateReport = (key) => {
    const list = ordersByServiceDate.groups[key] || [];
    const stats = summarizeOrders(list);
    const dt = parseServiceDateKey(key);
    const title = dt ? dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) : key;
    const lines = [
      `รายงาน Hillkoff Delivery`,
      `วันที่: ${title}`,
      `สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`,
      "",
      `สรุป: ${stats.total} งาน | รอรับ ${stats.waiting} | กำลังส่ง ${stats.active} | สำเร็จ ${stats.done} | ปัญหา ${stats.issues}`,
      `COD รวม: ฿${money(stats.cod)}`,
      `COD สำเร็จ: ฿${money(stats.codDone)}`,
      `อัตราสำเร็จ: ${stats.completionRate}%`,
      "",
      "รายการออเดอร์:"
    ];
    list.forEach((order, index) => {
      lines.push(`${index + 1}. ${order.id} | ${order.customerName || "-"} | ${order.zone || "-"} | ${order.status || "-"} | คนส่ง ${getOrderDriverName(order)} | COD ฿${money(order.cod || 0)}`);
    });
    appendDriverOrderSummary(lines, list);
    return lines.join("\n");
  };

  const buildDriverDailyWorkReport = () => {
    const dt = parseServiceDateKey(todayServiceDate);
    const title = dt ? dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) : todayServiceDate;
    const driver = drivers.find(d => d.id === driverId) || {};
    const driverName = state.auth?.name || driver.name || driverId || "-";
    const normalActive = driverTodayOrders.filter(order => order.status === "กำลังส่ง" || order.status === "กำลังจัดส่ง").length;
    const routeActive = driverTodayRouteTasks.filter(task => task.status !== "เสร็จงาน" && task.status !== "ยกเลิก").length;
    const lines = [
      "รายงานการทำงานประจำวัน",
      `วันที่: ${title}`,
      `คนขับ: ${driverName}`,
      `สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`,
      "",
      `สรุป: ออเดอร์ปกติ ${driverTodayOrders.length} งาน | ส่งสำเร็จ ${driverTodayCompletedOrders.length} | กำลังทำ ${normalActive}`,
      `งานวิ่งสาขา/วิ่งไกล ${driverTodayRouteTasks.length} งาน | เสร็จงาน ${driverTodayCompletedRouteTasks.length} | กำลังทำ ${routeActive}`,
      `COD รวม: ฿${money(driverTodayWorkSummary.cod)} | COD ส่งสำเร็จ: ฿${money(driverTodayWorkSummary.codDone)}`,
      "",
      "ออเดอร์ปกติ:"
    ];

    if (driverTodayOrders.length) {
      driverTodayOrders.forEach((order, index) => {
        const deliveredAt = order.deliveredAt ? ` | เสร็จ ${order.deliveredAt}` : "";
        lines.push(`${index + 1}. ${order.id} | ${order.customerName || "-"} | ${order.zone || "-"} | ${order.status || "-"} | COD ฿${money(order.cod || 0)}${deliveredAt}`);
      });
    } else {
      lines.push("-");
    }

    lines.push("", "งานวิ่งสาขา/วิ่งไกล:");
    if (driverTodayRouteTasks.length) {
      driverTodayRouteTasks.forEach((task, index) => {
        const type = task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา";
        const direction = task.type === "long" ? (task.routeDirection === "return" ? " ขากลับเชียงใหม่" : " ขาไป") : "";
        const completedAt = task.completedAt ? ` | จบงาน ${task.completedAt}` : "";
        lines.push(`${index + 1}. ${task.id} | ${type}${direction} | ${task.origin || "-"} -> ${task.destinationSummary || "-"} | ${task.status || "-"}${completedAt}`);
        (task.stops || []).forEach((stop, stopIndex) => {
          const checked = stop.checkedInAt ? ` | เช็คอิน ${stop.checkedInAt}` : "";
          const shared = stop.sharedToLine ? " | แชร์ LINE แล้ว" : "";
          const note = stop.note ? ` | ${stop.note}` : "";
          lines.push(`   ${stopIndex + 1}) ${stop.kind === "midway" ? "ระหว่างทาง" : stop.name || "-"}${checked}${shared}${note}`);
        });
      });
    } else {
      lines.push("-");
    }

    lines.push("", "ประวัติส่งสำเร็จวันนี้:");
    if (driverTodayCompletedOrders.length || driverTodayCompletedRouteTasks.length) {
      driverTodayCompletedOrders.forEach((order, index) => {
        lines.push(`${index + 1}. ออเดอร์ ${order.id} | ${order.customerName || "-"} | ${order.deliveredAt || "-"}`);
      });
      driverTodayCompletedRouteTasks.forEach((task, index) => {
        const type = task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา";
        lines.push(`${driverTodayCompletedOrders.length + index + 1}. ${type} ${task.id} | ${task.destinationSummary || "-"} | ${task.completedAt || "-"}`);
      });
    } else {
      lines.push("-");
    }

    return lines.join("\n");
  };

  const buildServiceDateRangeReport = (startKey, endKey) => {
    const start = startKey && endKey && startKey > endKey ? endKey : startKey;
    const end = startKey && endKey && startKey > endKey ? startKey : endKey;
    const keys = ordersByServiceDate.keys
      .filter((key) => (!start || key >= start) && (!end || key <= end))
      .slice()
      .sort((a, b) => (a < b ? -1 : 1));
    const list = keys.flatMap((key) => ordersByServiceDate.groups[key] || []);
    const stats = summarizeOrders(list);
    const startTitle = parseServiceDateKey(start)?.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) || start || "-";
    const endTitle = parseServiceDateKey(end)?.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) || end || "-";
    const lines = [
      `รายงาน Hillkoff Delivery`,
      `ช่วงวันที่: ${startTitle} - ${endTitle}`,
      `สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`,
      "",
      `สรุป: ${stats.total} งาน | รอรับ ${stats.waiting} | กำลังส่ง ${stats.active} | สำเร็จ ${stats.done} | ปัญหา ${stats.issues}`,
      `COD รวม: ฿${money(stats.cod)}`,
      `COD สำเร็จ: ฿${money(stats.codDone)}`,
      `อัตราสำเร็จ: ${stats.completionRate}%`,
      ""
    ];
    keys.forEach((key) => {
      const dayList = ordersByServiceDate.groups[key] || [];
      const dayStats = summarizeOrders(dayList);
      const dt = parseServiceDateKey(key);
      const title = dt ? dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) : key;
      lines.push(`วันที่ ${title}: ${dayStats.total} งาน | สำเร็จ ${dayStats.done} | COD ฿${money(dayStats.cod)}`);
      dayList.forEach((order, index) => {
        lines.push(`  ${index + 1}. ${order.id} | ${order.customerName || "-"} | ${order.zone || "-"} | ${order.status || "-"} | คนส่ง ${getOrderDriverName(order)} | COD ฿${money(order.cod || 0)}`);
      });
      lines.push("");
    });
    appendDriverOrderSummary(lines, list);
    if (!keys.length) lines.push("ไม่มีข้อมูลในช่วงวันที่ที่เลือก");
    return lines.join("\n");
  };

  const exportServiceDateReport = (key, mode = "copy") => {
    const reportText = buildServiceDateReport(key);
    const fileName = `Hillkoff-Report-${key || "daily"}.txt`;
    if (mode === "download") {
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(reportText));
      element.setAttribute("download", fileName);
      element.click();
      return;
    }
    copyToClipboard(reportText);
  };

  const buildDriverAssessmentReport = () => {
    const completed = driverAssessmentRoster.filter(driver => todayAssessmentByDriver.has(driver.id));
    const missing = driverAssessmentRoster.filter(driver => !todayAssessmentByDriver.has(driver.id));
    const lines = [
      "รายงานแบบประเมินตรวจรถประจำวัน",
      `วันที่: ${todayServiceDate}`,
      `สร้างเมื่อ: ${new Date().toLocaleString("th-TH")}`,
      "",
      `สรุป: ทำแล้ว ${completed.length}/${driverAssessmentRoster.length} คน | ยังไม่ทำ ${missing.length} คน`,
      "",
      "ทำแบบประเมินแล้ว:"
    ];
    completed.forEach((driver, index) => {
      const assessment = todayAssessmentByDriver.get(driver.id) || {};
      const notes = assessment.notes ? ` | หมายเหตุ: ${assessment.notes}` : "";
      const vehicle = assessment.plate ? ` | รถ: ${assessment.plate} ${assessment.brand || ""} ${assessment.model || ""}` : "";
      const odometer = assessment.odometerStart ? ` | เลขไมล์: ${money(assessment.odometerStart)}` : " | เลขไมล์: -";
      lines.push(`${index + 1}. ${driver.name || driver.id}${driver.phone ? ` (${driver.phone})` : ""}${vehicle}${odometer}${notes}`);
    });
    if (!completed.length) lines.push("-");
    lines.push("", "ยังไม่ได้ทำ:");
    missing.forEach((driver, index) => {
      lines.push(`${index + 1}. ${driver.name || driver.id}${driver.phone ? ` (${driver.phone})` : ""}`);
    });
    if (!missing.length) lines.push("-");
    return lines.join("\n");
  };

  const exportDriverAssessmentReport = (mode = "copy") => {
    const reportText = buildDriverAssessmentReport();
    if (mode === "download") {
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(reportText));
      element.setAttribute("download", `Hillkoff-Driver-Inspection-${todayServiceDate}.txt`);
      element.click();
      return;
    }
    copyToClipboard(reportText);
  };

  const exportSelectedServiceReport = (mode = "download") => {
    const isRange = reportExportMode === "range";
    const reportText = isRange
      ? buildServiceDateRangeReport(reportExportStartDate, reportExportEndDate)
      : buildServiceDateReport(reportExportDate);
    const fileName = isRange
      ? `Hillkoff-Report-${reportExportStartDate || "start"}-to-${reportExportEndDate || "end"}.txt`
      : `Hillkoff-Report-${reportExportDate || "daily"}.txt`;
    if (mode === "download") {
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(reportText));
      element.setAttribute("download", fileName);
      element.click();
      return;
    }
    copyToClipboard(reportText);
  };

  useEffect(() => {
    if (openReportDate) return;
    const first = ordersByServiceDate.keys[0] || "";
    if (first) setOpenReportDate(first);
  }, [openReportDate, ordersByServiceDate.keys]);

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
              <div className="panel-head"><h1>เข้าสู่ระบบ</h1><span>Google + OTP</span></div>
              <div className="segmented">
                <button className={loginForm.role === "sales" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "sales" }))}>ฝ่ายขาย</button>
                <button className={loginForm.role === "driver" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "driver" }))}>คนขับ</button>
                <button className={["store", "pack"].includes(loginForm.role) ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "store" }))}>สโตร์/ห้องแพ็ค</button>
              </div>
              {["store", "pack"].includes(loginForm.role) ? (
                <>
                  <input value={loginForm.username} onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))} placeholder="Username" autoComplete="username" />
                  <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="Password" autoComplete="current-password" />
                  <button className="primary wide" onClick={loginStaff}>เข้าสู่ระบบสโตร์/ห้องแพ็ค</button>
                  <p className="login-note">บัญชีและแผนกกำหนดโดย Admin เท่านั้น</p>
                </>
              ) : (
              <>
              {loginForm.role === "sales" && <input value={loginForm.name} onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อผู้ใช้งานฝ่ายขาย" />}
              <input value={loginForm.phone} onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" />
              {googleOtpStage === "otp" ? (
                <>
                  <input value={googleOtpCode} onChange={e => setGoogleOtpCode(e.target.value)} placeholder="OTP 6 หลัก" inputMode="numeric" />
                  {googleOtpDevCode && (
                    <p className="login-note">รหัสทดสอบเครื่องนี้: <b>{googleOtpDevCode}</b></p>
                  )}
                  <button className="primary wide" onClick={verifyGoogleOtpLogin}>ยืนยัน OTP และเข้าใช้งาน</button>
                  <button className="secondary wide" onClick={startGoogleOtpLogin}>ขอ OTP ใหม่</button>
                </>
              ) : (
                <button className="primary wide" onClick={startGoogleOtpLogin}>
                  เข้าใช้งานด้วย Google + OTP
                </button>
              )}
              <p className="login-note">ฝ่ายขายต้องใช้ Google อีเมล @hillkoff.com ส่วนคนขับใช้ Google ส่วนตัวได้และต้องผูกเบอร์กับโปรไฟล์</p>
              <input value={loginForm.pin} onChange={e => setLoginForm(p => ({ ...p, pin: e.target.value }))} placeholder={loginStage === "set_pin" ? "ตั้ง PIN (อย่างน้อย 4 ตัว)" : "PIN"} inputMode="numeric" />
              {loginStage === "set_pin" && (
                <input value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="ยืนยัน PIN" inputMode="numeric" />
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)} />
                จดจำเบอร์โทรในครั้งต่อไป
              </label>
              <button className="primary wide" onClick={loginForm.role === "sales" ? loginSales : loginDriver}>
                {loginStage === "set_pin" ? "ตั้ง PIN สำรองและเข้าใช้งาน" : (loginForm.role === "sales" ? "เข้าใช้งานฝ่ายขายด้วย PIN สำรอง" : "เข้าใช้งานคนขับด้วย PIN สำรอง")}
              </button>
              <p className="login-note">PIN สำรองยังใช้ Firebase Auth แบบ Anonymous เพื่อผ่าน Firestore Rules ระหว่างย้ายระบบ</p>
              </>
              )}
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

  // (displayTab is defined near the top for subscription logic)

  return (
    <>
      <main>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/delivery-logo.svg" alt="Hillkoff Delivery" />
          <div><strong>Hillkoff</strong><span>Delivery System</span></div>
        </div>
        <nav>
          {["sales", "admin"].includes(auth.role) && (
            <>
              <button className={displayTab === "sales" ? "active" : ""} onClick={() => setTab("sales")}><Store size={18} /> แดชบอร์ดการขาย</button>
              <button className={displayTab === "dispatch" ? "active" : ""} onClick={() => setTab("dispatch")}><Users size={18} /> แดชบอร์ดการจัดส่ง</button>
              <button className={displayTab === "chiangmai" ? "active" : ""} onClick={() => setTab("chiangmai")}><PackagePlus size={18} /> เตรียมออเดอร์เชียงใหม่</button>
              <button className={displayTab === "driver-sop-report" ? "active" : ""} onClick={() => setTab("driver-sop-report")}><ClipboardList size={18} /> รายงานตรวจรถ</button>
            </>
          )}
          {auth.role === "driver" && (
            <>
              <button className={displayTab === "driver" ? "active" : ""} onClick={() => setTab("driver")}><Truck size={18} /> Driver App</button>
              <button className={displayTab === "driver-prep" ? "active" : ""} onClick={() => setTab("driver-prep")}><PackagePlus size={18} /> เช็คออเดอร์เชียงใหม่</button>
              <button className={displayTab === "driver-vehicle" ? "active" : ""} onClick={() => setTab("driver-vehicle")}><FileSpreadsheet size={18} /> บันทึกการใช้รถ</button>
              <button className={displayTab === "driver-sop" ? "active" : ""} onClick={() => setTab("driver-sop")}><ClipboardList size={18} /> ตรวจรถประจำวัน</button>
            </>
          )}
           {["sales", "admin"].includes(auth.role) && (
             <>
               <button className={displayTab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><ClipboardList size={18} /> รายงานประจำวัน</button>
               <button className={displayTab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={18} /> การตั้งค่า</button>
               {["sales", "admin"].includes(auth.role) && (
                 <button className={aiOpen ? "active" : ""} onClick={() => setAiOpen(true)}><Sparkles size={18} /> แชทบอทฐานข้อมูล</button>
               )}
             </>
           )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>เชียงใหม่และจังหวัดใกล้เคียง · {todayText()}</p>
            <h1>{displayTab === "sales" ? "แดชบอร์ดการขาย" : displayTab === "dispatch" ? "แดชบอร์ดการจัดส่ง" : displayTab === "chiangmai" ? "เตรียมออเดอร์เชียงใหม่" : displayTab === "store-work" ? "งานสโตร์" : displayTab === "pack-work" ? "งานห้องแพ็ค" : displayTab === "driver-prep" ? "เช็คออเดอร์เชียงใหม่" : displayTab === "driver" ? "แอปคนขับ" : displayTab === "driver-vehicle" ? "บันทึกการใช้รถ" : displayTab === "driver-sop" ? "ตรวจรถประจำวัน" : displayTab === "driver-sop-report" ? "รายงานตรวจรถ" : displayTab === "settings" ? "การตั้งค่า" : "รายงานประจำวัน"}</h1>
          </div>
          <div className="top-actions">
            <span className="google-status">{{ driver: "คนขับ", sales: "ฝ่ายขาย", admin: "Admin", store: "สโตร์", pack: "ห้องแพ็ค" }[auth.role] || auth.role}: {auth.name || auth.phone || auth.email}</span>
            <button className="secondary" onClick={logout}>ออก</button>
          </div>
        </header>
        <div className="sync-banner">{syncStatus}</div>
        {auth.role === "driver" && needsDailyVehicleStart && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1400, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(520px, 100%)", borderLeft: "4px solid #2563eb", boxShadow: "0 16px 40px rgba(0,0,0,0.25)" }}>
              <div className="panel-head">
                <h2>เริ่มใช้รถวันนี้</h2>
                <span>{todayServiceDate}</span>
              </div>
              <p className="muted" style={{ marginTop: 0 }}>กรุณายืนยันรถและกรอกเลขไมล์เริ่มต้นก่อนใช้งานแอพประจำวัน</p>
              <div style={{ display: "grid", gap: "10px" }}>
                <div>
                  <label className="field-label">รถที่ใช้วันนี้</label>
                  <select
                    value={selectedDriverVehicleId}
                    onChange={e => {
                      setDriverVehicleId(e.target.value);
                      setDriverVehicleChangedToday(true);
                    }}
                  >
                    {HILLKOFF_VEHICLES.map(vehicle => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.plate} · {vehicle.brand} {vehicle.model} · {vehicle.responsiblePerson}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">เลขไมล์เริ่มต้นวันนี้</label>
                  <input
                    value={driverOdometerStart}
                    onChange={e => setDriverOdometerStart(formatWithCommas(e.target.value))}
                    inputMode="numeric"
                    placeholder="เช่น 120,500"
                    autoFocus
                  />
                </div>
                <button type="button" className="primary wide" onClick={submitDailyVehicleStart} disabled={dailyVehicleStartSubmitting}>
                  <CheckCircle2 size={16} /> {dailyVehicleStartSubmitting ? "กำลังบันทึก..." : "เริ่มใช้รถวันนี้"}
                </button>
                {vehicleUsageStatus && (
                  <span style={{ color: vehicleUsageStatus.startsWith("✅") ? "#166534" : vehicleUsageStatus.startsWith("⏳") ? "#1d4ed8" : "#b91c1c", fontWeight: 800, fontSize: "12px" }}>
                    {vehicleUsageStatus}
                  </span>
                )}
              </div>
            </section>
          </div>
        )}

        {auth.role === "sales" && aiOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 2000 }} onClick={() => setAiOpen(false)}>
            <aside
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                height: "100%",
                width: "min(420px, 92vw)",
                background: "white",
                boxShadow: "-12px 0 30px rgba(0,0,0,0.2)",
                display: "grid",
                gridTemplateRows: "auto auto 1fr auto",
              }}
            >
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <b>แชทบอทฐานข้อมูล</b>
                <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setAiOpen(false)}>✕</button>
              </div>

              <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {[
                  "สรุปงานส่งภาพรวมและยอด COD วันนี้",
                  "พื้นที่หรือโซนไหนที่มีปริมาณงานหนาแน่นที่สุด",
                  "วันนี้ใครยังไม่ได้ทำแบบประเมินตรวจรถ",
                  "ตรวจสอบออเดอร์ที่มีปัญหาหรือตกค้าง",
                  "ช่วยแนะนำว่าควรติดตามงานไหนก่อน",
                ].map((t) => (
                  <button key={t} className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} disabled={aiBusy} onClick={() => sendToChatbot(t)}>
                    {t}
                  </button>
                ))}
              </div>

              <div ref={aiListRef} style={{ padding: "12px 14px", overflowY: "auto", background: "#f9fafb", display: "grid", gap: "10px" }}>
                {aiMessages.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>ถามข้อมูลในแอพได้ เช่น ออเดอร์วันนี้, ลูกค้า, COD, โซนงาน, ตรวจรถ, งานที่ควรติดตาม หรือให้ช่วยสรุปภาพรวม</p>
                ) : (
                  aiMessages.map((m, idx) => (
                    <div key={idx} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "100%" }}>
                      <div style={{ background: m.role === "user" ? "#166534" : "white", color: m.role === "user" ? "white" : "#111827", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", whiteSpace: "pre-wrap", fontSize: "13px" }}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
                {aiBusy && (
                  <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "12px", padding: "10px 12px", color: "#6b7280", fontSize: "12px" }}>
                    กำลังค้นข้อมูลจาก Firestore...
                  </div>
                )}
              </div>

              <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
                <input
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="ถามแชทบอทฐานข้อมูล..."
                  style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: "10px" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendToChatbot(aiInput);
                  }}
                  disabled={aiBusy}
                />
                <button className="primary" onClick={() => sendToChatbot(aiInput)} disabled={aiBusy} style={{ padding: "10px 14px" }}>
                  ส่ง
                </button>
              </div>
            </aside>
          </div>
        )}

        <div className="stats">
          <Stat icon={PackagePlus} label="ออเดอร์วันนี้" value={`${totals.jobs} งาน`} sub="ฝ่ายขายเปิดงานส่ง" />
          <Stat icon={UserCheck} label="รอคนขับรับ" value={`${totals.waiting} งาน`} sub="เด้งเข้าหน้าคนขับ" tone="#92400e" />
          <Stat icon={Navigation} label="กำลังส่ง" value={`${totals.active} งาน`} sub="เช็คอินได้จากหน้างาน" tone="#1d4ed8" />
          <Stat icon={CheckCircle2} label="ส่งสำเร็จ" value={`${totals.done} งาน`} sub="ต้องมีหลักฐานรูปถ่าย" tone="#166534" />
          <Stat icon={MapPinned} label="งานวิ่งวันนี้" value={`${todayRouteTasks.length} งาน`} sub="วิ่งสาขาและงานวิ่งไกล" tone="#0e7490" />
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

            <section className="panel" style={{ gridColumn: "1 / -1", borderLeft: "4px solid #0e7490" }}>
              <div className="panel-head"><h2>🛣️ งานวิ่งสาขา / งานวิ่งไกล</h2><span>งานวันนี้ {todayRouteTasks.length} งาน · กำลังทำ {activeTodayRouteTasks.length}</span></div>
              {!latestTodayRouteTask ? (
                <p className="muted" style={{ margin: 0 }}>ยังไม่มีงานวิ่งสาขาหรืองานวิ่งไกลวันนี้</p>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {[latestTodayRouteTask].map(task => {
                    const taskColor = routeTaskStatusColor[task.status] || "#1d4ed8";
                    const checkedCount = (task.stops || []).filter(stop => stop.checkedInAt).length;
                    const stopCount = (task.stops || []).length;
                    const latestStop = (task.stops || []).filter(stop => stop.checkedInAt).slice(-1)[0];
                    return (
                      <div key={task.id} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", display: "grid", gap: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "start" }}>
                          <div>
                            <b style={{ display: "block", color: "#111827" }}>{task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"}</b>
                            <small style={{ color: "#6b7280" }}>{task.id}{task.type === "long" ? ` · ${task.routeDirection === "return" ? "ขากลับเชียงใหม่" : "ขาไป"}` : ""}</small>
                          </div>
                          <span style={{ color: taskColor, background: `${taskColor}14`, borderRadius: "999px", padding: "4px 8px", fontSize: "11px", fontWeight: 800 }}>{task.status}</span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#374151", display: "grid", gap: "3px" }}>
                          <span><b>คนขับ:</b> {task.driverName || task.driverId || "-"}</span>
                          <span style={{ color: "#1d4ed8", fontWeight: 800 }}><b>สถานะคนขับ:</b> เริ่มงานต้นทางแล้ว{task.originStartedAt ? ` · ${task.originStartedAt}` : ""}</span>
                          <span><b>เส้นทาง:</b> {task.origin} → {task.destinationSummary}</span>
                          <span><b>เช็คอิน:</b> {checkedCount}/{stopCount} จุด</span>
                          {latestStop && <span style={{ color: "#0e7490" }}><b>ล่าสุด:</b> {latestStop.name} · {latestStop.checkedInAt}</span>}
                          {task.note && <span><b>หมายเหตุ:</b> {task.note}</span>}
                        </div>
                        <div style={{ display: "grid", gap: "6px" }}>
                          {(task.stops || []).map(stop => (
                            <div key={stop.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px", fontSize: "12px" }}>
                              <b>{stop.kind === "midway" ? "ระหว่างทาง" : stop.name}</b>
                              <span style={{ color: stop.checkedInAt ? "#166534" : "#6b7280", marginLeft: "6px" }}>{stop.checkedInAt ? "เช็คอินแล้ว" : "รอเช็คอิน"}</span>
                              {stop.checkedInAt && <div style={{ color: "#6b7280", marginTop: "3px" }}>{stop.checkedInAt}{stop.sharedToLine ? " · แชร์ LINE แล้ว" : ""}</div>}
                              {stop.note && <div style={{ color: "#6b7280", marginTop: "3px" }}>{stop.note}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {olderTodayRouteTasks.length > 0 && (
                    <details style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900, color: "#0e7490" }}>
                        ดูงานที่ผ่านมาเพิ่มเติม ({olderTodayRouteTasks.length} งาน)
                      </summary>
                      <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                        {olderTodayRouteTasks.map(task => {
                          const taskColor = routeTaskStatusColor[task.status] || "#1d4ed8";
                          const checkedCount = (task.stops || []).filter(stop => stop.checkedInAt).length;
                          const stopCount = (task.stops || []).length;
                          const latestStop = (task.stops || []).filter(stop => stop.checkedInAt).slice(-1)[0];
                          return (
                            <div key={task.id} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px", display: "grid", gap: "6px", fontSize: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "start" }}>
                                <b style={{ color: "#111827" }}>{task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"} · {task.id}</b>
                                <span style={{ color: taskColor, background: `${taskColor}14`, borderRadius: "999px", padding: "3px 7px", fontSize: "11px", fontWeight: 800 }}>{task.status}</span>
                              </div>
                              <span><b>คนขับ:</b> {task.driverName || task.driverId || "-"}</span>
                              <span><b>เส้นทาง:</b> {task.origin} → {task.destinationSummary}</span>
                              <span><b>เช็คอิน:</b> {checkedCount}/{stopCount} จุด{latestStop ? ` · ล่าสุด ${latestStop.name}` : ""}</span>
                              {task.completedAt && <span style={{ color: "#166534", fontWeight: 800 }}><b>จบงาน:</b> {task.completedAt}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </section>

            <section className="panel" style={{ gridColumn: "1 / -1" }}>
              {(() => {
                const locs = state.driverLocations || {};
                // Show markers based on last check-in location (not "online" heartbeat),
                // because check-in location is persisted while online state is best-effort/local.
                const idsWithLocation = Object.keys(locs).filter(did => locs[did]?.lat && locs[did]?.lng);
                const defaultCenter = { lat: 18.7883, lng: 98.9853 }; // Chiang Mai
                const effectiveId = selectedMapDriverId || idsWithLocation[0] || "";
                const selected = effectiveId ? locs[effectiveId] : null;
                const centerLat = selected?.lat ?? defaultCenter.lat;
                const centerLng = selected?.lng ?? defaultCenter.lng;
                const embed = osmEmbedUrl(centerLat, centerLng, 15, Boolean(selected));

                return (
                  <>
                    <div className="panel-head"><h2>🗺️ Mini-map (OSM)</h2><span>{idsWithLocation.length} จุดเช็คอิน</span></div>
                    {idsWithLocation.length === 0 ? (
                      <p className="muted" style={{ margin: 0 }}>ยังไม่มีคนขับเช็คอินพิกัด (ให้คนขับกด “ไปถึงแล้ว” ที่หน้างาน และอนุญาต GPS)</p>
                    ) : (
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                        {idsWithLocation.map(did => {
                          const d = locs[did];
                          const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
                          return (
                            <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
                              📍 {name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
                        <b>{selected?.driverName ? `📍 ${selected.driverName}` : "แผนที่ภาพรวม"}</b>
                        <small style={{ color: "#6b7280" }}>{selected?.zone || "เชียงใหม่"}</small>
                      </div>
                      <iframe title="osm-mini-map" src={embed} style={{ width: "100%", height: "260px", border: "1px solid #e5e7eb", borderRadius: "8px" }} loading="lazy" />
                      <a href={osmPageUrl(centerLat, centerLng, 16)} target="_blank" rel="noreferrer" className="secondary" style={{ display: "block", textAlign: "center", padding: "8px", textDecoration: "none" }}>
                        เปิดแผนที่เต็ม (OpenStreetMap)
                      </a>
                    </div>
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
                          const loc = (state.driverLocations || {})[did] || null;
                          const resolvedName = driver?.name || items[0]?.driverName || loc?.driverName || "";
                          const resolvedPhone = driver?.phone || loc?.driverPhone || "";
                          return (
                            <div key={did} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                                <b>{resolvedName || "ไม่ทราบชื่อคนขับ"}</b>
                                <small style={{ color: "#6b7280" }}>{driver?.plate || "-"}</small>
                              </div>
                              <small style={{ color: "#6b7280" }}>{driver?.zone || loc?.zone || "-"}{resolvedPhone ? ` · ${resolvedPhone}` : ""}</small>
                              <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                                {items.slice(0, 5).map(o => (
                                  <div key={o.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "8px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                      <b style={{ color: statusColor[o.status] || "#111827" }}>{o.id}</b>
                                      <small style={{ color: statusColor[o.status] || "#111827" }}>{o.status}</small>
                                    </div>
                                    <small style={{ color: "#374151" }}>{o.customerName} · {o.zone}</small>
                                    <div style={{ marginTop: "4px", color: "#6b7280", fontSize: "11px" }}>👤 คนขับ: {resolvedName || did} {resolvedPhone ? `· ${resolvedPhone}` : ""}</div>
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
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <small style={{ color: "#6b7280" }}>
                      {customerQuery.trim()
                        ? `ผลค้นหา ${filteredCustomers.length} ราย`
                        : `แสดง ${showAllCustomers ? "ทั้งหมด" : `${Math.min(customerPreviewCount, customers.length)} รายแรก`}`}
                    </small>
                    {!customerQuery.trim() && customers.length > customerPreviewCount && (
                      <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setShowAllCustomers(v => !v)}>
                        {showAllCustomers ? "ย่อรายการ" : `ดูเพิ่มเติมอีก ${customers.length - customerPreviewCount} ราย`}
                      </button>
                    )}
                  </div>

                  <label className="search" style={{ marginTop: "8px" }}><Search size={16} /><input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="ค้นหาชื่อลูกค้า เบอร์โทร ผู้ติดต่อ หรือพื้นที่" /></label>
                  <div className="customer-list">
                    {(() => {
                      const q = customerQuery.trim();
                      const displayCustomers = q ? filteredCustomers.slice(0, 30) : (showAllCustomers ? customers : customers.slice(0, customerPreviewCount));
                      if (q && displayCustomers.length === 0) {
                        return <p className="muted" style={{ margin: 0, padding: "10px" }}>ไม่พบลูกค้าที่ตรงกับคำค้น</p>;
                      }
                      return displayCustomers.map(customer => (
                        <button key={customer.id} className={`customer-card ${selectedCustomerId === customer.id ? "selected" : ""}`} onClick={() => setSelectedCustomerId(customer.id)}>
                          <strong>
                            {customer.name}
                            {customerNameCounts[customerNameKey(customer.name)] > 1 && (
                              <small className="duplicate-count">ซ้ำ {customerNameCounts[customerNameKey(customer.name)]} ราย</small>
                            )}
                          </strong>
                          <span>{customer.contact} · {customer.phone}</span>
                          <span>{customer.zone} · {customer.address}</span>
                        </button>
                      ));
                    })()}
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button className="secondary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => {
                      setEditingCustomerId(selectedCustomer.id);
                      setEditCustomerForm(selectedCustomer);
                    }}>✏️ แก้ไขข้อมูล</button>
                    <button className="secondary danger" style={{ padding: "8px", fontSize: "12px" }} onClick={() => deleteCustomer(selectedCustomer)}>ลบลูกค้า</button>
                  </div>
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
              <div className="panel-head"><h2>เปิดออเดอร์ส่งของ</h2><span>เลือกลูกค้าจากรายชื่อ</span></div>
              {(() => {
                const q = (orderCustomerSearch || "").trim();
                const matches = customers
                  .filter(c => customerMatchesQuery(c, q))
                  .slice(0, 30);

                return (
                  <div style={{ position: "relative" }}>
                    <label className="search">
                      <Search size={16} />
                      <input
                        value={orderCustomerSearch}
                        onChange={e => {
                          setOrderCustomerSearch(e.target.value);
                          setSelectedCustomerId("");
                        }}
                        placeholder="ค้นหาชื่อลูกค้า / เบอร์ / พื้นที่ แล้วเลือกจากรายการ"
                      />
                    </label>
                    {q && matches.length > 0 && (
                      <div style={{ position: "absolute", top: "44px", left: 0, right: 0, zIndex: 20, background: "white", border: "1px solid #e5e7eb", borderRadius: "10px", boxShadow: "0 10px 25px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                        {matches.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setOrderCustomerSearch("");
                            }}
                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "white", cursor: "pointer" }}
                            className="customer-suggest"
                          >
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>{c.name}</div>
                            <div style={{ fontSize: "11px", color: "#6b7280" }}>{[c.phone, c.zone].filter(Boolean).join(" · ")}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                <option value="">-- เลือกลูกค้า --</option>
                {customers
                  .filter(c => customerMatchesQuery(c, orderCustomerSearch))
                  .map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
              {(() => {
                const foundCustomer = customers.find(c => c.id === selectedCustomerId) || null;
                return foundCustomer ? (
                  <div className="customer-detail">
                    <div><b>{foundCustomer.name}</b><p>{foundCustomer.contact} · {foundCustomer.phone}</p><p>{foundCustomer.address}</p></div>
                    {foundCustomer.mapUrl ? (
                      <a href={foundCustomer.mapUrl} target="_blank" rel="noreferrer"><MapPinned size={16} /> เปิดแผนที่</a>
                    ) : (
                      <span style={{ color: "#6b7280" }}>ไม่มีลิงก์แผนที่</span>
                    )}
                  </div>
                ) : null;
              })()}
              <div className="form-grid order-create-grid">
                <select value={orderForm.pickupWaitMinutes} onChange={e => setOrderForm(p => ({ ...p, pickupWaitMinutes: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                  <option value="5">เวลารอรับสินค้า: 5 นาที</option>
                  <option value="10">เวลารอรับสินค้า: 10 นาที</option>
                  <option value="15">เวลารอรับสินค้า: 15 นาที</option>
                  <option value="20">เวลารอรับสินค้า: 20 นาที</option>
                  <option value="30">เวลารอรับสินค้า: 30 นาที</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 56px", gap: "8px", alignItems: "center" }}>
                  <input
                    value={orderForm.qty}
                    onChange={e => setOrderForm(p => ({ ...p, qty: digitsOnly(e.target.value) }))}
                    inputMode="numeric"
                    type="text"
                    placeholder="จำนวนของที่ส่ง"
                  />
                  <div style={{ color: "#6b7280", fontSize: "12px", textAlign: "center" }}>ชิ้น</div>
                </div>
                <select value={orderForm.paymentType} onChange={e => setOrderForm(p => ({ ...p, paymentType: e.target.value }))} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #e5e7eb" }}>
                  <option value="COD">COD</option>
                  <option value="PAID">PAID</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 56px", gap: "8px", alignItems: "center" }}>
                  <input
                    value={formatWithCommas(orderForm.codAmount)}
                    onChange={e => setOrderForm(p => ({ ...p, codAmount: digitsOnly(e.target.value) }))}
                    inputMode="numeric"
                    type="text"
                    placeholder="จำนวนเงิน (กรณี COD)"
                    disabled={orderForm.paymentType !== "COD"}
                  />
                  <div style={{ color: "#6b7280", fontSize: "12px", textAlign: "center" }}>บาท</div>
                </div>
              </div>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 800 }}>เส้นทางตรวจสอบสินค้า</span>
                <select value={orderForm.workflowType} onChange={e => setOrderForm(p => ({ ...p, workflowType: e.target.value }))}>
                  <option value="store_route">ผ่านสโตร์ก่อน แล้วส่งห้องแพ็ค</option>
                  <option value="direct_pack">ส่งตรงห้องแพ็ค</option>
                </select>
              </label>
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
                    const lastSeenAt =
                      location.updatedAt ? new Date(location.updatedAt) :
                      location.checkInAt ? new Date(location.checkInAt) :
                      null;
                    const minutesAgo = lastSeenAt ? Math.floor((Date.now() - lastSeenAt.getTime()) / 60000) : null;
                    const isOffline = minutesAgo == null ? true : minutesAgo > 120;
                    return (
                      <div key={location.driverId} style={{ padding: "12px", borderBottom: "1px solid #eee", marginBottom: "8px", background: "#f0f9ff", borderRadius: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                          <div>
                            <b style={{ fontSize: "14px", color: "#1a5490" }}>🚗 {location.driverName}</b>
                            <p style={{ margin: "4px 0", fontSize: "12px" }}>📱 {location.driverPhone || "-"} · {location.plate}</p>
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#059669", fontWeight: "bold" }}>🏪 {location.customerName || location.lastCustomerName || "-"}</p>
                            {customer && <p style={{ margin: "4px 0", fontSize: "11px", color: "#0891b2" }}>👤 ติดต่อ: {customer.contact}</p>}
                            <p style={{ margin: "4px 0", fontSize: "12px", color: "#666" }}>📌 {location.address || currentOrder?.address || "-"}</p>
                            <p style={{ margin: "4px 0", fontSize: "11px", color: "#6b7280" }}>📍 โซน: {location.zone || currentOrder?.zone || "-"}</p>
                            {currentOrder && <p style={{ margin: "4px 0", fontSize: "11px", color: "#7c2d12", background: "#fed7aa", padding: "2px 6px", borderRadius: "3px", display: "inline-block" }}>📦 สถานะ: {currentOrder.status}</p>}
                            <p style={{ margin: "4px 0", fontSize: "11px", color: "#999" }}>⏰ เช็คอิน: {location.checkInTime}</p>
                          </div>
                          {isOffline ? (
                            <span style={{ background: "#991b1b", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>⚫ Offline</span>
                          ) : (
                            <span style={{ background: "#166534", color: "white", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>🟢 Online</span>
                          )}
                        </div>
                        <div style={{ marginTop: "6px", color: "#6b7280", fontSize: "11px" }}>
                          ล่าสุด {minutesAgo == null ? "-" : `${minutesAgo} นาทีที่แล้ว`}
                        </div>
                        {location.lat && location.lng && (
                          <div style={{ marginTop: "8px" }}>
                            <a className="secondary" style={{ display: "inline-block", padding: "6px 10px", fontSize: "11px", textDecoration: "none" }} target="_blank" rel="noreferrer" href={osmPageUrl(location.lat, location.lng, 17)}>
                              🗺️ เปิดจุดเช็คอินบนแผนที่
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📝 ออเดอร์ใหม่ (วันนี้)</h2><span>รอคนขับรับ {todayOrdersOnly.filter(o => o.status === "รอคนขับรับ").length}</span></div>
              {todayOrdersOnly.filter(o => o.status === "รอคนขับรับ").length === 0 ? (
                <p className="muted">ไม่มีออเดอร์ใหม่</p>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {todayOrdersOnly.filter(o => o.status === "รอคนขับรับ").map(order => (
                    <div key={order.id} style={{ background: "#fef9e7", padding: "10px", borderRadius: "6px", borderLeft: "4px solid #f59e0b", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ display: "block", fontSize: "13px" }}>{order.id} · {order.customerName}</b>
                        <small style={{ color: "#666" }}>{order.zone} · {order.boxes} กล่อง · ฿{money(order.cod)}</small>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="primary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => sharePendingOrderQueueToLine(order)}>💬 คัดลอก/แชร์</button>
                        <button className="secondary" style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>🗑️ ลบ</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-head"><h2>📦 สรุปการส่งของ (วันนี้)</h2><span>กำลังส่ง {todayOrdersOnly.filter(o => o.status === "กำลังส่ง").length} + สำเร็จ {todayOrdersOnly.filter(o => o.status === "ส่งสำเร็จ").length + completedTodayRouteTasks.length}</span></div>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <div style={{ flex: 1, background: "#fef3c7", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #f59e0b" }}>
                  <small style={{ color: "#92400e" }}>⏳ กำลังส่ง</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#f59e0b" }}>{todayOrdersOnly.filter(o => o.status === "กำลังส่ง").length}</b>
                </div>
                <div style={{ flex: 1, background: "#f0fdf4", padding: "12px", borderRadius: "6px", borderLeft: "4px solid #22c55e" }}>
                  <small style={{ color: "#166534" }}>✓ สำเร็จ</small>
                  <b style={{ fontSize: "20px", display: "block", color: "#22c55e" }}>{todayOrdersOnly.filter(o => o.status === "ส่งสำเร็จ").length + completedTodayRouteTasks.length}</b>
                </div>
              </div>
              <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                {todayOrdersOnly.filter(o => o.status === "กำลังส่ง" || o.status === "ส่งสำเร็จ").length === 0 && completedTodayRouteTasks.length === 0 ? (
                  <p className="muted">ยังไม่มีการส่ง</p>
                ) : (
                  <>
                    {todayOrdersOnly.filter(o => o.status === "กำลังส่ง" || o.status === "ส่งสำเร็จ").sort((a, b) => (a.status === "กำลังส่ง" ? -1 : 1)).map(order => {
                      const driver = drivers.find(d => d.id === order.driverId);
                      const driverName = order.driverName || driver?.name || (order.driverId ? order.driverId : "");
                      return (
                        <div key={order.id} style={{ padding: "10px", borderBottom: "1px solid #eee", fontSize: "12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                            <b style={{ color: order.status === "กำลังส่ง" ? "#f59e0b" : "#22c55e" }}>{order.id}</b>
                            <span style={{ background: order.status === "กำลังส่ง" ? "#fef3c7" : "#f0fdf4", color: order.status === "กำลังส่ง" ? "#92400e" : "#166534", padding: "2px 6px", borderRadius: "3px", fontSize: "11px" }}>{order.status === "กำลังส่ง" ? "⏳ ส่งไป" : "✓ เสร็จ"}</span>
                          </div>
                          <p style={{ margin: "2px 0", color: "#333" }}>{order.customerName}</p>
                          <p style={{ margin: "2px 0", color: "#666" }}>{order.address}</p>
                          <p style={{ margin: "2px 0", color: "#999" }}>🚗 {driverName || "ยังไม่มอบหมาย"}</p>
                          {order.status === "ส่งสำเร็จ" && order.deliveredAt && (
                            <p style={{ margin: "2px 0", color: "#16a34a", fontWeight: "bold" }}>✅ เสร็จเมื่อ {order.deliveredAt}</p>
                          )}
                        </div>
                      );
                    })}
                    {completedTodayRouteTasks.map(task => (
                      <div key={task.id} style={{ padding: "10px", borderBottom: "1px solid #eee", fontSize: "12px", background: "#f0fdf4" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "4px" }}>
                          <b style={{ color: "#166534" }}>{task.id}</b>
                          <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 6px", borderRadius: "3px", fontSize: "11px" }}>✓ งานวิ่งเสร็จ</span>
                        </div>
                        <p style={{ margin: "2px 0", color: "#333" }}>{task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"}{task.routeDirection === "return" ? " · ขากลับเชียงใหม่" : task.type === "long" ? " · ขาไป" : ""}</p>
                        <p style={{ margin: "2px 0", color: "#666" }}>{task.origin} → {task.destinationSummary}</p>
                        <p style={{ margin: "2px 0", color: "#999" }}>🚗 {task.driverName || task.driverId || "ไม่ระบุคนขับ"}</p>
                        {task.completedAt && <p style={{ margin: "2px 0", color: "#16a34a", fontWeight: "bold" }}>✅ เสร็จเมื่อ {task.completedAt}</p>}
                      </div>
                    ))}
                  </>
                )}
              </div>
              {backlogUndelivered.length > 0 && (
                <div style={{ marginTop: "10px", background: "#eff6ff", border: "1px solid #bfdbfe", padding: "10px", borderRadius: "8px", fontSize: "12px" }}>
                  <b style={{ color: "#1d4ed8" }}>📌 งานค้างส่งจากวันก่อน: {backlogUndelivered.length} งาน</b>
                  <div className="muted" style={{ marginTop: "4px" }}>นับเฉพาะงานวันก่อนที่ยังรอคนขับรับ/กำลังส่ง/กำลังจัดส่ง</div>
                </div>
              )}
            </section>
          </div>
            </>
          )}

        {auth.role === "admin" && displayTab === "settings" && (
          <section className="panel" style={{ marginBottom: "16px", borderLeft: "4px solid #7c3aed" }}>
            <div className="panel-head"><h2>จัดการบัญชีสโตร์และห้องแพ็ค</h2><span>Admin</span></div>
            <div className="form-grid two">
              <input value={staffAccountForm.username} onChange={e => setStaffAccountForm(p => ({ ...p, username: e.target.value }))} placeholder="Username เช่น store01" />
              <input value={staffAccountForm.name} onChange={e => setStaffAccountForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อพนักงาน" />
              <input type="password" value={staffAccountForm.password} onChange={e => setStaffAccountForm(p => ({ ...p, password: e.target.value }))} placeholder="Password อย่างน้อย 8 ตัว" />
              <select value={staffAccountForm.role} onChange={e => setStaffAccountForm(p => ({ ...p, role: e.target.value }))}><option value="store">สโตร์</option><option value="pack">ห้องแพ็ค</option></select>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
              <button className="primary" onClick={createStaffAccount}>สร้างบัญชี</button>
              <button className="secondary" onClick={setupDailyDeliverySheet}>ตั้งค่า Sheet ระบบส่งของเชียงใหม่</button>
            </div>
            <p className="muted" style={{ marginTop: "8px", fontSize: "12px" }}>ปุ่มตั้งค่าใช้ครั้งแรกเท่านั้น หลังสร้างแล้วระบบจะล็อก Spreadsheet ID และจะไม่สร้างไฟล์ใหม่อัตโนมัติ</p>
          </section>
        )}

        {["store-work", "pack-work", "chiangmai", "driver-prep"].includes(displayTab) && (
          <section className="panel">
            <div className="panel-head">
              <h2>{displayTab === "store-work" ? "งานสโตร์" : displayTab === "pack-work" ? "งานห้องแพ็ค" : displayTab === "driver-prep" ? "เช็คสถานะออเดอร์เชียงใหม่" : "ออเดอร์ส่งเชียงใหม่และจังหวัดใกล้เคียง"}</h2>
              <span>{(displayTab === "store-work" ? storeWorkOrders : displayTab === "pack-work" ? packWorkOrders : preparationOrders).length} งาน</span>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              {(displayTab === "store-work" ? storeWorkOrders : displayTab === "pack-work" ? packWorkOrders : preparationOrders).map(order => (
                <article key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div><b>{order.id} · {order.customerName}</b><div className="muted">{order.zone} · {order.address}</div></div>
                    <span className="status-chip">สโตร์: {order.storeStatus || "-"} · แพ็ค: {order.packStatus || "-"}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#4b5563" }}>
                    เส้นทาง: {order.workflowType === "direct_pack" ? "ส่งตรงห้องแพ็ค" : "ผ่านสโตร์"} · {order.boxes || 0} กล่อง
                    {order.storePackerName && <> · ผู้จัด: {order.storePackerName}</>}
                    {order.storeCheckerName && <> · ผู้ตรวจสโตร์: {order.storeCheckerName}</>}
                    {order.packPackerName && <> · ผู้แพ็ค: {order.packPackerName}</>}
                    {order.packCheckerName && <> · ผู้ตรวจแพ็ค: {order.packCheckerName}</>}
                  </div>
                  {Array.isArray(order.missingItems) && order.missingItems.length > 0 && <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "6px", fontSize: "12px" }}>รอสินค้า: {order.missingItems.map(item => typeof item === "string" ? item : `${item.name || item.sku || "สินค้า"}: ${item.reason || "รอสินค้า"}`).join(", ")}</div>}
                  {displayTab === "store-work" && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="secondary" onClick={() => updatePreparationWorkflow(order, "store_update", { storeStatus: "working", storePackerName: auth.name })}>รับงาน</button>
                      <button className="primary" onClick={() => { const checker = prompt("กรอกชื่อผู้ตรวจสอบสโตร์"); if (checker?.trim()) updatePreparationWorkflow(order, "store_update", { storeStatus: "checked", storePackerName: order.storePackerName || auth.name, storeCheckerName: checker.trim(), missingItems: [] }); }}>ยืนยันครบ</button>
                      <button className="secondary" onClick={() => { const reason = prompt("ระบุรายการและเหตุผลที่รอ"); if (!reason) return; const checker = prompt("กรอกชื่อผู้ตรวจสอบสโตร์"); if (checker?.trim()) updatePreparationWorkflow(order, "store_update", { storeStatus: "partial", storePackerName: order.storePackerName || auth.name, storeCheckerName: checker.trim(), missingItems: [reason] }); }}>แจ้งสินค้าไม่ครบ</button>
                    </div>
                  )}
                  {displayTab === "pack-work" && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button className="secondary" onClick={() => updatePreparationWorkflow(order, "pack_update", { packStatus: "working", packPackerName: auth.name })}>รับงาน</button>
                      <button className="primary" onClick={() => { const checker = prompt("กรอกชื่อผู้ตรวจสอบห้องแพ็ค"); if (checker?.trim()) updatePreparationWorkflow(order, "pack_update", { packStatus: "checked", packPackerName: order.packPackerName || auth.name, packCheckerName: checker.trim(), missingItems: [] }); }}>ยืนยันพร้อมส่ง</button>
                      <button className="secondary" onClick={() => { const reason = prompt("ระบุรายการและเหตุผลที่รอ"); if (!reason) return; const checker = prompt("กรอกชื่อผู้ตรวจสอบห้องแพ็ค"); if (checker?.trim()) updatePreparationWorkflow(order, "pack_update", { packStatus: "partial", packPackerName: order.packPackerName || auth.name, packCheckerName: checker.trim(), missingItems: [reason] }); }}>พร้อมส่งบางส่วน</button>
                    </div>
                  )}
                  {displayTab === "chiangmai" && ["checked", "partial"].includes(order.packStatus) && (
                    <button className="primary" onClick={() => updatePreparationWorkflow(order, "queue")}>ส่งเข้าคิวคนขับ</button>
                  )}
                </article>
              ))}
              {(displayTab === "store-work" ? storeWorkOrders : displayTab === "pack-work" ? packWorkOrders : preparationOrders).length === 0 && <p className="muted">ยังไม่มีออเดอร์ในขั้นตอนนี้</p>}
            </div>
          </section>
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
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-6px", marginBottom: "10px" }}>
                <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setOrdersLimit((n) => n + 20)}>
                  โหลดเพิ่ม (+20)
                </button>
              </div>
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
                  const loc = (state.driverLocations || {})[order.driverId] || null;
                  const driverName = order.driverName || assignedDriver?.name || loc?.driverName || "";
                  return (
                    <article key={order.id} className="dispatch-row">
                      <div><b>{order.id}</b><span>{order.window} · {order.boxes} กล่อง</span></div>
                      <div><b>{order.customerName}</b><span>{order.zone} · {order.address}</span>{order.complaint && <span style={{ marginLeft: "8px", background: "#fca5a5", color: "#7f1d1d", padding: "2px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: "bold" }}>⚠️ {order.complaint}</span>}</div>
                      <div className="status-stack">
                        <span className="status-chip" style={{ color: statusColor[order.status], background: `${statusColor[order.status]}14` }}>{order.status}</span>
                        <small>{driverName || "ยังไม่รับงาน"}</small>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
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
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button
                  className={notificationPermission === "granted" ? "primary" : "secondary"}
                  onClick={() => ensureWebPushForDriver(state.auth, { showStatus: true })}
                >
                  <BellRing size={16} /> {notificationPermission === "granted" ? "แจ้งเตือนเปิดอยู่" : "เปิดแจ้งเตือนออเดอร์"}
                </button>
                <small style={{ color: notificationPermission === "denied" ? "#b91c1c" : "#69756d" }}>
                  {pushStatus || (notificationPermission === "denied"
                    ? "เบราว์เซอร์บล็อกการแจ้งเตือน ต้องปลดบล็อกใน Settings ของเว็บ"
                    : "รับแจ้งเตือนเมื่อมีออเดอร์ใหม่ แม้ไม่ได้เปิดหน้าแอพอยู่")}
                </small>
              </div>
            </section>

            <section className="panel" style={{ borderLeft: "4px solid #2563eb" }}>
              <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div>
                  <h2 style={{ margin: 0 }}>รายงานการทำงานวันนี้</h2>
                  <span>{todayServiceDate}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setShowDriverDailyReport(v => !v)}>
                    <FileText size={14} /> {showDriverDailyReport ? "ซ่อนรายงาน" : "ดูรายงาน"}
                  </button>
                  <button className="primary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => copyToClipboard(buildDriverDailyWorkReport())}>
                    <ClipboardList size={14} /> คัดลอก
                  </button>
                </div>
              </div>
              <div className="analytics-cards" style={{ marginTop: "12px" }}>
                <div><span>ออเดอร์ปกติ</span><b>{driverTodayWorkSummary.orders}</b></div>
                <div><span>ส่งสำเร็จ</span><b>{driverTodayWorkSummary.completedOrders}</b></div>
                <div><span>งานวิ่ง</span><b>{driverTodayWorkSummary.routeTasks}</b></div>
                <div><span>วิ่งเสร็จ</span><b>{driverTodayWorkSummary.completedRouteTasks}</b></div>
              </div>
              <p className="muted" style={{ margin: "10px 0 0" }}>
                COD วันนี้ ฿{money(driverTodayWorkSummary.cod)} · COD ส่งสำเร็จ ฿{money(driverTodayWorkSummary.codDone)}
              </p>
              {showDriverDailyReport && (
                <pre style={{ margin: "12px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", color: "#374151", fontSize: "12px", lineHeight: 1.6 }}>
                  {buildDriverDailyWorkReport()}
                </pre>
              )}
            </section>

            <section className="panel" style={{ borderLeft: "4px solid #0e7490" }}>
              <div className="panel-head"><h2>🛣️ งานวิ่งสาขา / งานวิ่งไกล</h2><span>{activeDriverRouteTasks.length} งานกำลังทำ</span></div>
              <div style={{ display: "grid", gap: "12px" }}>
                <div className="segmented" style={{ marginBottom: 0 }}>
                  <button className={routeTaskForm.type === "branch" ? "active" : ""} onClick={() => setRouteTaskForm(p => ({ ...p, type: "branch", origin: p.origin || "สาขาสำนักงานใหญ่" }))}>วิ่งสาขา</button>
                  <button className={routeTaskForm.type === "long" ? "active" : ""} onClick={() => setRouteTaskForm(p => ({ ...p, type: "long", origin: p.origin || "สาขาสำนักงานใหญ่", longDirection: p.longDirection || "outbound" }))}>วิ่งไกล</button>
                </div>

                {routeTaskForm.type === "long" && (
                  <div className="segmented" style={{ marginBottom: 0 }}>
                    <button
                      className={routeTaskForm.longDirection !== "return" ? "active" : ""}
                      onClick={() => setRouteTaskForm(p => ({ ...p, longDirection: "outbound", origin: "สาขาสำนักงานใหญ่" }))}
                    >
                      ขาไป
                    </button>
                    <button
                      className={routeTaskForm.longDirection === "return" ? "active" : ""}
                      onClick={() => setRouteTaskForm(p => ({ ...p, longDirection: "return", origin: "ร้านหอมไกล จ.ชลบุรี" }))}
                    >
                      ขากลับเชียงใหม่
                    </button>
                  </div>
                )}

                <div className="form-grid two">
                  <select value={routeTaskForm.origin} onChange={e => setRouteTaskForm(p => ({ ...p, origin: e.target.value }))}>
                    {[...BRANCH_ROUTE_STOPS, ...LONG_ROUTE_STOPS].map(stop => <option key={stop} value={stop}>ต้นทาง: {stop}</option>)}
                  </select>
                  {routeTaskForm.type === "branch" ? (
                    <select value={routeTaskForm.branchDestination} onChange={e => setRouteTaskForm(p => ({ ...p, branchDestination: e.target.value }))}>
                      {BRANCH_ROUTE_STOPS.map(stop => <option key={stop} value={stop}>ปลายทาง: {stop}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: "grid", gap: "8px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
                      <b style={{ fontSize: "12px", color: "#374151" }}>
                        ปลายทาง{routeTaskForm.longDirection === "return" ? "ขากลับ: เลือกตามลำดับ" : "ขาไป: เลือกได้ 1 จุด หรือรวม 2 จุดตามลำดับ"}
                      </b>
                      {[0, 1].map(index => {
                        const field = routeTaskForm.longDirection === "return" ? "longReturnDestinations" : "longDestinations";
                        const options = routeTaskForm.longDirection === "return" ? LONG_ROUTE_RETURN_STOPS : LONG_ROUTE_STOPS;
                        const current = routeTaskForm[field] || [];
                        return (
                          <select
                            key={index}
                            value={current[index] || ""}
                            onChange={e => setRouteTaskForm(p => {
                              const next = [...(p[field] || [])];
                              next[index] = e.target.value;
                              return { ...p, [field]: next };
                            })}
                          >
                            <option value="">{index === 0 ? "ปลายทางจุดที่ 1" : "ปลายทางจุดที่ 2 (ไม่เลือกได้)"}</option>
                            {options.map(stop => <option key={stop} value={stop}>{index === 0 ? "จุดที่ 1" : "จุดที่ 2"}: {stop}</option>)}
                          </select>
                        );
                      })}
                    </div>
                  )}
                </div>
                <textarea value={routeTaskForm.note} onChange={e => setRouteTaskForm(p => ({ ...p, note: e.target.value }))} placeholder="หมายเหตุงานวิ่ง เช่น รับของกลับ / เอกสาร / รอบร่วม" rows={2} />
                <button className="primary wide" onClick={createRouteTask}><MapPinned size={18} /> เริ่มงานวิ่ง</button>

                {activeDriverRouteTasks.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
                    {activeDriverRouteTasks.map(task => {
                      const taskColor = routeTaskStatusColor[task.status] || "#1d4ed8";
                      return (
                        <div key={task.id} style={{ background: "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${taskColor}`, display: "grid", gap: "10px" }}>
                          <div>
                            <b style={{ color: taskColor, display: "block" }}>{task.type === "long" ? `งานวิ่งไกล${task.routeDirection === "return" ? "ขากลับเชียงใหม่" : "ขาไป"}` : "งานวิ่งสาขา"} · {task.id}</b>
                            <small style={{ color: "#374151" }}>{task.origin} → {task.destinationSummary}</small><br />
                            {task.note && <small style={{ color: "#6b7280" }}>{task.note}</small>}
                          </div>
                          <button className="secondary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => addRouteTaskMidwayCheckIn(task)}>📍 เช็คอินระหว่างทาง</button>
                          <div style={{ display: "grid", gap: "8px" }}>
                            {(task.stops || []).map(stop => (
                              <div key={stop.id} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px", display: "grid", gap: "8px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
                                  <b>{stop.kind === "midway" ? "เช็คอินระหว่างทาง" : stop.name}</b>
                                  <small style={{ color: stop.checkedInAt ? "#166534" : "#92400e", fontWeight: 800 }}>{stop.checkedInAt ? "เช็คอินแล้ว" : "รอเช็คอิน"}</small>
                                </div>
                                {stop.checkedInAt && <small style={{ color: "#6b7280" }}>{stop.checkedInAt}{stop.sharedToLine ? " · แชร์ LINE แล้ว" : ""}</small>}
                                {stop.note && <small style={{ color: "#6b7280" }}>{stop.note}</small>}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                  <button className="primary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => checkInRouteTaskStop(task, stop.id)}>✓ เช็คอิน</button>
                                  <label className="secondary" style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    📷 ถ่ายรูป
                                    <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) uploadRouteTaskPhoto(task, stop.id, file);
                                      e.target.value = "";
                                    }} />
                                  </label>
                                </div>
                                {(stop.photo || stop.checkedInAt) && (
                                  <button className="primary" style={{ padding: "8px", fontSize: "12px", background: "#2563eb" }} onClick={() => shareRouteTaskStopToLine(task, stop)}>
                                    💬 แชร์ LINE จุดนี้
                                  </button>
                                )}
                                {stop.photo && (
                                  <div style={{ borderRadius: "6px", overflow: "hidden", border: "1px solid #e5e7eb" }}>
                                    <img src={stop.photo} alt="route check-in" style={{ width: "100%", height: "auto" }} />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <button className="secondary" style={{ padding: "9px", fontSize: "12px", background: "#f0fdf4", color: "#166534" }} onClick={() => completeRouteTask(task)}>✅ จบงานวิ่ง</button>
                        </div>
                      );
                    })}
                  </div>
                )}
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

                        {order.salesNote && (
                          <div style={{ background: "#fff7ed", padding: "8px", borderRadius: "6px", border: "1px solid #fdba74" }}>
                            <small style={{ color: "#9a3412", display: "block", fontWeight: "bold" }}>📝 หมายเหตุจากฝ่ายขาย</small>
                            <small style={{ color: "#7c2d12", display: "block", whiteSpace: "pre-wrap" }}>{order.salesNote}</small>
                          </div>
                        )}
                        
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
                            const driverName = drivers.find(d => d.id === driverId)?.name || state.auth?.name || "";
                            updateOrder(order.id, { driverId, driverName, status: "กำลังส่ง" });
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
	                                updateOrder(order.id, { status: "กำลังจัดส่ง", checkInAt: new Date().toLocaleString("th-TH") });
	                                recordDriverCheckInLocation(order);
	                                setSyncStatus(`✅ ถึงจุดหมายแล้ว ออเดอร์ "${order.id}"`);
	                              }}>🚗 ไปถึงแล้ว</button>
	                            <button 
	                              className="secondary" 
	                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} 
	                              disabled={false}
	                              onClick={() => {
	                                const reason = prompt("📝 เหตุผลในการยกเลิก/เลื่อนส่ง:");
	                                if (reason) {
	                                  updateOrder(order.id, { status: "รอคนขับรับ", driverId: "", driverName: "", complaint: reason, sharedToLine: false });
	                                  setSyncStatus(`⏳ ส่งออเดอร์ "${order.id}" กลับเข้าคิวอีกครั้ง`);
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
	                                const reason = prompt("📝 เหตุผลในการยกเลิก/เลื่อนส่ง:");
	                                if (reason) {
	                                  updateOrder(order.id, { status: "รอคนขับรับ", driverId: "", driverName: "", complaint: reason, photo: "", sharedToLine: false });
	                                }
	                              }}>❌ ยกเลิก</button>
                          </>
                        )}
	                        {order.status === "กำลังจัดส่ง" && order.photo && !order.sharedToLine && (
	                          <button
	                            className="primary"
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#2563eb" }}
	                            onClick={() => shareOrderToLine(order)}
	                          >✅ ส่งสำเร็จ + แชร์สรุป (LINE)</button>
	                        )}
	                        {order.status === "กำลังจัดส่ง" && order.photo && order.sharedToLine && (
	                          <button 
	                            className="primary" 
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669" }} 
	                            disabled={false}
	                            onClick={() => {
	                              updateOrder(order.id, { status: "ส่งสำเร็จ", deliveredAt: new Date().toLocaleString("th-TH"), driverName: order.driverName || state.auth?.name || "", driverId: order.driverId || state.auth?.driverId || driverId || "" });
	                              setSyncStatus(`✅ ส่งออเดอร์ "${order.id}" สำเร็จแล้ว`);
	                            }}>✅ ส่งสำเร็จแล้ว</button>
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

	            {/* สรุป/ประวัติส่งสำเร็จประจำวัน */}
	            {(driverTodayCompletedOrders.length > 0 || driverTodayCompletedRouteTasks.length > 0 || orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").length > 0) && (
	              <section className="panel" style={{ background: "#f8fafc" }}>
	                <div className="panel-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
	                  <div>
	                    <h2 style={{ margin: 0 }}>✅ ประวัติส่งสำเร็จวันนี้</h2>
	                    <span>ออเดอร์ {driverTodayCompletedOrders.length} · งานวิ่ง {driverTodayCompletedRouteTasks.length}</span>
	                  </div>
	                  <button className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setShowDeliveredHistory(v => !v)}>
	                    {showDeliveredHistory ? "ซ่อนย้อนหลัง" : "ดูย้อนหลัง"}
	                  </button>
	                </div>
	                {(() => {
	                  const deliveredAll = orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").slice().sort((a, b) => {
	                    const av = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
	                    const bv = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
	                    if (bv !== av) return bv - av;
	                    return String(b.id || "").localeCompare(String(a.id || ""));
	                  });
	                  const deliveredToday = deliveredAll.filter(isTodayOrder);
	                  const deliveredHistory = deliveredAll.filter(o => !isTodayOrder(o));
	                  const codAll = deliveredAll.reduce((sum, o) => sum + Number(o.cod || 0), 0);
	                  return (
	                    <div style={{ color: "#6b7280", fontSize: "12px" }}>
	                      วันนี้ {deliveredToday.length + driverTodayCompletedRouteTasks.length} งาน · ย้อนหลัง {deliveredHistory.length} งาน · รวม COD ออเดอร์ ฿{money(codAll)}
	                    </div>
	                  );
	                })()}

	                {(() => {
	                  const deliveredAll = orders.filter(o => o.driverId === driverId && o.status === "ส่งสำเร็จ").slice().sort((a, b) => {
	                    const av = new Date(a.updatedAt || a.createdAt || 0).getTime() || 0;
	                    const bv = new Date(b.updatedAt || b.createdAt || 0).getTime() || 0;
	                    if (bv !== av) return bv - av;
	                    return String(b.id || "").localeCompare(String(a.id || ""));
	                  });
	                  const deliveredToday = deliveredAll.filter(isTodayOrder);
	                  const deliveredHistory = deliveredAll.filter(o => !isTodayOrder(o));
	                  const visibleDelivered = showDeliveredHistory ? [...deliveredToday, ...deliveredHistory] : deliveredToday;
	                  const visibleRouteTasks = driverTodayCompletedRouteTasks;
	                  return (
	                  <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                    {visibleDelivered.length === 0 && visibleRouteTasks.length === 0 && (
	                      <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #e5e7eb", color: "#6b7280", fontSize: "12px" }}>
	                        ยังไม่มีรายการส่งสำเร็จในวันนี้
	                      </div>
	                    )}
	                    {visibleDelivered.map(order => (
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
	                            💬 แชร์สรุปสั้น (LINE)
	                          </button>
	                        </div>
	                      ))}
	                    {visibleRouteTasks.map(task => (
	                      <div key={task.id} style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #bfdbfe", display: "flex", flexDirection: "column", gap: "8px" }}>
	                        <div>
	                          <b style={{ fontSize: "14px", display: "block", color: "#166534" }}>{task.id}</b>
	                          <b style={{ fontSize: "15px", display: "block", color: "#111827" }}>{task.type === "long" ? "งานวิ่งไกล" : "งานวิ่งสาขา"}{task.routeDirection === "return" ? " · ขากลับเชียงใหม่" : task.type === "long" ? " · ขาไป" : ""}</b>
	                          <small style={{ color: "#6b7280" }}>{task.origin || "-"} → {task.destinationSummary || "-"}</small><br/>
	                          {task.completedAt && <small style={{ color: "#16a34a", fontWeight: "bold" }}>✅ {task.completedAt}</small>}
	                        </div>
	                        {(task.stops || []).length > 0 && (
	                          <div style={{ display: "grid", gap: "4px", color: "#6b7280", fontSize: "12px" }}>
	                            {(task.stops || []).map(stop => (
	                              <small key={stop.id}>
	                                {stop.kind === "midway" ? "เช็คอินระหว่างทาง" : stop.name || "-"}{stop.checkedInAt ? ` · ${stop.checkedInAt}` : ""}{stop.sharedToLine ? " · แชร์ LINE แล้ว" : ""}
	                              </small>
	                            ))}
	                          </div>
	                        )}
	                        <button className="primary" style={{ padding: "8px", fontSize: "12px", background: "#2563eb" }} onClick={() => copyToClipboard(buildLineMessageForRouteTask(task, { name: task.destinationSummary, checkedInAt: task.completedAt, note: task.note }))}>
	                          💬 คัดลอกสรุปงานวิ่ง
	                        </button>
	                      </div>
	                    ))}
	                  </div>
	                  );
	                })()}
	              </section>
	            )}

            {driverOrders.length === 0 && driverRouteTasks.length === 0 && (
              <section className="panel" style={{ background: "#f3f4f6", textAlign: "center", padding: "32px 16px" }}>
                <p style={{ fontSize: "32px", margin: "0" }}>😴</p>
                <p style={{ color: "#666", margin: "8px 0 0" }}>ยังไม่มีออเดอร์ ลองรีเฟรช</p>
              </section>
            )}
          </div>
        )}

        {auth.role === "driver" && displayTab === "driver-vehicle" && (
          <div style={{ display: "grid", gap: "14px" }}>
            <section className="panel" style={{ borderLeft: "4px solid #2563eb" }}>
              <div className="panel-head">
                <h2>รถที่ใช้วันนี้</h2>
                <span>{todayServiceDate}</span>
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", display: "grid", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <b style={{ display: "block", color: "#111827" }}>{vehicleDisplayName(selectedDriverVehicle)}</b>
                      <small style={{ color: "#6b7280" }}>
                        {selectedDriverVehicle?.assetCode || "-"} · ผู้รับผิดชอบ {selectedDriverVehicle?.responsiblePerson || "-"} · {selectedDriverVehicle?.department || "-"}
                      </small>
                    </div>
                    <button type="button" className="secondary" style={{ padding: "8px 10px", fontSize: "12px" }} onClick={() => setShowDriverVehiclePicker(v => !v)}>
                      {showDriverVehiclePicker ? "ปิดรายการรถ" : "เปลี่ยนรถวันนี้"}
                    </button>
                  </div>
                  {!selectedDriverVehicleIsDefault && (
                    <small style={{ color: "#92400e", fontWeight: 800 }}>วันนี้ใช้รถคนละคันกับรถประจำ ระบบจะบันทึกไว้ในรายงาน</small>
                  )}
                  {showDriverVehiclePicker && (
                    <div style={{ display: "grid", gap: "8px" }}>
                      <select
                        value={selectedDriverVehicleId}
                        onChange={e => {
                          setDriverVehicleId(e.target.value);
                          setDriverVehicleChangedToday(true);
                        }}
                      >
                        {HILLKOFF_VEHICLES.map(vehicle => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {vehicle.plate} · {vehicle.brand} {vehicle.model} · {vehicle.responsiblePerson}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: "7px 10px", fontSize: "12px", width: "fit-content" }}
                        onClick={() => {
                          if (defaultDriverVehicle?.id) {
                            setDriverVehicleId(defaultDriverVehicle.id);
                            setDriverVehicleChangedToday(false);
                          }
                        }}
                      >
                        กลับไปรถประจำ
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="field-label">เลขไมล์เริ่มต้นวันนี้</label>
                  <input
                    value={driverOdometerStart}
                    onChange={e => setDriverOdometerStart(formatWithCommas(e.target.value))}
                    inputMode="numeric"
                    placeholder="เช่น 120,500"
                  />
                  <small className="muted" style={{ display: "block", marginTop: "6px" }}>เลขไมล์นี้จะใช้คู่กับแบบประเมินตรวจรถประจำวัน</small>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "10px" }}>
                    <button type="button" className="primary" onClick={submitDailyVehicleStart} disabled={dailyVehicleStartSubmitting}>
                      <CheckCircle2 size={16} /> {dailyVehicleStartSubmitting ? "กำลังบันทึก..." : "เริ่มใช้รถวันนี้"}
                    </button>
                    {dailyVehicleStartSaved && <span style={{ color: "#166534", fontWeight: 800, fontSize: "12px" }}>บันทึกเริ่มต้นวันนี้แล้ว</span>}
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>บันทึกเลขไมล์ระหว่างวัน</h2>
                <span>บันทึกเป็นช่วงการใช้งาน</span>
              </div>
              <div className="form-grid two">
                <input
                  value={vehicleUsageForm.odometer}
                  onChange={e => setVehicleUsageForm(p => ({ ...p, odometer: formatWithCommas(e.target.value) }))}
                  inputMode="numeric"
                  placeholder="เลขไมล์ปัจจุบัน"
                />
                <select value={vehicleUsageForm.usageType} onChange={e => setVehicleUsageForm(p => ({ ...p, usageType: e.target.value }))}>
                  <option value="ส่งของ">ส่งของ</option>
                  <option value="งานวิ่งสาขา">งานวิ่งสาขา</option>
                  <option value="งานวิ่งไกล">งานวิ่งไกล</option>
                  <option value="เติมน้ำมัน">เติมน้ำมัน</option>
                  <option value="เข้าซ่อม/ตรวจเช็ค">เข้าซ่อม/ตรวจเช็ค</option>
                  <option value="รับของ">รับของ</option>
                  <option value="ธุระบริษัท">ธุระบริษัท</option>
                  <option value="อื่น ๆ">อื่น ๆ</option>
                </select>
              </div>
              <textarea
                value={vehicleUsageForm.detail}
                onChange={e => setVehicleUsageForm(p => ({ ...p, detail: e.target.value }))}
                rows={2}
                placeholder="รายละเอียดการใช้งาน เช่น กลับสาขา / ส่งโซนแม่ริม / รับของโรงงาน"
                style={{ marginTop: "10px" }}
              />
              <textarea
                value={vehicleUsageForm.note}
                onChange={e => setVehicleUsageForm(p => ({ ...p, note: e.target.value }))}
                rows={2}
                placeholder="หมายเหตุเพิ่มเติม"
                style={{ marginTop: "10px" }}
              />
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button type="button" className="primary" onClick={() => submitVehicleUsageEvent("segment")} disabled={vehicleUsageSubmitting}>
                  <FileText size={16} /> {vehicleUsageSubmitting ? "กำลังบันทึก..." : "บันทึกช่วงการใช้รถ"}
                </button>
                {vehicleUsageStatus && (
                  <span style={{ color: vehicleUsageStatus.startsWith("✅") ? "#166534" : vehicleUsageStatus.startsWith("⏳") ? "#1d4ed8" : "#b91c1c", fontWeight: 800, fontSize: "12px" }}>
                    {vehicleUsageStatus}
                  </span>
                )}
              </div>
            </section>

            <section className="panel" style={{ borderLeft: "4px solid #0f766e" }}>
              <div className="panel-head">
                <h2>จบการใช้รถวันนี้</h2>
                <span>{driverOdometerStart ? `เริ่ม ${driverOdometerStart}` : "ยังไม่มีเลขไมล์เริ่มต้น"}</span>
              </div>
              <div className="form-grid two">
                <input
                  value={vehicleEndForm.odometer}
                  onChange={e => setVehicleEndForm(p => ({ ...p, odometer: formatWithCommas(e.target.value) }))}
                  inputMode="numeric"
                  placeholder="เลขไมล์สิ้นสุด"
                />
                <input
                  value={vehicleEndForm.summary}
                  onChange={e => setVehicleEndForm(p => ({ ...p, summary: e.target.value }))}
                  placeholder="สรุปการใช้งานวันนี้"
                />
              </div>
              <textarea
                value={vehicleEndForm.note}
                onChange={e => setVehicleEndForm(p => ({ ...p, note: e.target.value }))}
                rows={2}
                placeholder="หมายเหตุหลังใช้งาน / ปัญหารถที่พบ"
                style={{ marginTop: "10px" }}
              />
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button type="button" className="secondary" onClick={() => submitVehicleUsageEvent("end")} disabled={vehicleUsageSubmitting}>
                  <CheckCircle2 size={16} /> {vehicleUsageSubmitting ? "กำลังบันทึก..." : "จบการใช้รถวันนี้"}
                </button>
              </div>
            </section>

            <section className="panel" style={{ borderLeft: "4px solid #16a34a" }}>
              <div className="panel-head">
                <h2>บันทึกบิลน้ำมัน</h2>
                <span>{vehicleDisplayName(selectedDriverVehicle)}</span>
              </div>
              <div className="form-grid two">
                <input
                  value={fuelBillForm.odometer}
                  onChange={e => setFuelBillForm(p => ({ ...p, odometer: formatWithCommas(e.target.value) }))}
                  inputMode="numeric"
                  placeholder="เลขไมล์ตอนเติม"
                />
                <select value={fuelBillForm.fuelType} onChange={e => setFuelBillForm(p => ({ ...p, fuelType: e.target.value }))}>
                  <option value="ดีเซล">ดีเซล</option>
                  <option value="เบนซิน">เบนซิน</option>
                  <option value="แก๊สโซฮอล์">แก๊สโซฮอล์</option>
                  <option value="อื่น ๆ">อื่น ๆ</option>
                </select>
                <input value={fuelBillForm.liters} onChange={e => setFuelBillForm(p => ({ ...p, liters: e.target.value }))} inputMode="decimal" placeholder="จำนวนลิตร" />
                <input value={fuelBillForm.amount} onChange={e => setFuelBillForm(p => ({ ...p, amount: e.target.value }))} inputMode="decimal" placeholder="ยอดเงิน" />
                <input value={fuelBillForm.pricePerLiter} onChange={e => setFuelBillForm(p => ({ ...p, pricePerLiter: e.target.value }))} inputMode="decimal" placeholder="ราคาต่อลิตร (ไม่กรอกได้)" />
                <input value={fuelBillForm.station} onChange={e => setFuelBillForm(p => ({ ...p, station: e.target.value }))} placeholder="ปั๊มน้ำมัน" />
                <input value={fuelBillForm.receiptNo} onChange={e => setFuelBillForm(p => ({ ...p, receiptNo: e.target.value }))} placeholder="เลขที่บิล" />
              </div>
              <textarea
                value={fuelBillForm.note}
                onChange={e => setFuelBillForm(p => ({ ...p, note: e.target.value }))}
                rows={2}
                placeholder="หมายเหตุบิลน้ำมัน"
                style={{ marginTop: "10px" }}
              />
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button type="button" className="primary" onClick={submitFuelBill} disabled={fuelBillSubmitting}>
                  <FileSpreadsheet size={16} /> {fuelBillSubmitting ? "กำลังบันทึก..." : "บันทึกบิลน้ำมัน"}
                </button>
                {fuelBillStatus && (
                  <span style={{ color: fuelBillStatus.startsWith("✅") ? "#166534" : fuelBillStatus.startsWith("⏳") ? "#1d4ed8" : "#b91c1c", fontWeight: 800, fontSize: "12px" }}>
                    {fuelBillStatus}
                  </span>
                )}
              </div>
            </section>
          </div>
        )}

        {auth.role !== "driver" && displayTab === "driver-sop-report" && (
          <div style={{ display: "grid", gap: "14px" }}>
            {(() => {
              const completed = driverAssessmentRoster.filter(driver => todayAssessmentByDriver.has(driver.id));
              const missing = driverAssessmentRoster.filter(driver => !todayAssessmentByDriver.has(driver.id));
              const completeRate = driverAssessmentRoster.length ? Math.round((completed.length / driverAssessmentRoster.length) * 100) : 0;
              return (
                <>
                  <section className="panel" style={{ background: missing.length ? "#fff7ed" : "#f0fdf4", borderLeft: `4px solid ${missing.length ? "#f97316" : "#22c55e"}` }}>
                    <div className="panel-head">
                      <h2>สรุปแบบประเมินตรวจรถวันนี้</h2>
                      <span>{todayServiceDate}</span>
                    </div>
                    <div className="analytics-cards">
                      <div><span>ทำแล้ว</span><b>{completed.length}/{driverAssessmentRoster.length}</b></div>
                      <div><span>ครบถ้วน</span><b>{completeRate}%</b></div>
                    </div>
                    <p className="muted" style={{ margin: "10px 0 0" }}>
                      รายชื่ออ้างอิงจากคนขับที่พบในระบบ, งานจัดส่ง, ตำแหน่งล่าสุด และแบบประเมินที่ส่งเข้ามา
                    </p>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                      <button className="secondary" onClick={() => exportDriverAssessmentReport("copy")}>คัดลอกรายงาน</button>
                      <button className="primary" onClick={() => exportDriverAssessmentReport("download")}><Download size={16} /> ดาวน์โหลด TXT</button>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>ทำแบบประเมินแล้ว</h2>
                      <span>{completed.length} คน</span>
                    </div>
                    <div className="dispatch-table">
                      {completed.length === 0 ? (
                        <div className="empty">ยังไม่มีคนขับส่งแบบประเมินวันนี้</div>
                      ) : completed.map(driver => {
                        const assessment = todayAssessmentByDriver.get(driver.id) || {};
                        return (
                          <div key={driver.id} className="dispatch-row" style={{ gridTemplateColumns: "1fr 0.8fr 1.2fr 0.9fr 1.3fr" }}>
                            <div><b>{driver.name || driver.id}</b><span>{driver.phone || "-"}</span></div>
                            <span>{assessment.readiness === "ready" ? "พร้อมใช้งาน" : "ส่งแบบแล้ว"}</span>
                            <span>{assessment.plate ? `${assessment.plate} · ${assessment.brand || ""} ${assessment.model || ""}` : "-"}</span>
                            <span>{assessment.odometerStart ? `เลขไมล์ ${money(assessment.odometerStart)}` : "ยังไม่มีเลขไมล์"}</span>
                            <span>{assessment.notes || "ไม่มีหมายเหตุ"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-head">
                      <h2>ยังไม่ได้ทำ</h2>
                      <span>{missing.length} คน</span>
                    </div>
                    <div className="dispatch-table">
                      {missing.length === 0 ? (
                        <div className="empty">ครบทุกคนแล้ว</div>
                      ) : missing.map(driver => (
                        <div key={driver.id} className="dispatch-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                          <div><b>{driver.name || driver.id}</b><span>{driver.phone || "-"}</span></div>
                          <span>{driver.plate || "-"}</span>
                          <span>{driver.zone || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              );
            })()}
          </div>
        )}

        {auth.role === "driver" && displayTab === "driver-sop" && (
          <div style={{ display: "grid", gap: "14px" }}>
            <section className="panel" style={{ background: "#fff7ed", borderLeft: "4px solid #f97316" }}>
              <div className="panel-head">
                <h2>ประกาศสำคัญก่อนเริ่มงาน</h2>
                <span>SOP ประจำวัน</span>
              </div>
              <p style={{ margin: 0, color: "#9a3412", fontWeight: 800 }}>
                ก่อนออกงานทุกเช้า คนขับต้องตรวจสภาพรถและบันทึกแบบประเมินให้ครบ หากพบความผิดปกติให้หยุดใช้รถและแจ้งทันที ห้ามฝืนใช้งานรถที่ไม่พร้อมหรือไม่ปลอดภัย
              </p>
              <div style={{ display: "grid", gap: "6px", marginTop: "10px" }}>
                {DRIVER_MORNING_NOTICE.map(item => (
                  <div key={item} style={{ display: "flex", gap: "8px", alignItems: "flex-start", color: "#7c2d12", fontSize: "13px", fontWeight: 700 }}>
                    <CheckCircle2 size={15} style={{ flex: "0 0 auto", marginTop: "1px" }} /> <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>แบบประเมินตรวจรถประจำวัน</h2>
                <span>{todayServiceDate}</span>
              </div>
              {selectedDriverVehicle?.id && driverOdometerStart ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", padding: "10px 12px", marginBottom: "12px", color: "#166534", fontSize: "13px", fontWeight: 800 }}>
                  รถวันนี้: {vehicleDisplayName(selectedDriverVehicle)} · เลขไมล์เริ่ม {driverOdometerStart}
                </div>
              ) : (
                <div style={{ background: "#fef9c3", border: "1px solid #facc15", borderRadius: "8px", padding: "10px 12px", marginBottom: "12px", color: "#854d0e", fontSize: "13px", fontWeight: 800, display: "flex", gap: "10px", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <span>กรุณาบันทึกรถที่ใช้และเลขไมล์เริ่มต้นในแถบ บันทึกการใช้รถ ก่อนส่งแบบประเมิน</span>
                  <button type="button" className="secondary" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setTab("driver-vehicle")}>ไปบันทึกการใช้รถ</button>
                </div>
              )}
              <div style={{ display: "grid", gap: "8px" }}>
                {DRIVER_DAILY_CHECK_ITEMS.map(item => (
                  <label key={item.id} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: "10px", alignItems: "start", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px", background: driverDailyChecks[item.id] ? "#f0fdf4" : "#fff" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(driverDailyChecks[item.id])}
                      onChange={e => setDriverDailyChecks(prev => ({ ...prev, [item.id]: e.target.checked }))}
                      style={{ width: "18px", height: "18px", marginTop: "2px" }}
                    />
                    <span>
                      <b style={{ display: "block" }}>{item.label}</b>
                      <small style={{ color: "#6b7280" }}>{item.detail}</small>
                    </span>
                  </label>
                ))}
              </div>

              <div style={{ marginTop: "12px" }}>
                <label className="field-label">หมายเหตุอาการผิดปกติ / รายละเอียดที่ต้องแจ้งซ่อม</label>
                <textarea
                  value={driverAssessmentNotes}
                  onChange={e => setDriverAssessmentNotes(e.target.value)}
                  rows={3}
                  placeholder="เช่น มีคราบน้ำมันใต้เครื่อง, ไฟเตือนขึ้น, ยางหน้าซ้ายลมอ่อน"
                />
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button type="button" className="primary" onClick={submitDriverDailyAssessment} disabled={driverAssessmentSubmitting}>
                  <CheckCircle2 size={16} /> {driverAssessmentSubmitting ? "กำลังบันทึก..." : "บันทึกแบบประเมินวันนี้"}
                </button>
                {driverAssessmentStatus && (
                  <span style={{ color: driverAssessmentStatus.startsWith("✅") ? "#166534" : driverAssessmentStatus.startsWith("⏳") ? "#1d4ed8" : "#b91c1c", fontWeight: 800, fontSize: "12px" }}>
                    {driverAssessmentStatus}
                  </span>
                )}
              </div>
            </section>

            <section className="panel" style={{ background: "#f8fafc" }}>
              <div className="panel-head">
                <h2>ดูแลรักษารถระหว่างวัน</h2>
                <span>ข้อควรจำสั้น ๆ</span>
              </div>
              <div className="report-lines">
                {DRIVER_CARE_BASICS.map(item => <p key={item}>• {item}</p>)}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>หน้าที่และความรับผิดชอบ</h2>
                <span>ตั้งแต่ก่อนใช้งานถึงหลังซ่อม</span>
              </div>
              <div className="report-lines">
                {DRIVER_RESPONSIBILITIES.map(item => <p key={item}>• {item}</p>)}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>รายการตรวจเช็คประจำสัปดาห์</h2>
                <span>ตรวจทุก 7 วัน</span>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {DRIVER_WEEKLY_CHECK_ITEMS.map((item, index) => (
                  <label key={item} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: "10px", alignItems: "start", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(driverWeeklyChecks[index])}
                      onChange={e => setDriverWeeklyChecks(prev => ({ ...prev, [index]: e.target.checked }))}
                      style={{ width: "18px", height: "18px", marginTop: "2px" }}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <button type="button" className="secondary" onClick={submitDriverWeeklyAssessment} disabled={driverAssessmentSubmitting}>
                  <CheckCircle2 size={16} /> {driverAssessmentSubmitting ? "กำลังบันทึก..." : "บันทึกแบบประเมินรายสัปดาห์"}
                </button>
                <span className="muted" style={{ fontSize: "12px" }}>กดบันทึกหลังตรวจครบทุกข้อ</span>
                {driverAssessmentStatus && (
                  <span style={{ color: driverAssessmentStatus.startsWith("✅") ? "#166534" : driverAssessmentStatus.startsWith("⏳") ? "#1d4ed8" : "#b91c1c", fontWeight: 800, fontSize: "12px" }}>
                    {driverAssessmentStatus}
                  </span>
                )}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>จุดสังเกตขณะขับขี่</h2>
                <span>ความปลอดภัยก่อนความเร็ว</span>
              </div>
              <div className="report-lines">
                {DRIVER_PRECAUTIONS.map(item => <p key={item}>• {item}</p>)}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>ขั้นตอนแจ้งซ่อม</h2>
                <span>รายงานเป็นลำดับ</span>
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {DRIVER_REPAIR_STEPS.map((step, index) => (
                  <div key={step} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: "10px", alignItems: "start", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px", background: "#f8fafc" }}>
                    <b style={{ width: "28px", height: "28px", borderRadius: "999px", background: "#176b3a", color: "#fff", display: "grid", placeItems: "center" }}>{index + 1}</b>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ margin: "12px 0 0" }}>สัญลักษณ์มาตรฐาน: I=ตรวจสอบ, A=ปรับตั้ง, R=เปลี่ยนใหม่, T=กวดขันให้แน่น, L=หล่อลื่น</p>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2>ตารางบำรุงรักษาตามระยะ</h2>
                <span>แจ้งเปลี่ยนตามกำหนด</span>
              </div>
              <div className="dispatch-table">
                <div className="dispatch-head" style={{ gridTemplateColumns: "1.2fr 0.8fr 1fr" }}>
                  <span>รายการ</span><span>ระยะ</span><span>หมายเหตุ</span>
                </div>
                {DRIVER_MAINTENANCE_SCHEDULE.map(([name, interval, note]) => (
                  <div key={name} className="dispatch-row" style={{ gridTemplateColumns: "1.2fr 0.8fr 1fr" }}>
                    <b>{name}</b>
                    <span>{interval}</span>
                    <span>{note}</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ margin: "12px 0 0" }}>รถใช้งานหนัก ทางขรุขระ ฝุ่นมาก หรือลากพ่วงบ่อย ให้แจ้งตรวจเร็วกว่าระยะมาตรฐาน</p>
            </section>
          </div>
        )}

        {displayTab === "reports" && (
          <div className="report-grid">
            <section className="panel daily-report-panel">
              <div className="panel-head report-panel-head">
                <div>
                  <h2>รายงานประจำวัน</h2>
                  <span>แยกตามวัน</span>
                </div>
                <button className="secondary compact-btn" onClick={() => exportSelectedServiceReport("download")}>
                  <Download size={14} /> ส่งออกรายงาน
                </button>
              </div>
              <div className="report-export-controls">
                <select value={reportExportMode} onChange={e => setReportExportMode(e.target.value)}>
                  <option value="single">เลือกวันที่</option>
                  <option value="range">เลือกช่วงวันที่</option>
                </select>
                {reportExportMode === "range" ? (
                  <>
                    <input type="date" value={reportExportStartDate} onChange={e => setReportExportStartDate(e.target.value)} />
                    <input type="date" value={reportExportEndDate} onChange={e => setReportExportEndDate(e.target.value)} />
                  </>
                ) : (
                  <input type="date" value={reportExportDate} onChange={e => setReportExportDate(e.target.value)} />
                )}
                <button className="secondary compact-btn" onClick={() => exportSelectedServiceReport("copy")}>คัดลอก</button>
                <button className="secondary compact-btn" onClick={() => exportSelectedServiceReport("download")}>TXT</button>
              </div>
              {ordersByServiceDate.keys.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>ยังไม่มีข้อมูลรายงาน</p>
              ) : (
                <div className="daily-report-scroll">
                  {(() => {
                    const selectedKey = openReportDate || ordersByServiceDate.keys[0] || "";
                    const list = ordersByServiceDate.groups[selectedKey] || [];
                    const stats = summarizeOrders(list);
                    const selectedDate = parseServiceDateKey(selectedKey);
                    const selectedTitle = selectedDate ? selectedDate.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) : selectedKey;
                    return (
                      <div className="daily-accordion open">
                        <div className="daily-accordion-trigger">
                          <select
                            className="daily-title"
                            value={selectedKey}
                            onChange={(e) => {
                              setOpenReportDate(e.target.value);
                              setReportExportDate(e.target.value);
                            }}
                            aria-label="เลือกวันที่รายงาน"
                          >
                            {ordersByServiceDate.keys.map((k) => {
                              const dt = parseServiceDateKey(k);
                              const title = dt ? dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" }) : k;
                              return <option key={k} value={k}>{title}</option>;
                            })}
                          </select>
                          <span className="daily-meta">{stats.total} งาน</span>
                          <span className="daily-cod">COD ฿{money(stats.cod)}</span>
                          <ChevronDown className="daily-chevron" size={16} />
                        </div>

                        <div className="daily-accordion-body">
                          <b>{selectedTitle}</b>
                          <div className="status-chip-row">
                            <span className="status-chip waiting">รอรับ <b>{stats.waiting}</b></span>
                            <span className="status-chip active">กำลังส่ง <b>{stats.active}</b></span>
                            <span className="status-chip done">สำเร็จ <b>{stats.done}</b></span>
                          </div>
                          <div className="daily-actions">
                            <span>สำเร็จ {stats.completionRate}% · COD สำเร็จ ฿{money(stats.codDone)}</span>
                            <div>
                              <button className="secondary compact-btn" onClick={() => exportServiceDateReport(selectedKey, "copy")}>คัดลอก</button>
                              <button className="secondary compact-btn" onClick={() => exportServiceDateReport(selectedKey, "download")}>TXT</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
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
              <div className="panel-head"><h2>ปัญหาและการร้องเรียน</h2><span>{report.complaints.length} รายการ</span></div>
              {report.complaints.length === 0 ? <div className="empty"><MessageSquareWarning size={22} /> ยังไม่มีรายการร้องเรียน</div> : report.complaints.map(order => (
                <div key={order.id} className="complaint-card">
                  <b>{order.customerName}</b>
                  <small style={{ color: "#6b7280", display: "block", marginTop: "4px" }}>คนขับ: {order.driverName || drivers.find(driver => driver.id === order.driverId)?.name || "ยังไม่ระบุ"}</small>
                  <p>{order.complaint || order.status || "ติดปัญหา"}</p>
                  <span>{order.id}</span>
                </div>
              ))}
            </section>

            <section className="panel analytics-panel">
              <div className="panel-head"><h2>วิเคราะห์ภาพรวม</h2><span>วันนี้</span></div>
              <div className="analytics-cards">
                <div><span>งานวันนี้</span><b>{todaySummary.total}</b></div>
                <div><span>สำเร็จ</span><b>{todaySummary.done}</b></div>
                <div><span>COD รวม</span><b>฿{money(todaySummary.cod)}</b></div>
                <div><span>สำเร็จ</span><b>{todaySummary.completionRate}%</b></div>
              </div>
              <div className="status-bar">
                <span className="waiting" style={{ flexGrow: todaySummary.waiting || 0 }} title={`รอรับ ${todaySummary.waiting}`} />
                <span className="active" style={{ flexGrow: todaySummary.active || 0 }} title={`กำลังส่ง ${todaySummary.active}`} />
                <span className="done" style={{ flexGrow: todaySummary.done || 0 }} title={`สำเร็จ ${todaySummary.done}`} />
              </div>
              <div className="status-legend">
                <span><i className="waiting" /> รอรับ {todaySummary.waiting}</span>
                <span><i className="active" /> กำลังส่ง {todaySummary.active}</span>
                <span><i className="done" /> สำเร็จ {todaySummary.done}</span>
              </div>
            </section>

            <section className="panel analytics-panel monthly-analytics">
              <div className="panel-head"><h2>วิเคราะห์รายเดือน</h2><span>{currentMonthKey}</span></div>
              <div className="analytics-cards">
                <div><span>งานเดือนนี้</span><b>{monthAnalytics.summary.total}</b></div>
                <div><span>เฉลี่ย/วัน</span><b>{monthAnalytics.avgDailyOrders}</b></div>
                <div><span>COD เดือน</span><b>฿{money(monthAnalytics.summary.cod)}</b></div>
                <div><span>สำเร็จ</span><b>{monthAnalytics.summary.completionRate}%</b></div>
              </div>
              <div className="monthly-chart" aria-label="กราฟจำนวนงานรายวันของเดือนนี้">
                {monthAnalytics.days.length === 0 ? (
                  <p className="muted">ยังไม่มีข้อมูลเดือนนี้</p>
                ) : monthAnalytics.days.slice().reverse().map((day) => {
                  const dt = parseServiceDateKey(day.key);
                  const label = dt ? dt.toLocaleDateString("th-TH", { day: "2-digit", month: "short", timeZone: "Asia/Bangkok" }) : day.key.slice(5);
                  const height = Math.max(8, Math.round((day.total / monthAnalytics.maxDailyTotal) * 92));
                  return (
                    <div key={day.key} className="month-bar-item">
                      <div className="month-bar-track"><span style={{ height: `${height}%` }} /></div>
                      <small>{label}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

	        {displayTab === "settings" && (
	          <div className="settings-grid">
		            <section className="panel">
		              <div className="panel-head"><h2>📋 ส่งออกรายงานสรุปภาพรวม</h2><span>ทั้งหมด</span></div>
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
		                const todayOrders = todayOrdersOnly;
		                const total = todayOrders.length;
		                const waiting = todayOrders.filter(o => o.status === "รอคนขับรับ").length;
		                const active = todayOrders.filter(o => o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง").length;
		                const done = todayOrders.filter(o => o.status === "ส่งสำเร็จ").length;
		                const canceled = todayOrders.filter(o => o.status === "ยกเลิก").length;
		                const codAll = todayOrders.reduce((sum, o) => sum + Number(o.cod || 0), 0);
		                const codDone = todayOrders.filter(o => o.status === "ส่งสำเร็จ").reduce((sum, o) => sum + Number(o.cod || 0), 0);
		                const now = new Date();
		                const weekStart = new Date(now);
		                weekStart.setHours(0, 0, 0, 0);
		                // Monday start (local)
		                const day = weekStart.getDay(); // 0..6 (Sun..Sat)
		                const diffToMon = (day + 6) % 7;
		                weekStart.setDate(weekStart.getDate() - diffToMon);
		                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		                const yearStart = new Date(now.getFullYear(), 0, 1);

		                const isOnOrAfter = (d, start) => d && d.getTime() >= start.getTime();
		                const byRange = (start) => (orders || []).filter((o) => {
		                  const key = String(o?.serviceDate || "");
		                  const d = parseServiceDateKey(key);
		                  if (!d) return false;
		                  // compare in local by converting UTC date to local midnight-ish
		                  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
		                  return isOnOrAfter(local, start);
		                });
		                const weekOrders = byRange(weekStart);
		                const monthOrders = byRange(monthStart);
		                const yearOrders = byRange(yearStart);
		                const sumBlock = (list) => ({
		                  total: list.length,
		                  done: list.filter((o) => o.status === "ส่งสำเร็จ").length,
		                  cod: list.reduce((sum, o) => sum + Number(o.cod || 0), 0),
		                });
		                const weekSum = sumBlock(weekOrders);
		                const monthSum = sumBlock(monthOrders);
		                const yearSum = sumBlock(yearOrders);
		                const completedAssessments = driverAssessmentRoster.filter(driver => todayAssessmentByDriver.has(driver.id));
		                const missingAssessments = driverAssessmentRoster.filter(driver => !todayAssessmentByDriver.has(driver.id));
		                const assessmentRate = driverAssessmentRoster.length ? Math.round((completedAssessments.length / driverAssessmentRoster.length) * 100) : 0;
		                const issueOrders = todayOrders.filter(o => o.status === "ติดปัญหา" || o.complaint);
		                const dailyFollowUps = [
		                  issueOrders.length > 0 ? `ตามงานติดปัญหาวันนี้ ${issueOrders.length} งาน: ${issueOrders.slice(0, 3).map(o => o.id).join(", ")}${issueOrders.length > 3 ? "..." : ""}` : "",
		                  backlogUndelivered.length > 0 ? `ตามงานค้างจากวันก่อน ${backlogUndelivered.length} งาน ให้ปิดสถานะหรือมอบหมายคนขับต่อ` : "",
		                  waiting > 0 ? `ยังมีงานรอคนขับรับ ${waiting} งาน ควรตรวจว่าคนขับเห็นคิวครบหรือยัง` : "",
		                  active > 0 ? `มีงานกำลังส่ง ${active} งาน ควรติดตามก่อนปิดรอบวันนี้` : "",
		                  missingAssessments.length > 0 ? `ตรวจสภาพรถยังขาด ${missingAssessments.length} คน: ${missingAssessments.slice(0, 4).map(driver => driver.name || driver.id).join(", ")}${missingAssessments.length > 4 ? "..." : ""}` : "",
		                  todayRouteTasks.length > 0 ? `งานวิ่งวันนี้ ${todayRouteTasks.length} รอบ · เสร็จแล้ว ${completedTodayRouteTasks.length} รอบ · กำลังดำเนินการ ${activeTodayRouteTasks.length} รอบ` : ""
		                ].filter(Boolean);
		                if (!dailyFollowUps.length) {
		                  dailyFollowUps.push("วันนี้ยังไม่มีงานค้าง งานติดปัญหา หรือรายการตรวจรถที่ต้องเร่งตาม");
		                }
		                const overviewUpdatedAt = formatThaiDateTime(appClock);
		                return (
		                  <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #eee" }}>
		                    <b>ภาพรวมวันนี้ ({todayText()})</b>
		                    <div className="report-lines" style={{ marginTop: "8px" }}>
		                      <p>ออเดอร์วันนี้ <b>{total}</b> งาน</p>
		                      <p>รอคนขับรับ <b>{waiting}</b> · กำลังส่ง <b>{active}</b> · ส่งสำเร็จ <b>{done}</b> · ยกเลิก <b>{canceled}</b></p>
		                      <p>COD วันนี้รวม <b>{money(codAll)}</b> บาท · ส่งสำเร็จ <b>{money(codDone)}</b> บาท</p>
		                      {backlogUndelivered.length > 0 && (
		                        <p>งานค้างส่งจากวันก่อน <b>{backlogUndelivered.length}</b> งาน (นับเฉพาะรอคนขับรับ/กำลังส่ง/กำลังจัดส่ง)</p>
		                      )}
		                    </div>
		                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #e5e7eb" }}>
		                      <b>สรุปช่วงเวลา</b>
		                      <div className="report-lines" style={{ marginTop: "8px" }}>
		                        <p>สัปดาห์นี้ (จ.-วันนี้) <b>{weekSum.total}</b> งาน · ส่งสำเร็จ <b>{weekSum.done}</b> · COD ฿<b>{money(weekSum.cod)}</b></p>
		                        <p>เดือนนี้ <b>{monthSum.total}</b> งาน · ส่งสำเร็จ <b>{monthSum.done}</b> · COD ฿<b>{money(monthSum.cod)}</b></p>
		                        <p>ปีนี้ <b>{yearSum.total}</b> งาน · ส่งสำเร็จ <b>{yearSum.done}</b> · COD ฿<b>{money(yearSum.cod)}</b></p>
		                      </div>
		                    </div>
		                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #e5e7eb" }}>
		                      <b>รายงานประเมินตรวจสภาพรถวันนี้</b>
		                      <div className="report-lines" style={{ marginTop: "8px" }}>
		                        <p>ทำแล้ว <b>{completedAssessments.length}/{driverAssessmentRoster.length}</b> คน · คิดเป็น <b>{assessmentRate}%</b></p>
		                        <p>ทำแล้ว: <b>{completedAssessments.length ? completedAssessments.map(driver => driver.name || driver.id).join(", ") : "-"}</b></p>
		                        <p>ยังขาด: <b>{missingAssessments.length ? missingAssessments.map(driver => driver.name || driver.id).join(", ") : "ครบทุกคนแล้ว"}</b></p>
		                      </div>
		                    </div>
		                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #e5e7eb" }}>
		                      <b>ภาพรวมปัญหาการใช้งานและความต่อเนื่องของแอพ</b>
		                      <div className="report-lines" style={{ marginTop: "8px" }}>
		                        <p>สถานะระบบ: <b>{syncStatus || "กำลังตรวจสอบ"}</b></p>
		                        <p>งานติดปัญหาวันนี้ <b>{issueOrders.length}</b> งาน · งานค้างจากวันก่อน <b>{backlogUndelivered.length}</b> งาน</p>
		                        <p>อัปเดตล่าสุด: <b>{overviewUpdatedAt}</b> · ข้อมูลคำนวณจากออเดอร์, งานวิ่ง, ตรวจรถ และ Firestore realtime ของวันนี้</p>
		                      </div>
		                    </div>
		                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #e5e7eb" }}>
		                      <b>รายการติดตามประจำวันที่เปลี่ยนตามข้อมูลจริง</b>
		                      <div className="report-lines" style={{ marginTop: "8px" }}>
		                        {dailyFollowUps.map(item => <p key={item}>• {item}</p>)}
		                      </div>
		                    </div>
		                  </div>
		                );
		              })()}
		            </section>

		            <section className="panel">
		              {(() => {
		                const locs = state.driverLocations || {};
		                const idsWithLocation = Object.keys(locs).filter(did => locs[did]?.lat && locs[did]?.lng);
		                const defaultCenter = { lat: 18.7883, lng: 98.9853 }; // Chiang Mai
		                const effectiveId = selectedMapDriverId || idsWithLocation[0] || "";
		                const selected = effectiveId ? locs[effectiveId] : null;
		                const centerLat = selected?.lat ?? defaultCenter.lat;
		                const centerLng = selected?.lng ?? defaultCenter.lng;
		                const embed = osmEmbedUrl(centerLat, centerLng, 15, Boolean(selected));

		                return (
		                  <>
		                    <div className="panel-head"><h2>🗺️ Mini-map (OSM)</h2><span>{idsWithLocation.length} จุดเช็คอิน</span></div>
		                    {idsWithLocation.length === 0 ? (
		                      <p className="muted" style={{ margin: 0 }}>ยังไม่มีคนขับเช็คอินพิกัด (ให้คนขับกด “ไปถึงแล้ว” ที่หน้างาน และอนุญาต GPS)</p>
		                    ) : (
		                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
		                        {idsWithLocation.map(did => {
		                          const d = locs[did];
		                          const name = d.driverName || (drivers.find(x => x.id === did)?.name) || did;
		                          return (
		                            <button key={did} className={did === effectiveId ? "primary" : "secondary"} style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setSelectedMapDriverId(did)}>
		                              📍 {name}
		                            </button>
		                          );
		                        })}
		                      </div>
		                    )}

		                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
		                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "baseline" }}>
		                        <b>{selected?.driverName ? `📍 ${selected.driverName}` : "แผนที่ภาพรวม"}</b>
		                        <small style={{ color: "#6b7280" }}>{selected?.zone || "เชียงใหม่"}</small>
		                      </div>
		                      <iframe title="osm-mini-map-settings" src={embed} style={{ width: "100%", height: "260px", border: "1px solid #e5e7eb", borderRadius: "8px" }} loading="lazy" />
		                      <a href={osmPageUrl(centerLat, centerLng, 16)} target="_blank" rel="noreferrer" className="secondary" style={{ display: "block", textAlign: "center", padding: "8px", textDecoration: "none" }}>
		                        เปิดแผนที่เต็ม (OpenStreetMap)
		                      </a>
		                    </div>
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
        bottom: "88px",
        width: "52px",
        height: "52px",
        borderRadius: "999px",
        display: "grid",
        placeItems: "center",
        zIndex: 1200
      }}
      title="แชท"
    >
      <span style={{ position: "relative", display: "inline-block" }}>
        💬
        {unreadChatCount > 0 && !chatOpen && (
          <span style={{
            position: "absolute",
            top: "-8px",
            right: "-10px",
            minWidth: "18px",
            height: "18px",
            padding: "0 5px",
            borderRadius: "999px",
            background: "#dc2626",
            color: "white",
            fontSize: "11px",
            fontWeight: 900,
            display: "grid",
            placeItems: "center",
            border: "2px solid #ffffff",
            lineHeight: 1
          }}>
            {unreadChatCount > 99 ? "99+" : unreadChatCount}
          </span>
        )}
      </span>
    </button>

    {chatOpen && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1300, display: "grid", placeItems: "end center", padding: "16px" }}>
        <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: "12px", boxShadow: "0 12px 30px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
            <b>💬 แชททีม</b>
            <button className="secondary" onClick={() => { markChatReadUpToLatest(); setChatOpen(false); }} style={{ padding: "6px 10px", fontSize: "12px" }}>ปิด</button>
          </div>
          {chatOpen && typingUsers.filter(u => u.phone !== state.auth?.phone).length > 0 && (
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", background: "#ecfeff", color: "#0e7490", fontSize: "12px" }}>
              ✍️ กำลังพิมพ์: {typingUsers.filter(u => u.phone !== state.auth?.phone).map(u => u.name || u.phone || "ไม่ระบุ").join(", ")}
            </div>
          )}
          <div ref={chatListRef} style={{ padding: "12px 14px", maxHeight: "280px", overflowY: "auto", background: "#f9fafb", display: "grid", gap: "8px" }}>
            {chatMessages.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>ยังไม่มีข้อความ</p>
            ) : (
              chatMessages.map(m => {
                const t = parseChatTime(m.createdAt);
                const timeText = t ? t.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
                const isEmergency = m.type === "emergency";
                return (
                <div key={m.id} style={{ background: isEmergency ? "#fff1f2" : "white", border: `1px solid ${isEmergency ? "#fecdd3" : "#e5e7eb"}`, borderRadius: "10px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <b style={{ fontSize: "12px", color: isEmergency ? "#9f1239" : "#111827" }}>
                      {isEmergency ? "🚨 " : ""}{m.sender_name || "ไม่ระบุ"} {m.sender_role ? `(${m.sender_role})` : ""}
                    </b>
                    <small style={{ color: "#6b7280" }}>{timeText}</small>
                  </div>
                  <div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.message}</div>
                  {m.sender_phone && <a href={`tel:${m.sender_phone}`} style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}>📞 {m.sender_phone}</a>}
                </div>
              );
              })
            )}
          </div>
          <div style={{ padding: "12px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: "8px" }}>
            <input
              value={chatText}
              onChange={e => {
                const v = e.target.value;
                setChatText(v);
                if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
                updateTyping(Boolean(String(v || "").trim()));
                typingDebounceRef.current = setTimeout(() => {
                  updateTyping(Boolean(String(v || "").trim()));
                }, 1200);
              }}
              onBlur={() => updateTyping(false)}
              placeholder="พิมพ์ข้อความ..."
              style={{ flex: 1, padding: "10px", border: "1px solid #d1d5db", borderRadius: "10px" }}
            />
            <button className="secondary" onClick={sendEmergency} style={{ padding: "10px 12px", background: "#fee2e2", borderColor: "#fecaca", color: "#991b1b", fontWeight: 900 }} title="ขอความช่วยเหลือฉุกเฉิน">
              🚨
            </button>
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
          <label style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "10px", color: "#1d4ed8", fontSize: "13px", fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={shareNewOrderToLine}
              onChange={e => setShareNewOrderToLine(e.target.checked)}
              style={{ marginTop: "2px" }}
            />
            <span>แชร์ข้อความคิวงานหลังส่งเข้าคิว</span>
          </label>
          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button className="secondary" style={{ flex: 1 }} onClick={() => { setShowOrderConfirm(false); setShareNewOrderToLine(false); }}>❌ ยกเลิก</button>
            <button className="primary" style={{ flex: 1 }} onClick={confirmOrder}>✅ ยืนยันส่ง</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}


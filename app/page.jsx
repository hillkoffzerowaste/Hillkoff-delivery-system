"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { getFirebaseAuth, getFirestoreDb, fb, fbLogout, onFirebaseAuthStateChanged, onFirebaseIdTokenChanged, signInAnon, signInWithGoogle, signInWithStaffCredentials, getFcmToken } from "../lib/firebaseClient";
import { HILLKOFF_VEHICLES, findDefaultVehicleForDriver, findVehicleById, vehicleDisplayName } from "../lib/vehicleMaster";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  FolderSync,
  MapPinned,
  MessageSquareWarning,
  Navigation,
  Clock3,
  Package,
  PackageX,
  PackagePlus,
  BellRing,
  Search,
  SearchCheck,
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

const initialDrivers = [];

const ZONES = ["เมืองเชียงใหม่", "แม่ริม", "สันกำแพง", "ดอยสะเก็ด", "หางดง", "สันป่าตอง", "ลำพูน", "ลำปาง", "เชียงราย", "พะเยา"];
const STATUS = ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ", "ติดปัญหา", "ยกเลิก"];
const statusColor = { "รอคนขับรับ": "#92400e", "กำลังส่ง": "#1d4ed8", "กำลังจัดส่ง": "#f59e0b", "ส่งสำเร็จ": "#166534", "ติดปัญหา": "#b91c1c", "ยกเลิก": "#dc2626" };
const WORKFLOW_STATUS_META = {
  pending: { label: "รอรับงาน", tone: "waiting" },
  blocked: { label: "รอสโตร์ตรวจ", tone: "neutral" },
  working: { label: "กำลังดำเนินการ", tone: "active" },
  waiting: { label: "รอสินค้า", tone: "waiting" },
  partial: { label: "สินค้าไม่ครบ", tone: "warning" },
  returned: { label: "ส่งกลับตรวจสอบ", tone: "danger" },
  checked: { label: "ตรวจครบแล้ว", tone: "done" },
  skipped: { label: "ไม่ผ่านขั้นตอนนี้", tone: "neutral" },
  draft: { label: "ฉบับร่าง", tone: "neutral" },
  saved: { label: "บันทึกแล้ว", tone: "done" }
};

async function createLinePhotoSheet(files, title = "หลักฐานการปฏิบัติงาน") {
  const sourceFiles = Array.from(files || []).filter((file) => file?.type?.startsWith("image/")).slice(0, 5);
  if (!sourceFiles.length || typeof document === "undefined") return null;
  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ไม่สามารถอ่านรูปภาพได้")); };
    image.src = url;
  });
  try {
    const images = await Promise.all(sourceFiles.map(loadImage));
    const columns = images.length === 1 ? 1 : 2;
    const rows = Math.ceil(images.length / columns);
    const canvasWidth = 3072;
    const padding = 36;
    const headerHeight = 204;
    const gap = 21;
    const cellWidth = (canvasWidth - (padding * 2) - (gap * (columns - 1))) / columns;
    const cellHeight = columns === 1 ? 2304 : 1080;
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = headerHeight + padding + (rows * cellHeight) + ((rows - 1) * gap) + padding;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#174b36";
    context.fillRect(0, 0, canvas.width, headerHeight);
    context.fillStyle = "#ffffff";
    context.font = "700 69px sans-serif";
    context.fillText("Hillkoff Delivery · หลักฐานภาพ", padding, 84);
    context.font = "500 48px sans-serif";
    context.fillText(String(title).slice(0, 80), padding, 156);
    images.forEach((image, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = padding + (column * (cellWidth + gap));
      const y = headerHeight + padding + (row * (cellHeight + gap));
      context.fillStyle = "#edf3ef";
      context.fillRect(x, y, cellWidth, cellHeight);
      const scale = Math.min(cellWidth / image.width, cellHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, x + ((cellWidth - width) / 2), y + ((cellHeight - height) / 2), width, height);
      context.fillStyle = "rgba(23, 75, 54, .9)";
      context.fillRect(x, y, 117, 87);
      context.fillStyle = "#ffffff";
      context.font = "700 48px sans-serif";
      context.fillText(String(index + 1), x + 42, y + 60);
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
    return blob ? new File([blob], `hillkoff-proof-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
}

function WorkflowStatus({ role, status }) {
  const meta = WORKFLOW_STATUS_META[status] || { label: status || "ยังไม่ระบุ", tone: "neutral" };
  const prefix = role === "store" ? "สโตร์: " : role === "pack" ? "ห้องแพ็ค: " : "";
  return <span className={`status-chip status-${meta.tone}`}>{prefix}{meta.label}</span>;
}

function skipsStoreCheck(order) {
  return order?.workflowType === "direct_pack" || order?.workflowType === "direct_driver";
}

function storeStatusLabel(order) {
  if (order?.workflowType === "direct_driver") return "ข้ามขั้นตอน (ส่งตรงคนขับ)";
  if (order?.workflowType === "direct_pack") return "ข้ามขั้นตอน (ส่งตรงห้องแพ็ค)";
  return WORKFLOW_STATUS_META[order?.storeStatus]?.label || order?.storeStatus || "ยังไม่ระบุ";
}

const BRANCH_ROUTE_STOPS = ["สาขาช้างเผือก", "สาขาโรงงานป่าแพ่ง", "สาขาสำนักงานใหญ่", "สาขามหิดล", "สาขาทับเดื่อ"];
const LONG_ROUTE_STOPS = ["ร้านหอมไกล จ.ชลบุรี", "สาขาราติก้า จ.กรุงเทพมหานคร"];
const LONG_ROUTE_RETURN_STOPS = ["สาขาราติก้า จ.กรุงเทพมหานคร", "เชียงใหม่"];
const routeTaskStatusColor = { "กำลังวิ่ง": "#1d4ed8", "เช็คอินแล้ว": "#92400e", "เสร็จงาน": "#166534", "ยกเลิก": "#dc2626" };
const TAB_TITLES = {
  sales: "แดชบอร์ดการขาย",
  "sales-outstation": "ออเดอร์ต่างจังหวัด · ฝ่ายขาย",
  dispatch: "แดชบอร์ดการจัดส่ง",
  chiangmai: "เตรียมออเดอร์เชียงใหม่",
  "store-work": "ออเดอร์เชียงใหม่/ใกล้เคียง · สโตร์",
  "store-pickup": "Grab/รับหน้าร้าน · สโตร์",
  "store-booking": "ใบสั่งจอง · สโตร์",
  "store-online": "ใบขายออนไลน์ · สโตร์",
  "store-dashboard": "รายงาน KPI สโตร์",
  "pack-work": "ออเดอร์เชียงใหม่/ใกล้เคียง · ห้องแพ็ค",
  "pack-pickup": "Grab/รับหน้าร้าน · ห้องแพ็ค",
  "pack-outstation": "ออเดอร์ต่างจังหวัด · ห้องแพ็ค",
  "pack-booking": "ใบสั่งจอง · ห้องแพ็ค",
  "pack-online": "ออเดอร์ออนไลน์ · ห้องแพ็ค",
  "pack-dashboard": "รายงาน KPI ห้องแพ็ค",
  "driver-prep": "เช็คออเดอร์เชียงใหม่",
  driver: "แอปคนขับ",
  "driver-dashboard": "รายงาน KPI คนขับ",
  "driver-vehicle": "บันทึกการใช้รถ",
  "driver-sop": "ตรวจรถประจำวัน",
  "driver-sop-report": "รายงานตรวจรถ",
  reports: "รายงานประจำวัน",
  settings: "การตั้งค่า"
};

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
  lines.push("📦 มีออเดอร์ใหม่เข้าคิวเตรียมสินค้า");
  if (order?.id) lines.push(`งาน: ${order.id}`);
  if (order?.customerName) lines.push(`ลูกค้า: ${order.customerName}`);
  if (order?.zone) lines.push(`พื้นที่: ${order.zone}`);
  if (order?.address) lines.push(`ที่อยู่: ${order.address}`);
  if (order?.window) lines.push(`เวลา: ${order.window}`);
  if (order?.boxes != null) lines.push(`จำนวน: ${order.boxes} ${order.packageUnit === "bag" ? "ถุง" : "กล่อง"}`);
  if (order?.cod != null) lines.push(`COD: ฿${money(order.cod || 0)}`);
  if (order?.bookingNumber) lines.push(`ใบสั่งจอง: ${order.bookingNumber}`);
  if (order?.shippingCarrier) lines.push(`ขนส่งต่างจังหวัด: ${order.shippingCarrier}`);
  if (order?.salesNote) lines.push(`หมายเหตุ: ${order.salesNote}`);
  lines.push("กรุณาเปิดแอพเพื่อตรวจสอบงาน");
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

function StoreMetricCard({ icon: Icon, title, value, suffix = "", description, tone = "#166534", onClick, active = false }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component type={onClick ? "button" : undefined} className={`card stat-card${active ? " active" : ""}`} onClick={onClick}>
      <div className="stat-icon" style={{ color: tone, background: `${tone}17` }}><Icon size={20} /></div>
      <div>
        <div className="muted">{title}</div>
        <div className="stat-value">{value}{suffix}</div>
        <div className="small">{description}</div>
      </div>
    </Component>
  );
}

function OperationsKpiDashboard({ cards, completed, total, followUps, monthly, recentOrders, activities, reportActions, information, progressTitle = "ความคืบหน้าการตรวจสินค้า", progressLabel = "ตรวจเสร็จ" }) {
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const remaining = Math.max(0, total - completed);
  const cardIcons = { "is-primary": Package, "is-amber": Clock3, "is-blue": SearchCheck, "is-green": CheckCircle2, "is-red": PackageX };
  return <div className="ops-kpi-dashboard ops-kpi-dashboard-v2">
    <div className="stats role-stats" aria-label="สรุปงานวันนี้">{cards.map((card) => { const Icon = cardIcons[card.tone] || Package; const tone = { "is-primary": "#2563eb", "is-amber": "#b7791f", "is-blue": "#1d78b5", "is-green": "#25834d", "is-red": "#c7504a" }[card.tone] || "#2563eb"; return <StoreMetricCard key={card.label} icon={Icon} title={card.label} value={card.value} suffix=" งาน" description={card.detail} tone={tone} />; })}</div>
    <div className="ops-dashboard-main"><section className="ops-progress-card"><div className="ops-section-heading"><div><h3>{progressTitle}</h3><p>{progressLabel} {completed} จาก {total} งาน</p></div><b>{progress}%</b></div><div className="ops-progress-track" role="progressbar" aria-label={progressTitle} aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div><div className="ops-progress-foot"><span>{progressLabel} {completed} จาก {total} งาน</span><b>เหลืออีก {remaining} งาน</b></div></section><section className="ops-follow-up-card"><div className="ops-section-heading"><div><h3>งานที่ต้องติดตาม</h3><p>สถานะที่ควรดำเนินการต่อ</p></div></div><div className="ops-follow-up-grid">{followUps.map((item) => <div key={item.label} className={item.value ? "is-alert" : "is-clear"}>{item.value ? <><span>{item.label}</span><b>{item.value} งาน</b></> : <><i aria-hidden="true">✅</i><span>{item.emptyLabel}</span></>}</div>)}</div></section></div>
    <section className="ops-recent-orders"><div className="ops-section-heading"><div><h3>ออเดอร์ล่าสุดวันนี้</h3><p>รายการล่าสุดจากข้อมูลที่มีอยู่ในระบบ</p></div></div><div className="ops-recent-list">{recentOrders.map((order) => <article key={order.id}><div><b>{order.bookingNumber || order.id}</b><span>{order.customerName || "ไม่ระบุลูกค้า"}</span></div><span className={`ops-order-status ${order.statusTone || "is-primary"}`}>{order.statusLabel}</span><small>{order.updatedAt ? formatThaiDateTime(order.updatedAt) : "ยังไม่มีเวลาอัปเดต"}</small></article>)}{!recentOrders.length && <p className="muted">ยังไม่มีออเดอร์ของวันนี้</p>}</div></section>
    <div className="ops-dashboard-footer"><section className="ops-month-summary"><h3>สรุปเดือนนี้</h3><div className="ops-month-summary-grid">{monthly.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}{item.suffix || ""}</b></div>)}</div></section><section className="ops-activity-card"><div className="ops-section-heading"><div><h3>Activity วันนี้</h3><p>อ้างอิงจากประวัติการทำงานที่บันทึกไว้</p></div></div><div className="ops-activity-list">{activities.map((activity) => <article key={activity.id}><time>{activity.at ? new Date(activity.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</time><div><b>{activity.title}</b>{activity.note && <span>{activity.note}</span>}</div></article>)}{!activities.length && <p className="muted">ยังไม่มีรายการเคลื่อนไหวของวันนี้</p>}</div></section>{reportActions && <section className="ops-report-actions"><h3>รายงาน</h3><div><button className="secondary" onClick={reportActions.copyDaily}>📋 คัดลอกวันนี้</button><button className="primary" onClick={reportActions.shareDaily}>📤 แชร์ LINE วันนี้</button><button className="secondary" onClick={reportActions.copyMonthly}>📋 คัดลอกเดือนนี้</button><button className="primary" onClick={reportActions.shareMonthly}>📤 แชร์ LINE เดือนนี้</button></div></section>}</div>
    {information && <aside className="ops-information-note"><b>ℹ️ ข้อมูลระบบ</b><p>{information}</p></aside>}
  </div>;
}

function PackSalesOrderDetails({ order }) {
  const fields = [
    ["วันที่และเวลาเปิดออเดอร์", order.createdAt ? formatThaiDateTime(order.createdAt) : ""],
    ["ผู้เปิดออเดอร์", order.orderEntrySource === "store_assist" ? `สโตร์ช่วยคีย์: ${order.createdByName || order.salesName || "สโตร์"}` : `ฝ่ายขาย: ${order.createdByName || order.salesName || "-"}`],
    ["เลขที่ใบสั่งจอง", formatOrderBookingNumbers(order) || (order.bookingNumberMissing ? "ยังไม่ระบุ · ติดตามด้วยเลขออเดอร์" : "")], ["ลูกค้า", order.customerName], ["โทร", order.customerPhone], ["โซน", order.zone], ["ที่อยู่", order.address],
    ["ช่วงเวลา", order.window], ["จำนวน", order.boxes != null ? `${order.boxes} ${order.packageUnit === "bag" ? "ถุง" : "กล่อง"}` : ""], ["ชำระเงิน", order.paymentType],
    ["COD", order.cod != null ? `฿${money(order.cod)}` : ""], ["เส้นทาง", order.workflowType === "direct_driver" ? "🚨 ส่งตรงคนขับ (เร่งด่วน)" : order.workflowType === "direct_pack" ? "ส่งตรงห้องแพ็ค" : "ผ่านสโตร์ก่อนห้องแพ็ค"], ["ขนส่งต่างจังหวัด", order.shippingCarrier], ["หมายเหตุฝ่ายขาย", order.salesNote]
  ].filter(([, value]) => String(value || "").trim());
  return <div style={{ display: "grid", gap: "5px", background: "#f8fafc", border: "1px solid #dbe4ee", borderRadius: "8px", padding: "9px", fontSize: "12px" }}>
    <b style={{ color: "#1e3a5f" }}>ข้อมูลออเดอร์จากฝ่ายขาย</b>
    {fields.map(([label, value]) => <div key={label}><b>{label}:</b> {value}</div>)}
    {Array.isArray(order.storeBookingSupplements) && order.storeBookingSupplements.length > 0 && <div style={{ marginTop: "4px", paddingTop: "7px", borderTop: "1px solid #dbe4ee", display: "grid", gap: "4px" }}><b style={{ color: "#1d4ed8" }}>รายละเอียดใบสั่งจองเพิ่มจากสโตร์</b>{order.storeBookingSupplements.map((item, index) => <div key={item.reportId || `${item.bookingNumber}-${index}`}><b>{item.bookingNumber || "ใบสั่งจอง"}:</b> {[item.detail, item.note].filter(Boolean).join(" · ") || "ไม่มีรายละเอียด"}<small className="muted"> · {item.createdBy || "สโตร์"}</small></div>)}</div>}
    {order.mapUrl && <a href={order.mapUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8", fontWeight: 700 }}>เปิดแผนที่ลูกค้า</a>}
  </div>;
}

function OrderCreatedAt({ order }) {
  if (!order?.createdAt) return null;
  const source = order.orderEntrySource === "store_assist" ? "สโตร์ช่วยคีย์" : "ฝ่ายขายเปิดออเดอร์";
  return <div className="muted" style={{ fontSize: "12px", fontWeight: 700 }}>🕒 {source}: {formatThaiDateTime(order.createdAt)} น.</div>;
}

function OrderHistorySearch({ title, query, onQueryChange, onSearch, onClear, loading, searched, results, onOpen }) {
  return <div className="history-search"><div className="history-search-title"><b>{title}</b><span>ค้นหาได้ทุกสถานะและทุกวัน</span></div><div className="history-search-controls"><input value={query} onChange={event => onQueryChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onSearch(); }} placeholder="เลขออเดอร์ / ใบสั่งจอง / ลูกค้า / เบอร์ / พื้นที่" /><button className="secondary" onClick={onSearch} disabled={loading}>{loading ? "กำลังค้นหา…" : "ค้นหาย้อนหลัง"}</button><button className="secondary" onClick={onClear}>ล้าง</button></div>{results.length > 0 && <div className="history-search-results">{results.map(order => <article key={order.id} className="history-result-card"><div><b>{order.id} · {order.customerName || "-"}</b><div className="muted">{formatOrderBookingNumbers(order) || "ไม่มีเลขใบสั่งจอง"} · {order.zone || "-"} · {order.status || "-"}</div><small className="muted">สโตร์: {storeStatusLabel(order)} · แพ็ค: {WORKFLOW_STATUS_META[order.packStatus]?.label || order.packStatus || "-"}</small></div><button className="secondary" onClick={() => onOpen(order)}>ดูประวัติ</button></article>)}</div>}{searched && !loading && results.length === 0 && <p className="muted">ยังไม่พบออเดอร์ที่ตรงกับคำค้นหา</p>}</div>;
}

function isValidBookingNumber(value) {
  return /^\S+-\d{4}$/.test(String(value || "").trim());
}

function normalizeBookingNumber(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (isValidBookingNumber(raw)) return raw;
  const legacy = raw.match(/^(.+?)-?(\d{4})$/);
  return legacy ? `${legacy[1].replace(/-+$/, "").trim()}-${legacy[2]}` : raw;
}

function getOrderBookingNumbers(order) {
  const values = Array.isArray(order?.bookingNumbers) ? order.bookingNumbers : [order?.bookingNumber];
  return [...new Set(values.map(normalizeBookingNumber).filter(isValidBookingNumber))];
}

function formatOrderBookingNumbers(order) {
  return getOrderBookingNumbers(order).join(", ");
}

const DEFAULT_PREPARATION_CHECKERS = {
  store: ["เล็ก", "ณัฐ", "สุภาพ", "ลืน", "โจ้", "สมนึก"],
  pack: ["กิต", "มาย", "ยุทธ", "หล้า", "มุก"]
};

function BookingNumberInput({ value, onChange, required = false }) {
  const [manualPrefixMode, setManualPrefixMode] = useState(false);
  const rawValue = String(value || "").trim().toUpperCase();
  const knownPrefixes = ["CSP", "CSR", "TSR", "AS7", "AS2", "AS1", "AS6"];
  const knownPrefix = knownPrefixes.find(item => rawValue === item || rawValue.startsWith(`${item}-`) || (rawValue.startsWith(item) && /^\d/.test(rawValue.slice(item.length))));
  const customMatch = knownPrefix ? null : rawValue.match(/^([^\-\d\s]+)(?:-)?\d*$/);
  const isManualPrefix = manualPrefixMode || Boolean(customMatch?.[1]);
  const prefix = isManualPrefix ? "custom" : knownPrefix || "CSP";
  const customPrefix = customMatch?.[1] || "";
  const digitsSource = knownPrefix
    ? rawValue.slice(knownPrefix.length).replace(/^-/, "")
    : customMatch?.[1] ? rawValue.slice(customMatch[1].length).replace(/^-/, "") : "";
  const digits = digitsSource.replace(/\D/g, "").slice(0, 4);
  const activePrefix = isManualPrefix ? customPrefix : prefix;
  const setBooking = (nextPrefix, nextDigits) => {
    const cleanPrefix = String(nextPrefix || "").replace(/-/g, "").trim().toUpperCase();
    const cleanDigits = digitsOnly(nextDigits).slice(0, 4);
    onChange(cleanPrefix ? `${cleanPrefix}-${cleanDigits}` : "");
  };
  return <div style={{ display: "grid", gridTemplateColumns: isManualPrefix ? "76px minmax(84px, .7fr) minmax(0, 1fr)" : "76px minmax(0, 1fr)", gap: "7px" }}>
    <select value={prefix} onChange={e => { const next = e.target.value; if (next === "custom") { setManualPrefixMode(true); onChange(""); return; } setManualPrefixMode(false); setBooking(next, digits); }} aria-label="คำนำหน้าใบสั่งจอง"><option value="CSP">CSP</option><option value="CSR">CSR</option><option value="TSR">TSR</option><option value="AS7">AS7</option><option value="AS2">AS2</option><option value="AS1">AS1</option><option value="AS6">AS6</option><option value="custom">เพิ่มรหัสเอง</option></select>
    {isManualPrefix && <input value={customPrefix} onChange={e => setBooking(e.target.value.trim().toUpperCase(), digits)} placeholder="รหัสหน้า เช่น ABC" aria-label="กรอกรหัสหน้าเอง" />}
    <input value={digits} onChange={e => setBooking(activePrefix, digitsOnly(e.target.value).slice(0, 4))} inputMode="numeric" maxLength={4} placeholder={required ? "เลข 4 หลัก *" : "เลข 4 หลัก"} aria-label="เลข 4 หลักของใบสั่งจอง" />
  </div>;
}

function PackReportWorkspace({ type, title, rows, loading, query, onQueryChange, onSearch, onClear, selectedIds, onSelectedIdsChange, onConfirmSelected, onUpdateStatus, updatedAt, date, onDateChange }) {
  const [statusFilter, setStatusFilter] = useState("active");
  const visibleRows = rows.filter((item) => statusFilter === "all" || (statusFilter === "active" && ["pending", "partial", "returned"].includes(item.packStatus)) || item.packStatus === statusFilter);
  const selectableRows = visibleRows.filter((item) => item.packStatus === "pending");
  const selectedSet = new Set(selectedIds);
  const selectedVisibleIds = selectableRows.filter((item) => selectedSet.has(item.id)).map((item) => item.id);
  const allSelectable = selectableRows.length > 0 && selectedVisibleIds.length === selectableRows.length;
  const toggleAll = (checked) => onSelectedIdsChange(checked ? selectableRows.map((item) => item.id) : []);
  const toggleOne = (id, checked) => onSelectedIdsChange(checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((selectedId) => selectedId !== id));
  const statusMeta = (item) => {
    if (item.packStatus === "returned") return { label: "ส่งกลับสโตร์", tone: "partial" };
    if (item.packStatus === "partial") return { label: "ของไม่ครบ / รอของ", tone: "partial" };
    if (item.packStatus === "checked") return { label: "ห้องแพ็คยืนยันแล้ว", tone: "confirmed" };
    return { label: "รอห้องแพ็คตรวจ", tone: "draft" };
  };
  return <section className="panel role-workspace ops-workspace pack-report-workspace">
    <div className="panel-head"><h2>{title}</h2><span>{selectableRows.length} งานรอยืนยัน</span></div>
    <div className="store-report-filters" style={{ marginBottom: "10px" }}>
      <input aria-label="วันที่รายงานห้องแพ็ค" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
      <select aria-label="กรองสถานะห้องแพ็ค" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="active">งานที่ต้องดำเนินการ</option><option value="pending">รอยืนยัน</option><option value="partial">ของไม่ครบ / รอของ</option><option value="returned">ส่งกลับสโตร์</option><option value="checked">ยืนยันแล้ว</option><option value="all">ทุกสถานะ</option></select>
      <div className="store-report-search"><Search size={17} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSearch(); }} placeholder="ค้นหาเลขใบสั่งจอง / รายละเอียด / หมายเหตุ" /></div>
      <button className="secondary" onClick={onSearch}>ค้นหาประวัติ</button><button className="secondary" onClick={onClear}>ล้าง</button>
    </div>
    <div className="store-report-actions" style={{ marginBottom: "10px" }}>
      <span className="muted">เลือกงานที่ตรวจครบ แล้วกดยืนยันครั้งเดียว หรือยืนยันทีละงานได้</span>
      <div><button className="secondary" disabled={!selectableRows.length} onClick={() => toggleAll(!allSelectable)}>{allSelectable ? "ยกเลิกเลือกทั้งหมด" : `เลือกทั้งหมด (${selectableRows.length})`}</button><button className="primary" disabled={!selectedVisibleIds.length} onClick={() => onConfirmSelected(selectedVisibleIds)}>ยืนยันที่เลือก ({selectedVisibleIds.length})</button></div>
    </div>
    {updatedAt && <small className="muted">อัปเดตล่าสุด {new Date(updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</small>}
    {loading ? <p className="muted">กำลังโหลดรายการ…</p> : <div className="store-report-table-wrap"><table className="store-report-table"><thead><tr><th><input type="checkbox" aria-label="เลือกทั้งหมด" checked={allSelectable} disabled={!selectableRows.length} onChange={(event) => toggleAll(event.target.checked)} /></th><th>เลขเอกสาร</th><th>รายละเอียด</th><th>เวลา / ผู้บันทึก</th><th>สถานะห้องแพ็ค</th><th>จัดการ</th></tr></thead><tbody>{visibleRows.map((item) => { const status = statusMeta(item); const selectable = item.packStatus === "pending"; return <tr key={item.id} className={`store-report-row is-${status.tone}`}><td data-label="เลือก"><input type="checkbox" aria-label={`เลือก ${item.bookingNumber || "รายการ"}`} checked={selectedSet.has(item.id)} disabled={!selectable} onChange={(event) => toggleOne(item.id, event.target.checked)} /></td><td data-label="เลขเอกสาร"><b>{item.bookingNumber || "ไม่มีเลขใบสั่งจอง"}</b>{item.linkedOrder && <small className="muted">ฝ่ายขาย: {item.linkedOrder.id} · {item.linkedOrder.customerName || "ไม่ระบุลูกค้า"}</small>}</td><td data-label="รายละเอียด"><span>{item.detail || "-"}</span>{item.note && <small>{item.note}</small>}{item.returnReason && <small style={{ color: "#b91c1c" }}>เหตุผลส่งกลับ: {item.returnReason}</small>}</td><td data-label="เวลา / ผู้บันทึก"><span>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</span><small>{item.createdBy || "-"} · {item.serviceDate || "-"}</small></td><td data-label="สถานะห้องแพ็ค"><span className={`store-report-status is-${status.tone}`}>{status.label}</span></td><td data-label="จัดการ"><div className="store-report-row-actions"><button className="primary" disabled={!selectable} onClick={() => onConfirmSelected([item.id])}>ยืนยันครบ</button><button className="secondary" disabled={!selectable} onClick={() => onUpdateStatus(item, "partial")}>ของไม่ครบ</button><button className="secondary danger" disabled={!selectable} onClick={() => onUpdateStatus(item, "returned")}>ส่งกลับสโตร์</button></div></td></tr>; })}</tbody></table></div>}
    {!loading && !visibleRows.length && <p className="muted">ยังไม่มี{type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}ที่ตรงกับตัวกรอง</p>}
  </section>;
}

export default function App() {
  const [tab, setTab] = useState("sales");
  const [appClock, setAppClock] = useState(() => new Date());
  const [state, setState] = useState(defaultState);
  const [customerQuery, setCustomerQuery] = useState("");
  const [historicalCustomers, setHistoricalCustomers] = useState([]);
  const [allHistoricalCustomersLoading, setAllHistoricalCustomersLoading] = useState(false);
  const [allHistoricalCustomersLoaded, setAllHistoricalCustomersLoaded] = useState(false);
  const historicalCustomerSearchSeqRef = useRef(0);
  const customerHistorySearchSeqRef = useRef(0);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [customerHistoryCustomerId, setCustomerHistoryCustomerId] = useState("");
  const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [driverId, setDriverId] = useState("D1");
  const [driverSequenceDragId, setDriverSequenceDragId] = useState("");
  const [driverNoteDrafts, setDriverNoteDrafts] = useState({});
  const [loginForm, setLoginForm] = useState({ role: "sales", name: "", phone: "", username: "", password: "" });
  const [driverLoginSubmitting, setDriverLoginSubmitting] = useState(false);
  const driverLoginInFlightRef = useRef(false);
  const [rememberPhone, setRememberPhone] = useState(false);
  const [googleOtpStage, setGoogleOtpStage] = useState("idle"); // idle | otp
  const [googleOtpSession, setGoogleOtpSession] = useState(null);
  const [googleOtpCode, setGoogleOtpCode] = useState("");
  const [googleOtpDevCode, setGoogleOtpDevCode] = useState("");
  const [editingCustomerId, setEditingCustomerId] = useState(null);
  const [editCustomerForm, setEditCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [lastCheckerNames, setLastCheckerNames] = useState({ store: "", pack: "" });
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

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hillkoff-last-checker-names") || "{}");
      setLastCheckerNames({ store: String(saved.store || ""), pack: String(saved.pack || "") });
    } catch {}
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
      const id = globalThis.crypto?.randomUUID
        ? `dev_${globalThis.crypto.randomUUID()}`
        : `dev_${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (value) => value.toString(16).padStart(2, "0")).join("")}`;
      localStorage.setItem("hillkoff-device-id", id);
      return id;
    } catch {
      return "";
    }
  };
  const [driverForm, setDriverForm] = useState({ firstName: "", lastName: "", phone: "", vehicle: "รถยนต์", plate: "", zone: "เมืองเชียงใหม่" });
  const [orderQuery, setOrderQuery] = useState("");
  const [chiangmaiHistoryQuery, setChiangmaiHistoryQuery] = useState("");
  const [chiangmaiHistoryResults, setChiangmaiHistoryResults] = useState([]);
  const [chiangmaiHistoryLoading, setChiangmaiHistoryLoading] = useState(false);
  const [chiangmaiHistorySearched, setChiangmaiHistorySearched] = useState(false);
  const [chiangmaiHistoryOrder, setChiangmaiHistoryOrder] = useState(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderZoneFilter, setOrderZoneFilter] = useState("all");
  const [customerForm, setCustomerForm] = useState({ name: "", contact: "", phone: "", zone: "เมืองเชียงใหม่", address: "", mapUrl: "", note: "" });
  const [orderForm, setOrderForm] = useState({
    pickupWaitMinutes: "5",
    qty: "",
    packageUnit: "box",
    paymentType: "COD",
    codAmount: "",
    salesNote: "",
    bookingPrefix: "CSP", bookingCustomPrefix: "", bookingDigits: "", bookingNumbers: [], urgentBookingNumber: "", shippingCarrier: "", shippingCarrierOther: "",
    workflowType: "store_route", deliveryMethod: "company_driver"
  });
  const [orderCustomerSearch, setOrderCustomerSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState("⏳ กำลังเชื่อมต่อระบบ...");
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [storeUrgentOpen, setStoreUrgentOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [orderConfirmSubmitting, setOrderConfirmSubmitting] = useState(false);
  const [orderConfirmError, setOrderConfirmError] = useState("");
  const [shareNewOrderToLine, setShareNewOrderToLine] = useState(false);
  const [showOutstationCarrierModal, setShowOutstationCarrierModal] = useState(false);
  const [workModal, setWorkModal] = useState(null);
  const [workForm, setWorkForm] = useState({ bookingNumber: "", detail: "", note: "", missingNote: "" });
  const [workPhotoPreviews, setWorkPhotoPreviews] = useState([]);
  const [workSharedToLine, setWorkSharedToLine] = useState(false);
  const [workSubmitting, setWorkSubmitting] = useState(false);
  const [workSubmitError, setWorkSubmitError] = useState("");
  const [checkerLists, setCheckerLists] = useState(DEFAULT_PREPARATION_CHECKERS);
  const [newCheckerName, setNewCheckerName] = useState("");
  const [storeReports, setStoreReports] = useState([]);
  const [storeReportsLoading, setStoreReportsLoading] = useState(false);
  const [storeReportDate, setStoreReportDate] = useState(() => toServiceDateKey(new Date()));
  const [storeReportQuery, setStoreReportQuery] = useState("");
  const [storeReportSearchActive, setStoreReportSearchActive] = useState(false);
  const [storeReportIncludeDeleted, setStoreReportIncludeDeleted] = useState(false);
  const [storeReportStatusFilter, setStoreReportStatusFilter] = useState("all");
  const [storeReportsUpdatedAt, setStoreReportsUpdatedAt] = useState(null);
  const [kpiAutoRefresh, setKpiAutoRefresh] = useState(false);
  const [storeReportIssues, setStoreReportIssues] = useState({ booking: { count: 0, items: [] }, online: { count: 0, items: [] } });
  const storeReportsFetchInFlightRef = useRef(false);
  const [storeDraftRows, setStoreDraftRows] = useState({ booking: [], online: [] });
  const [showStoreReportConfirm, setShowStoreReportConfirm] = useState("");
  const [storeReportConfirmIds, setStoreReportConfirmIds] = useState([]);
  const [packReportSelectedIds, setPackReportSelectedIds] = useState([]);
  const [packReportBulkSubmitting, setPackReportBulkSubmitting] = useState(false);
  const [reportModal, setReportModal] = useState(null);
  const [reportRows, setReportRows] = useState([{ bookingNumber: "", detail: "", note: "", status: "saved" }]);
  const [reportPhotoPreview, setReportPhotoPreview] = useState("");
  const [editingStoreReport, setEditingStoreReport] = useState(null);
  const [storeReportDetail, setStoreReportDetail] = useState(null);
  const [onlineReturnTarget, setOnlineReturnTarget] = useState(null);
  const [onlineReturnReason, setOnlineReturnReason] = useState("");
  const [selectedMapDriverId, setSelectedMapDriverId] = useState("");
  const [openReportDate, setOpenReportDate] = useState("");
  const [reportExportMode, setReportExportMode] = useState("single");
  const [reportExportDate, setReportExportDate] = useState(() => toServiceDateKey(new Date()));
  const [reportExportStartDate, setReportExportStartDate] = useState(() => toServiceDateKey(new Date()));
  const [reportExportEndDate, setReportExportEndDate] = useState(() => toServiceDateKey(new Date()));
  const [ordersLimit, setOrdersLimit] = useState(20);
  const customersLimit = 200;
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
    ? (tab === "driver-sop" ? "driver-sop" : tab === "driver-vehicle" ? "driver-vehicle" : tab === "driver-prep" ? "driver-prep" : tab === "driver-dashboard" ? "driver-dashboard" : "driver")
    : state.auth?.role === "store" ? (["store-work", "store-pickup", "store-booking", "store-online", "store-dashboard"].includes(tab) ? tab : "store-work")
    : state.auth?.role === "pack" ? (["pack-work", "pack-pickup", "pack-outstation", "pack-booking", "pack-online", "pack-dashboard"].includes(tab) ? tab : "pack-work")
    : (tab === "driver" ? "sales" : tab);

  const todayServiceDate = toServiceDateKey(appClock);
  const previousServiceDate = toServiceDateKey(new Date(Date.parse(`${todayServiceDate}T12:00:00+07:00`) - 86400000));
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
  const [podPreviewsByOrder, setPodPreviewsByOrder] = useState({});
  const podFilesRef = useRef({}); // { [orderId]: File[] } kept on-device only (not synced)
  const workPhotoFilesRef = useRef({}); // Store/pack photos are device-only and can be shared from this browser.
  const reportPhotoFileRef = useRef(null);
  const routeTaskFilesRef = useRef({}); // { [taskId_stopId]: File } kept on-device only (not synced)
  const lastOrdersPullRef = useRef(null);
  const lastCustomersPullRef = useRef(null);
  const lastDriverLocationsPullRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const driverOrdersSnapshotsRef = useRef({ assigned: [], queued: [] });
  
  const pendingOrderUpdatesRef = useRef(new Set()); // Track orders being updated to debounce button clicks
  const ordersToSyncRef = useRef(new Set());
  const routeTasksToSyncRef = useRef(new Set());
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
      const res = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authState.token}` },
        body: JSON.stringify({
          token: tokenRes.token,
          role: "driver",
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
	      setSyncStatus("⏳ กำลังตรวจสอบการเข้าสู่ระบบ...");
	      return;
	    }
	    if (!state.auth?.token) {
	      setSyncStatus("กรุณาเข้าสู่ระบบ");
	      return;
	    }
	    const db = getFirestoreDb();
	    const unsubs = [];
	    let gotAnySnapshot = false;
	    const markConnected = () => {
	      if (gotAnySnapshot) return;
	      gotAnySnapshot = true;
      setSyncStatus("🟢 ระบบเชื่อมต่อแบบเรียลไทม์");
	    };

    const needsOrdersRealtime = ["sales", "sales-outstation", "dispatch", "driver", "driver-prep", "store-work", "store-pickup", "store-booking", "store-online", "store-dashboard", "pack-work", "pack-pickup", "pack-outstation", "pack-booking", "pack-online", "pack-dashboard", "chiangmai", "reports", "settings"].includes(String(displayTab || ""));
    const isKpiDashboard = ["store-dashboard", "pack-dashboard"].includes(String(displayTab || ""));
    const needsCompleteOperationalQueue = ["sales", "sales-outstation", "chiangmai", "store-work", "store-pickup", "pack-work", "pack-pickup", "pack-outstation"].includes(String(displayTab || ""));
	    const effectiveOrdersLimit = state.auth?.role === "driver"
	      ? Math.max(ordersLimit, DRIVER_ORDERS_HISTORY_LIMIT)
	      : (isKpiDashboard || needsCompleteOperationalQueue) ? Math.max(ordersLimit, 5000)
	      : ["reports", "settings"].includes(String(displayTab || "")) ? Math.max(ordersLimit, 500) : ordersLimit;
	    const needsRouteTasksRealtime = ["sales", "dispatch", "driver", "reports"].includes(String(displayTab || ""));
    // Store searches customers through the authenticated API; its Firestore rules intentionally
    // do not grant a broad realtime read of the full customer collection.
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
	        const applyOrderRows = (incomingRows, source = "all") => {
	          let rows = incomingRows;
	          if (state.auth?.role === "driver" && source !== "all") {
	            driverOrdersSnapshotsRef.current[source] = incomingRows;
	            const byId = new Map();
	            [...driverOrdersSnapshotsRef.current.queued, ...driverOrdersSnapshotsRef.current.assigned]
	              .forEach((order) => {
	                const current = byId.get(order.id);
	                const currentUpdatedAt = Date.parse(current?.updatedAt || 0) || 0;
	                const nextUpdatedAt = Date.parse(order?.updatedAt || 0) || 0;
	                if (!current || nextUpdatedAt >= currentUpdatedAt) byId.set(order.id, order);
	              });
	            rows = [...byId.values()]
	              .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
	              .slice(0, effectiveOrdersLimit);
	          }
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
	        };
	        const onOrderError = (err) => setSyncStatus?.(`⚠️ Firestore orders error: ${err.message || err}`);
	        if (state.auth?.role === "driver") {
	          const did = state.auth?.driverId || driverId || "";
	          driverOrdersSnapshotsRef.current = { assigned: [], queued: [] };
	          if (did) {
	            const assignedQ = fb.query(fb.collection(db, "orders"), fb.where("driverId", "==", did), fb.orderBy("updatedAt", "desc"), fb.limit(effectiveOrdersLimit));
	            unsubs.push(fb.onSnapshot(assignedQ, (snap) => applyOrderRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })), "assigned"), onOrderError));
	          }
	          const queuedQ = fb.query(fb.collection(db, "orders"), fb.where("driverId", "==", ""), fb.where("queueStatus", "==", "queued"), fb.limit(effectiveOrdersLimit));
	          unsubs.push(fb.onSnapshot(queuedQ, (snap) => applyOrderRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })), "queued"), onOrderError));
	        } else {
	          const ordersQ = fb.query(fb.collection(db, "orders"), fb.orderBy("updatedAt", "desc"), fb.limit(effectiveOrdersLimit));
	          unsubs.push(fb.onSnapshot(ordersQ, (snap) => applyOrderRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), onOrderError));
	        }
	      } catch (e) {
	        console.warn("orders onSnapshot error", e);
	      }
	    }

	    if (needsRouteTasksRealtime) {
	      try {
	        const routeDriverId = state.auth?.driverId || driverId || "";
	        if (state.auth?.role === "driver" && !routeDriverId) throw new Error("Missing driver identity");
	        const routeTasksQ = state.auth?.role === "driver"
	          ? fb.query(fb.collection(db, "route_tasks"), fb.where("driverId", "==", routeDriverId), fb.orderBy("updatedAt", "desc"), fb.limit(100))
	          : fb.query(fb.collection(db, "route_tasks"), fb.orderBy("updatedAt", "desc"), fb.limit(100));
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
	            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
	            body: JSON.stringify({ serviceDate: todayServiceDate })
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

  // Driver location: record only on "check-in" events (no continuous tracking)

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

  const refreshAuthToken = useCallback(async (forceRefresh = true) => {
    const authClient = getFirebaseAuth();
    const user = authClient.currentUser;
    if (!user) {
      throw new Error("กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
    }

    const token = await user.getIdToken(forceRefresh);
    let storedAuth = {};
    try { storedAuth = JSON.parse(localStorage.getItem("hillkoff_auth") || "{}") || {}; } catch {}
    const nextAuth = { ...storedAuth, token };
    localStorage.setItem("hillkoff_auth", JSON.stringify(nextAuth));
    setState((prev) => ({ ...prev, auth: { ...(prev.auth || {}), token } }));
    return token;
  }, []);

  const sendToChatbot = async (text) => {
    const q = String(text || "").trim();
    if (!q) return;
    if (state.auth?.role !== "sales") return;
    if (!state.auth?.token) return;

    setAiBusy(true);
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: q }, { role: "model", text: "" }]);

    try {
      const idToken = await refreshAuthToken();
      const res = await fetch("/api/chat/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
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

	  const upsertOrderToFirestore = useCallback(async (order) => {
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
	        packageUnit: order.packageUnit === "bag" ? "bag" : "box",
	        cod: Number(order.cod || 0),
	        driverId: order.driverId || "",
	        driverName: order.driverName || "",
	        salesName: order.salesName || "",
	        salesPhone: order.salesPhone || "",
	        status: order.status || "รอคนขับรับ",
	        ...(order.queueStatus !== undefined ? { queueStatus: order.queueStatus || "" } : {}),
	        // POD is stored on-device only; never persist photo/blob URLs to Firestore
	        sharedToLine: Boolean(order.sharedToLine),
	        checkInAt: order.checkInAt || "",
	        deliveredAt: order.deliveredAt || "",
	        complaint: order.complaint || "",
	        salesNote: order.salesNote || "",
	        driverNote: order.driverNote || "",
	        ...(order.driverSequence !== undefined ? {
	          driverSequence: Math.max(0, Number(order.driverSequence) || 0),
	          driverSequenceServiceDate: order.driverSequenceServiceDate || "",
	          driverSequenceUpdatedAt: order.driverSequenceUpdatedAt || "",
	          driverSequenceUpdatedBy: order.driverSequenceUpdatedBy || ""
	        } : {}),
	        ...(order.acceptedAt !== undefined ? { acceptedAt: order.acceptedAt || "" } : {}),
	        createdAt: order.createdAt || new Date().toISOString(),
	        updatedAt: new Date().toISOString()
	      };
	      await fb.setDoc(fb.doc(db, "orders", String(order.id)), orderForDB, { merge: true });
	      return { ok: true };
	    } catch (e) {
	      return { ok: false, error: e?.message || String(e) };
		    }
		  }, []);

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

		  const upsertRouteTaskToFirestore = useCallback(async (task) => {
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
		  }, []);

  useEffect(() => {
    const ids = [...ordersToSyncRef.current];
    if (!ids.length) return;
    ids.forEach((id) => ordersToSyncRef.current.delete(id));
    const orders = ids.map((id) => (state.orders || []).find((order) => order.id === id)).filter(Boolean);
    void Promise.all(orders.map(async (order) => {
      const { ok, error } = await upsertOrderToFirestore(order);
      if (!ok) {
        console.error(`Failed to sync order ${order.id}:`, error);
        return;
      }
      try {
        const idToken = await refreshAuthToken(true);
        await fetch("/api/orders/sync-sheet", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ orderId: order.id })
        });
      } catch (sheetError) {
        console.warn(`Failed to sync order ${order.id} to delivery sheet`, sheetError);
      }
    }));
  }, [state.orders, refreshAuthToken, upsertOrderToFirestore]);

  useEffect(() => {
    const ids = [...routeTasksToSyncRef.current];
    if (!ids.length) return;
    ids.forEach((id) => routeTasksToSyncRef.current.delete(id));
    const tasks = ids.map((id) => (state.routeTasks || []).find((task) => task.id === id)).filter(Boolean);
    void Promise.all(tasks.map(async (task) => {
      const saved = await upsertRouteTaskToFirestore(task);
      if (!saved.ok) console.error(`Failed to sync route task ${task.id}:`, saved.error);
    }));
  }, [state.routeTasks, upsertRouteTaskToFirestore]);

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
		        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
		        body: JSON.stringify({ idToken, customer })
		      });
		      const json = await res.json().catch(() => null);
		      if (!res.ok || !json?.ok) {
		        return { ok: false, error: json?.error || `HTTP ${res.status}`, status: res.status, data: json?.data || null };
		      }
		      return { ok: true, data: json.data || null };
		    } catch (e) {
		      return { ok: false, error: e?.message || String(e), status: e?.status || 0 };
		    }
		  };

	  // Keep the selected driver identity synchronized with the authenticated profile.
	  useEffect(() => {
	    if (state.auth?.driverId) setDriverId(state.auth.driverId);
	  }, [state.auth?.driverId]);

  const customers = useMemo(() => {
    const byId = new Map((state.customers || []).map((customer) => [customer.id, customer]));
    historicalCustomers.forEach((customer) => { if (!byId.has(customer.id)) byId.set(customer.id, customer); });
    return Array.from(byId.values());
  }, [state.customers, historicalCustomers]);
  const orders = state.orders;
  const transferredQueueStatuses = ["queued", "completed", "outstation_ready", "grab_completed", "grab_ready", "grab_picked_up", "pack_archived", "driver_archived"];
  const preparationOrders = (orders || []).filter(order => order.workflowType && !transferredQueueStatuses.includes(order.queueStatus));
  const chiangmaiPreparationOrders = preparationOrders.filter(order => order.deliveryMethod !== "outstation");
  const isPreparationReadyForDriver = order => ["checked", "partial"].includes(order.packStatus);
  const isReadyDriverBacklog = order => isPreparationReadyForDriver(order) && getOrderServiceDate(order) === previousServiceDate && !order.driverId && ["", "preparing", "ready"].includes(String(order.queueStatus || ""));
  const todayPreparationOrders = chiangmaiPreparationOrders.filter(order => isTodayOrder(order) || isReadyDriverBacklog(order));
  const canDeleteBeforeDriverQueue = order => ["sales", "admin"].includes(auth.role) && order.deliveryMethod === "company_driver" && !order.driverId && ["preparing", "ready"].includes(order.queueStatus) && !["กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(order.status);
  const readyPreparationOrdersCount = todayPreparationOrders.filter(isPreparationReadyForDriver).length;
  const sortedPreparationOrders = todayPreparationOrders.slice().sort((a, b) => {
    const readyDifference = Number(isPreparationReadyForDriver(b)) - Number(isPreparationReadyForDriver(a));
    if (readyDifference) return readyDifference;
    return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
  });
  const isOpenStoreQueueStatus = (status) => ["pending", "working", "waiting", "partial", "returned"].includes(status || "pending");
  const isOpenPackQueueStatus = (status) => ["pending", "working", "waiting"].includes(status || "pending");
  const storeWorkOrders = (orders || []).filter(order => !["outstation", "grab_pickup", "customer_pickup"].includes(order.deliveryMethod) && order.workflowType === "store_route" && isOpenStoreQueueStatus(order.storeStatus));
  const storePickupOrders = (orders || []).filter(order => ["grab_pickup", "customer_pickup"].includes(order.deliveryMethod) && order.workflowType === "store_route" && isOpenStoreQueueStatus(order.storeStatus));
  const packWorkOrders = preparationOrders.filter(order => !["outstation", "grab_pickup", "customer_pickup"].includes(order.deliveryMethod) && order.packStatus !== "blocked" && isOpenPackQueueStatus(order.packStatus));
  const packPickupOrders = preparationOrders.filter(order => ["grab_pickup", "customer_pickup"].includes(order.deliveryMethod) && order.packStatus !== "blocked" && isOpenPackQueueStatus(order.packStatus));
  const salesOutstationPackOrders = preparationOrders.filter(order => order.deliveryMethod === "outstation" && ["pending", "working", "waiting", "partial"].includes(order.packStatus));
  const salesOutstationOrders = (orders || []).filter(order => order.deliveryMethod === "outstation" && !["outstation_ready", "pack_archived"].includes(order.queueStatus));
  const salesOutstationHistory = (orders || []).filter(order => order.deliveryMethod === "outstation" && order.queueStatus === "outstation_ready");
  const reportToKpiOrder = (report, department) => ({
    ...report,
    id: `report:${report.id}`,
    customerName: report.bookingNumber || (report.type === "online" ? "ใบขายออนไลน์" : "ใบสั่งจอง"),
    workflowType: "store_report",
    storeStatus: report.deletedAt ? "archived" : report.status === "saved" ? "checked" : report.status === "draft" ? "pending" : report.status || "pending",
    packStatus: report.deletedAt ? "archived" : report.packStatus || (department === "pack" ? "pending" : "blocked"),
    queueStatus: report.deletedAt ? "report_archived" : "report_active",
    sourceType: report.type === "online" ? "ใบขายออนไลน์" : "ใบสั่งจอง"
  });
  const storeKpiReportOrders = (storeReports || []).filter(report => ["booking", "online"].includes(report.type)).map(report => reportToKpiOrder(report, "store"));
  const packKpiReportOrders = (storeReports || []).filter(report => ["booking", "online"].includes(report.type)).map(report => reportToKpiOrder(report, "pack"));
  const storeKpiOrders = [...(orders || []).filter(order => order.workflowType === "store_route"), ...storeKpiReportOrders];
  const packKpiOrders = [...(orders || []).filter(order => order.workflowType && order.workflowType !== "direct_driver" && order.packStatus !== "blocked"), ...packKpiReportOrders];
  const activeStoreKpiOrders = storeKpiOrders.filter(order => !["archived"].includes(order.storeStatus));
  const activePackKpiOrders = packKpiOrders.filter(order => !["pack_archived", "report_archived"].includes(order.queueStatus) && order.packStatus !== "archived");
  const storeKpiReturned = storeKpiOrders.filter(order => order.storeStatus === "returned");
  const packKpiReturned = packKpiOrders.filter(order => order.packStatus === "returned");
  const storeKpiPending = activeStoreKpiOrders.filter(order => ["pending", "working", "waiting", "partial", "returned", "draft"].includes(order.storeStatus));
  const packKpiPending = activePackKpiOrders.filter(order => ["pending", "working", "waiting", "partial", "returned"].includes(order.packStatus));
  const isOverdueWorkflowOrder = order => {
    const createdAt = Date.parse(order.createdAt || "");
    return Number.isFinite(createdAt) && Date.now() - createdAt >= 86400000;
  };
  const storeKpiOverdue = storeKpiPending.filter(isOverdueWorkflowOrder);
  const packKpiOverdue = packKpiPending.filter(isOverdueWorkflowOrder);
  const storeKpiCompleted = activeStoreKpiOrders.filter(order => order.storeStatus === "checked");
  const packKpiCompleted = activePackKpiOrders.filter(order => order.packStatus === "checked");
  const getWorkflowEvents = order => Array.isArray(order.activity) && order.activity.length ? order.activity : Array.isArray(order.workflowHistory) ? order.workflowHistory : [];
  const getReturnEvents = order => {
    const events = getWorkflowEvents(order).filter(item => item?.result === "returned" || item?.toStatus === "returned");
    if (events.length || !order.returnedToStoreAt) return events;
    return [{ id: `legacy-return-${order.id}`, action: "pack_update", role: "pack", at: order.returnedToStoreAt, result: "returned", toStatus: "returned", reason: order.returnReason || "", storePackerName: order.storePackerName || "", storeCheckerName: order.storeCheckerName || "" }];
  };
  const buildKpiActivityRows = (sourceOrders, department) => sourceOrders.flatMap(order => {
    const returnedAtMs = Date.parse(order.returnedToStoreAt || 0);
    const events = getWorkflowEvents(order).filter(item => toServiceDateKey(item.at) === todayServiceDate);
    if (order.returnedToStoreAt && toServiceDateKey(order.returnedToStoreAt) === todayServiceDate && !events.some(item => item?.result === "returned" || item?.toStatus === "returned" || Date.parse(item.at || 0) === returnedAtMs)) {
      events.push(getReturnEvents(order)[0]);
    }
    return events.filter(Boolean).map((item, index) => {
      const eventAtMs = Date.parse(item.at || 0);
      const isReturn = item.result === "returned" || item.toStatus === "returned" || (returnedAtMs > 0 && eventAtMs === returnedAtMs);
      const isAfterReturn = returnedAtMs > 0 && eventAtMs > returnedAtMs;
      let title = item.action || "อัปเดตสถานะออเดอร์";
      let note = item.note || order.customerName || order.id;
      if (isReturn) {
        title = "ห้องแพ็คพบของผิดและส่งกลับสโตร์";
        note = `${order.customerName || order.id} · ผู้จัดสโตร์: ${item.storePackerName || order.storePackerName || "ไม่ระบุ"} · ผู้ตรวจสโตร์: ${item.storeCheckerName || order.storeCheckerName || "ไม่ระบุ"} · เหตุผล: ${item.reason || order.returnReason || "ไม่ระบุ"}`;
      } else if (isAfterReturn && item.role === "store") {
        title = "สโตร์แก้ไขและส่งตรวจใหม่";
        note = `${order.customerName || order.id} · ผู้ดำเนินการ: ${item.name || item.packerName || order.storePackerName || "ไม่ระบุ"}`;
      } else if (isAfterReturn && item.role === "pack" && ["checked", "partial"].includes(item.toStatus || order.packStatus)) {
        title = "ห้องแพ็คตรวจซ้ำและปิดเคส";
        note = `${order.customerName || order.id} · ผู้ตรวจ: ${item.checkerName || order.packCheckerName || item.name || "ไม่ระบุ"}`;
      } else if (item.action === "created") title = order.orderEntrySource === "store_assist" ? "สโตร์ช่วยคีย์ออเดอร์เร่งด่วน" : "ฝ่ายขายสร้างออเดอร์";
      else if (item.action === "created_draft") title = `${order.sourceType || "สโตร์"}บันทึกร่าง`;
      else if (item.action === "confirmed") title = `${order.sourceType || "สโตร์"}ยืนยันรายการ`;
      else if (item.action === "updated") title = `${order.sourceType || "สโตร์"}แก้ไขรายการ`;
      else if (item.action === "deleted" || item.action === "pack_archive") title = "นำรายการออกจากคิว (เก็บประวัติ)";
      else if (item.action === "pack_checked") title = `ห้องแพ็คยืนยัน${order.sourceType || "รายการ"}ครบ`;
      else if (item.action === "pack_partial") title = `ห้องแพ็คพบ${order.sourceType || "รายการ"}ของไม่ครบ`;
      else if (item.action === "store_update") title = "สโตร์อัปเดตการตรวจสินค้า";
      else if (item.action === "pack_update") title = "ห้องแพ็คอัปเดตการตรวจสินค้า";
      return { id: `${department}-${order.id}-${item.id || item.at || index}`, at: item.at, title, note };
    });
  });
  const routeTasks = state.routeTasks || [];
  const todayOrdersOnly = (orders || []).filter(isTodayOrder);
  const salesWaitingOrders = (orders || [])
    .filter(order => {
      if (!order.workflowType || order.status === "ส่งสำเร็จ" || ["completed", "pack_archived", "driver_archived", "grab_completed", "grab_picked_up", "outstation_ready"].includes(String(order.queueStatus || ""))) return false;
      if (order.packStatus === "returned") return false;
      return ["waiting", "partial"].includes(order.storeStatus) || ["waiting", "partial"].includes(order.packStatus);
    })
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0));
  const salesWaitingOrdersVisible = salesWaitingOrders.slice(0, 30);
  const storeTodayOrders = storeKpiOrders.filter(order => getOrderServiceDate(order) === todayServiceDate);
  const packTodayOrders = packKpiOrders.filter(order => getOrderServiceDate(order) === todayServiceDate);
  const activeStoreTodayOrders = storeTodayOrders.filter(order => order.storeStatus !== "archived");
  const activePackTodayOrders = packTodayOrders.filter(order => !["pack_archived", "report_archived"].includes(order.queueStatus) && order.packStatus !== "archived");
  const storeTodayCompleted = activeStoreTodayOrders.filter(order => ["checked", "partial"].includes(order.storeStatus)).length;
  const packTodayCompleted = activePackTodayOrders.filter(order => ["checked", "partial"].includes(order.packStatus)).length;
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
  const fetchStoreReports = async ({ date = "", query = "", type = "", includeDeleted = false, kpi = false, silent = false } = {}) => {
    if (!["store", "pack"].includes(auth.role)) return;
    if (storeReportsFetchInFlightRef.current) return;
    storeReportsFetchInFlightRef.current = true;
    if (!silent) setStoreReportsLoading(true);
    try {
      const idToken = await refreshAuthToken(true);
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (query.trim()) params.set("q", query.trim());
      if (includeDeleted) params.set("includeDeleted", "true");
      if (kpi) {
        params.set("kpi", "true");
        params.set("fromDate", `${currentMonthKey}-01`);
      }
      if (type) params.set("type", type);
      const res = await fetch(`/api/store/reports${params.size ? `?${params.toString()}` : ""}`, { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReports(Array.isArray(json.data) ? json.data : []);
      setStoreReportsUpdatedAt(new Date());
    } catch (error) {
      setSyncStatus(`❌ โหลดรายงานสโตร์ไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      storeReportsFetchInFlightRef.current = false;
      if (!silent) setStoreReportsLoading(false);
    }
  };
  const fetchStoreReportIssues = useCallback(async () => {
    if (auth.role !== "store") return;
    if (document.visibilityState !== "visible") return;
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports?alerts=true", { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReportIssues({
        booking: json.data?.booking || { count: 0, items: [] },
        online: json.data?.online || { count: 0, items: [] }
      });
    } catch (error) {
      setSyncStatus(`⚠️ โหลดรายการของไม่ครบไม่สำเร็จ: ${error?.message || error}`);
    }
  }, [auth.role, refreshAuthToken]);
  useEffect(() => {
    if (auth.role !== "store") return;
    fetchStoreReportIssues();
    const timer = window.setInterval(fetchStoreReportIssues, 30000);
    return () => window.clearInterval(timer);
  }, [auth.role, fetchStoreReportIssues]);
  useEffect(() => {
    const isKpi = ["store-dashboard", "pack-dashboard"].includes(displayTab);
    const reportType = ["store-booking", "pack-booking"].includes(displayTab) ? "booking" : ["store-online", "pack-online"].includes(displayTab) ? "online" : "";
    const shouldFetchReports = (auth.role === "store" && ["store-booking", "store-online", "store-dashboard"].includes(displayTab))
      || (auth.role === "pack" && ["pack-booking", "pack-online", "pack-dashboard"].includes(displayTab));
    if (shouldFetchReports) fetchStoreReports({ date: ["store-booking", "store-online", "pack-booking", "pack-online"].includes(displayTab) && !storeReportSearchActive ? storeReportDate : "", query: storeReportSearchActive ? storeReportQuery : "", type: reportType, includeDeleted: isKpi || storeReportIncludeDeleted, kpi: isKpi });
    const isStoreReport = auth.role === "store" && ["store-booking", "store-online"].includes(displayTab);
    if (!isKpi && !isStoreReport) return undefined;
    if (isKpi && !kpiAutoRefresh) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (isKpi) fetchStoreReports({ includeDeleted: true, kpi: true, silent: true });
      else fetchStoreReports({ date: storeReportSearchActive ? "" : storeReportDate, query: storeReportSearchActive ? storeReportQuery : "", type: reportType, includeDeleted: storeReportIncludeDeleted, silent: true });
    }, isKpi ? 300000 : 180000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.role, displayTab, storeReportDate, storeReportSearchActive, storeReportIncludeDeleted, kpiAutoRefresh]);

  const updateReportPackStatus = async (item, packStatus, returnReason = "") => {
    if (packStatus === "returned" && !returnReason.trim()) {
      setOnlineReturnTarget(item);
      setOnlineReturnReason("");
      return;
    }
    const reason = packStatus === "returned" ? returnReason.trim() : "";
    try { const idToken = await refreshAuthToken(true); const res = await fetch("/api/store/reports", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ id: item.id, packStatus, reason }) }); const json = await res.json(); if (!res.ok || !json?.ok) throw new Error(json?.error || "อัปเดตไม่สำเร็จ"); setStoreReports(items => items.map(row => row.id === item.id ? json.data : row)); setSyncStatus("✅ อัปเดตผลตรวจของห้องแพ็คแล้ว"); } catch (e) { setSyncStatus(`❌ อัปเดตไม่สำเร็จ: ${e?.message || e}`); }
  };

  const confirmSelectedPackReports = async (type, ids) => {
    const uniqueIds = [...new Set(ids || [])];
    if (!uniqueIds.length || packReportBulkSubmitting) return;
    setPackReportBulkSubmitting(true);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ action: "bulk_confirm", type, ids: uniqueIds }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "ยืนยันรายการไม่สำเร็จ");
      const confirmedAt = json.data.confirmedAt;
      setStoreReports((items) => items.map((item) => json.data.ids.includes(item.id) ? { ...item, packStatus: "checked", status: "saved", packUpdatedAt: confirmedAt, returnReason: "" } : item));
      setPackReportSelectedIds((current) => current.filter((id) => !json.data.ids.includes(id)));
      setSyncStatus(`✅ ห้องแพ็คยืนยันครบ ${json.data.ids.length} รายการแล้ว`);
    } catch (error) { setSyncStatus(`❌ ยืนยันรายการไม่สำเร็จ: ${error?.message || error}`); }
    finally { setPackReportBulkSubmitting(false); }
  };

  const resubmitStoreReport = async (item) => {
    const reason = window.prompt("ระบุสิ่งที่สโตร์แก้ไขแล้ว (ถ้ามี):", "") ?? "";
    try { const idToken = await refreshAuthToken(true); const res = await fetch("/api/store/reports", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ id: item.id, action: "resubmit", reason }) }); const json = await res.json(); if (!res.ok || !json?.ok) throw new Error(json?.error || "ส่งตรวจใหม่ไม่สำเร็จ"); setStoreReports(items => items.map(row => row.id === item.id ? json.data : row)); setSyncStatus("✅ สโตร์แก้ไขและส่งให้ห้องแพ็คตรวจใหม่แล้ว"); } catch (e) { setSyncStatus(`❌ ส่งตรวจใหม่ไม่สำเร็จ: ${e?.message || e}`); }
  };

  useEffect(() => {
    if (!["sales", "admin", "store"].includes(auth.role)) return;
    const sequence = ++historicalCustomerSearchSeqRef.current;
    const query = (customerQuery.trim().length >= 3 ? customerQuery : orderCustomerSearch).trim();
    if (query.length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const idToken = await refreshAuthToken(true);
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${idToken}` } });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (sequence !== historicalCustomerSearchSeqRef.current) return;
        setHistoricalCustomers((prev) => {
          const byId = new Map(prev.map((customer) => [customer.id, customer]));
          (json.data || []).forEach((customer) => {
            if (!byId.has(customer.id)) byId.set(customer.id, customer);
          });
          return Array.from(byId.values());
        });
      } catch (error) {
        if (sequence === historicalCustomerSearchSeqRef.current) setSyncStatus(`⚠️ ค้นหาข้อมูลเก่าไม่สำเร็จ: ${error?.message || error}`);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [auth.role, customerQuery, orderCustomerSearch, refreshAuthToken]);

  const loadAllHistoricalCustomers = async () => {
    if (allHistoricalCustomersLoading || allHistoricalCustomersLoaded) return;
    setAllHistoricalCustomersLoading(true);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/customers/search?all=true", { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const loaded = Array.isArray(json.data) ? json.data : [];
      setHistoricalCustomers((prev) => {
        const byId = new Map(prev.map((customer) => [customer.id, customer]));
        loaded.forEach((customer) => byId.set(customer.id, { ...(byId.get(customer.id) || {}), ...customer }));
        return Array.from(byId.values());
      });
      setAllHistoricalCustomersLoaded(true);
      setSyncStatus(`✅ โหลดรายชื่อลูกค้าเก่าจาก Firestore ${loaded.length} รายแล้ว`);
    } catch (error) {
      setSyncStatus(`⚠️ โหลดรายชื่อลูกค้าเก่าไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      setAllHistoricalCustomersLoading(false);
    }
  };

  const loadCustomerOrderHistory = async (customer) => {
    const customerId = String(customer?.id || "");
    if (!customerId) return;
    const sequence = ++customerHistorySearchSeqRef.current;
    setCustomerHistoryCustomerId(customerId);
    setCustomerHistory([]);
    setCustomerHistoryLoading(true);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch(`/api/customers/history?customerId=${encodeURIComponent(customerId)}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if (sequence !== customerHistorySearchSeqRef.current) return;
      setCustomerHistory(Array.isArray(json.data?.orders) ? json.data.orders : []);
    } catch (error) {
      if (sequence === customerHistorySearchSeqRef.current) {
        setCustomerHistory([]);
        setSyncStatus(`⚠️ โหลดประวัติออเดอร์ลูกค้าไม่สำเร็จ: ${error?.message || error}`);
      }
    } finally {
      if (sequence === customerHistorySearchSeqRef.current) setCustomerHistoryLoading(false);
    }
  };
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
  const driverCurrentDeliveryOrders = (orders || []).filter(order => order.driverId === driverId && order.status === "กำลังจัดส่ง");
  const driverReorderableOrders = (orders || []).filter(order => order.driverId === driverId && order.status === "กำลังส่ง")
    .slice()
    .sort((a, b) => {
      const av = Number(a.driverSequence);
      const bv = Number(b.driverSequence);
      if (Number.isFinite(av) && Number.isFinite(bv) && av !== bv) return av - bv;
      if (Number.isFinite(av) && !Number.isFinite(bv)) return -1;
      if (!Number.isFinite(av) && Number.isFinite(bv)) return 1;
      return new Date(a.acceptedAt || a.updatedAt || a.createdAt || 0).getTime() - new Date(b.acceptedAt || b.updatedAt || b.createdAt || 0).getTime();
    });
  const driverDeliveryOrders = [...driverCurrentDeliveryOrders, ...driverReorderableOrders];
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
      if (saved.data?.duplicateId) {
        setSelectedCustomerId(saved.data.duplicateId);
        setCustomerQuery(saved.data.duplicateName || normalizedName);
        setSyncStatus(`⚠️ มีลูกค้าเดิมจาก${saved.data.duplicateField || "ข้อมูลซ้ำ"}แล้ว กรุณาเลือกข้อมูลเดิม`);
      } else {
        setSyncStatus(`⚠️ บันทึกลูกค้าไป Firestore ไม่สำเร็จ: ${saved.error}`);
      }
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

  const passwordLogin = async () => {
    if (driverLoginInFlightRef.current) return;
    if (!loginForm.phone.trim()) return;
    const deviceId = getOrCreateDeviceId();
    if (!loginForm.password.trim()) return;
    driverLoginInFlightRef.current = true;
    setDriverLoginSubmitting(true);
    try {
      setSyncStatus("⏳ กำลังเข้าสู่ระบบ...");
      const authClient = getFirebaseAuth();
      const user = authClient.currentUser || (await signInAnon())?.user;
      if (!user) throw new Error("No user");
      const loginUid = user.uid;
      const idToken = await user.getIdToken(true);

      const role = loginForm.role;
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken,
          role,
          name: loginForm.name.trim(),
          username: loginForm.phone.trim(),
          password: loginForm.password.trim(),
          phone: loginForm.phone.trim(),
          deviceId,
          rememberDevice: rememberPhone
        })
      });
      const json = await res.json();
      if (!json?.ok) {
        if (json?.error === "INVALID_PASSWORD") {
          setSyncStatus("❌ Username หรือ Password ไม่ถูกต้อง");
          return;
        }
        if (json?.error === "TOO_MANY_LOGIN_ATTEMPTS") {
          const retryAt = json?.retryAt ? new Date(json.retryAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "อีก 15 นาที";
          setSyncStatus(`⏳ บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่เวลา ${retryAt}`);
          return;
        }
        if (json?.error === "PASSWORD_NOT_SET") {
          setSyncStatus("❌ บัญชีนี้ยังไม่มี Password กรุณาติดต่อผู้ดูแลระบบ");
          return;
        }
        throw new Error(json?.error || "Login failed");
      }
      if (getFirebaseAuth().currentUser?.uid !== loginUid) {
        throw new Error("Session เปลี่ยนระหว่างล็อกอิน กรุณากดเข้าสู่ระบบอีกครั้ง");
      }

      const d = json.data || {};
      const dp = d.driverProfile || null;
      const profileName =
        dp && (dp.firstName || dp.lastName)
          ? `${String(dp.firstName || "").trim()} ${String(dp.lastName || "").trim()}`.trim()
          : "";
      const newAuthState = {
        role: d.role || role,
        // Prefer the registered driver profile name over the login username.
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
    } finally {
      driverLoginInFlightRef.current = false;
      setDriverLoginSubmitting(false);
    }
  };

  const loginDriver = async () => {
    return passwordLogin();
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
      if (!loginForm.password.trim()) {
        setSyncStatus("⚠️ กรุณากรอก Password");
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
	          password: loginForm.password.trim(),
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

  const logout = async () => {
    setState(prev => {
      const updated = { ...prev.onlineDrivers };
      if (auth.driverId) delete updated[auth.driverId];
      return { ...prev, onlineDrivers: updated };
    });
    try { await fbLogout(); } catch {}
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
    const bookingDigits = digitsOnly(orderForm.bookingDigits).slice(0, 4);
    if (bookingDigits && bookingDigits.length !== 4) {
      setSyncStatus("❌ กรุณากรอกเลขที่ใบสั่งจองให้ครบ 4 หลัก");
      return;
    }
    const selectedBookingPrefix = String(orderForm.bookingPrefix === "custom" ? orderForm.bookingCustomPrefix : orderForm.bookingPrefix || "").replace(/-/g, "").trim().toUpperCase();
    if (bookingDigits && !selectedBookingPrefix) {
      setSyncStatus("❌ กรุณากรอกรหัสหน้า หรือเคลียร์เลข 4 หลักออกก่อน");
      return;
    }
    const currentBookingNumber = bookingDigits && selectedBookingPrefix ? `${selectedBookingPrefix}-${bookingDigits}` : "";
    const bookingNumbers = [...new Set([...(orderForm.bookingNumbers || []), currentBookingNumber, orderForm.urgentBookingNumber].map(normalizeBookingNumber).filter(Boolean))];
    const workflowType = orderForm.workflowType;
    const directDriver = workflowType === "direct_driver" && orderForm.deliveryMethod === "company_driver";
    
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
      window: `รอจัดเตรียม ${Number(orderForm.pickupWaitMinutes || 0) || 0} นาที`,
      boxes: Number(orderForm.qty || 0),
      packageUnit: orderForm.packageUnit === "bag" ? "bag" : "box",
      paymentType: orderForm.paymentType || "COD",
      cod: (orderForm.paymentType || "COD") === "COD" ? Number(digitsOnly(orderForm.codAmount) || 0) : 0,
      driverId: "",
      driverName: "",
      salesName: auth.name,
      salesPhone: auth.phone,
      status: "รอจัดเตรียมสินค้า",
      workflowType, deliveryMethod: orderForm.deliveryMethod,
      bookingNumber: bookingNumbers[0] || "",
      bookingNumbers,
      bookingNumberMissing: bookingNumbers.length === 0,
      bookingNumberNotice: bookingNumbers.length === 0 ? "ฝ่ายขายเปิดออเดอร์โดยยังไม่มีเลขใบสั่งจอง" : "",
      shippingCarrier: orderForm.deliveryMethod === "outstation" ? String(orderForm.shippingCarrier || "").trim() : "",
      shippingCarrierOther: String(orderForm.shippingCarrierOther || "").trim(),
      storeStatus: directDriver || workflowType === "direct_pack" ? "skipped" : "pending",
      packStatus: directDriver ? "skipped" : workflowType === "direct_pack" ? "pending" : "blocked",
      queueStatus: directDriver ? "queued" : "preparing",
      urgentDelivery: directDriver,
      photo: "",
      checkInAt: "",
      deliveredAt: "",
      complaint: "",
      salesNote: orderForm.salesNote,
      createdAt: new Date().toISOString()
    };
    setPendingOrder(nextOrder);
    setOrderConfirmError("");
    setShowOrderConfirm(true);
  };

	  const confirmOrder = async () => {
	    if (!pendingOrder || orderConfirmSubmitting) return;
	    const resolvedShippingCarrier = pendingOrder.shippingCarrier === "อื่นๆ" ? String(pendingOrder.shippingCarrierOther || "").trim() : String(pendingOrder.shippingCarrier || "").trim();
	    if (pendingOrder.deliveryMethod === "outstation" && !resolvedShippingCarrier) {
      const message = "กรุณาเลือกบริษัทขนส่งสำหรับออเดอร์ต่างจังหวัดก่อนยืนยัน";
      setOrderConfirmError(message);
      setSyncStatus(`❌ ${message}`);
      return;
    }
    const directDriver = pendingOrder.deliveryMethod === "company_driver" && pendingOrder.workflowType === "direct_driver";
    const workflowType = pendingOrder.deliveryMethod === "outstation" ? "direct_pack" : directDriver ? "direct_driver" : pendingOrder.workflowType;
    const orderToCreate = { ...pendingOrder, workflowType, shippingCarrier: pendingOrder.deliveryMethod === "outstation" ? resolvedShippingCarrier : "", storeStatus: directDriver || workflowType === "direct_pack" ? "skipped" : "pending", packStatus: directDriver ? "skipped" : workflowType === "direct_pack" ? "pending" : "blocked", queueStatus: directDriver ? "queued" : "preparing", status: directDriver ? "รอคนขับรับ" : "รอจัดเตรียมสินค้า", urgentDelivery: directDriver };
    delete orderToCreate.shippingCarrierOther;
    const shouldShareLine = shareNewOrderToLine;
    setOrderConfirmError("");
    setOrderConfirmSubmitting(true);
    setSyncStatus(`⏳ กำลังบันทึกออเดอร์ "${orderToCreate.id}"...`);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ order: orderToCreate })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const rawReason = String(json?.error || `HTTP ${res.status}`).trim();
        if (res.status === 409) {
          const reason = /order id already exists/i.test(rawReason)
            ? "ออเดอร์นี้ถูกบันทึกไปแล้ว อาจเกิดจากกดยืนยันซ้ำหรือกดใหม่หลังสัญญาณขัดข้อง"
            : /booking|ใบสั่ง|เธฅเธข|เธเธ—/i.test(rawReason)
              ? "เลขที่ใบสั่งจองนี้ถูกใช้แล้วในเดือนเดียวกัน กรุณาตรวจสอบเลขก่อนยืนยัน"
              : "ข้อมูลออเดอร์ขัดแย้งกับรายการที่มีอยู่ในระบบ กรุณาตรวจสอบข้อมูลก่อนยืนยันอีกครั้ง";
          const readableDetail = rawReason && !/^HTTP 409$/i.test(rawReason) && !/เธ/.test(rawReason) ? ` · รายละเอียด: ${rawReason}` : "";
          throw new Error(`${reason}${readableDetail}`);
        }
        throw new Error(rawReason);
      }

      setState(prev => {
        const existing = (prev.orders || []).some(order => order.id === orderToCreate.id);
        return existing ? prev : { ...prev, orders: [orderToCreate, ...(prev.orders || [])] };
      });
      setOrderForm({ pickupWaitMinutes: "5", qty: "", packageUnit: "box", paymentType: "COD", codAmount: "", salesNote: "", bookingPrefix: "CSP", bookingCustomPrefix: "", bookingDigits: "", bookingNumbers: [], urgentBookingNumber: "", shippingCarrier: "", shippingCarrierOther: "", workflowType: "store_route", deliveryMethod: "company_driver" });
      setSelectedCustomerId("");
      setOrderCustomerSearch("");
      setShowOrderConfirm(false);
      setOrderConfirmError("");
      setPendingOrder(null);
      setStoreUrgentOpen(false);
      setShareNewOrderToLine(false);

      if (!shouldShareLine) {
        setSyncStatus(`✅ บันทึกออเดอร์ "${orderToCreate.id}" สำเร็จ`);
        return;
      }

      const text = buildLineMessageForNewOrder(orderToCreate);
      let copied = false;
      try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
      if (!navigator?.share) {
        setSyncStatus(copied
          ? `✅ บันทึกออเดอร์แล้ว และคัดลอกข้อความสำหรับ LINE แล้ว`
          : `✅ บันทึกออเดอร์แล้ว แต่อุปกรณ์นี้ไม่รองรับการแชร์`);
        return;
      }
      try {
        await navigator.share({ text });
        setSyncStatus(`✅ บันทึกออเดอร์และเปิดแชร์ LINE แล้ว`);
      } catch {
        setSyncStatus(copied
          ? `✅ บันทึกออเดอร์แล้ว การแชร์ถูกยกเลิก แต่ข้อความถูกคัดลอกไว้แล้ว`
          : `✅ บันทึกออเดอร์แล้ว แต่ยังไม่ได้แชร์ LINE`);
      }
    } catch (error) {
      const message = String(error?.message || error || "ไม่ทราบสาเหตุ");
      setOrderConfirmError(message);
      setSyncStatus(`❌ บันทึกออเดอร์ไม่สำเร็จ: ${message}`);
    } finally {
      setOrderConfirmSubmitting(false);
    }
	  };

  const deleteOrder = async (orderId) => {
    if (!confirm("❌ ลบออเดอร์นี้หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้")) return;
    const previousOrders = state.orders || [];
    setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== orderId) }));
    setSyncStatus(`⏳ กำลังลบออเดอร์ "${orderId}" จาก Firestore...`);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/orders/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ orderId })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const released = Array.isArray(json?.data?.releasedBookingNumbers) ? json.data.releasedBookingNumbers : [];
      setSyncStatus(released.length ? `✅ ยกเลิกออเดอร์ "${orderId}" และคืนเลขใบสั่งจอง ${released.join(", ")} ให้ใช้ใหม่ได้แล้ว` : `✅ ลบออเดอร์ "${orderId}" สำเร็จ`);
    } catch (error) {
      setState(prev => ({ ...prev, orders: previousOrders }));
      setSyncStatus(`❌ ลบออเดอร์ไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  const updateOrder = (id, patch) => {
    console.log(`📝 updateOrder: ${id}`, patch);
    ordersToSyncRef.current.add(id);
    setState(prev => ({ ...prev, orders: prev.orders.map(order => order.id === id ? { ...order, ...patch } : order) }));
	    setTimeout(() => {
	      try { pendingOrderUpdatesRef.current.delete(id); } catch {}
	    }, 250);
	  };

  const saveDriverSequence = (nextOrders) => {
    const now = new Date().toISOString();
    nextOrders.forEach((order, index) => {
      updateOrder(order.id, {
        driverSequence: index + 1,
        driverSequenceServiceDate: todayServiceDate,
        driverSequenceUpdatedAt: now,
        driverSequenceUpdatedBy: state.auth?.name || driverId || "driver"
      });
    });
    setSyncStatus("✅ บันทึกลำดับส่งของแล้ว");
  };

  const resetAllOrders = async () => {
    if (auth.role !== "admin") return setSyncStatus("❌ เฉพาะแอดมินเท่านั้นที่รีเซ็ตออเดอร์ได้");
    if (!window.confirm("ยืนยันอีกครั้ง: ต้องการรีเซ็ตออเดอร์ทั้งหมดหรือไม่? ข้อมูลออเดอร์จะถูกลบ")) return;
    try {
      setSyncStatus("⏳ กำลังลบออเดอร์ทั้งหมด...");
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/admin/reset-orders", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setState(prev => ({ ...prev, orders: [] }));
      setSyncStatus("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ");
      alert("✅ รีเซ็ตออเดอร์ทั้งหมดสำเร็จ");
    } catch (error) {
      setSyncStatus(`❌ รีเซ็ตออเดอร์ไม่สำเร็จ: ${error?.message || error}`);
      alert(`❌ รีเซ็ตไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  const moveDriverSequence = (orderId, direction) => {
    const currentIndex = driverReorderableOrders.findIndex((order) => order.id === orderId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= driverReorderableOrders.length) return;
    const next = driverReorderableOrders.slice();
    [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
    saveDriverSequence(next);
  };

  const dropDriverSequence = (targetId) => {
    if (!driverSequenceDragId || driverSequenceDragId === targetId) return setDriverSequenceDragId("");
    const next = driverReorderableOrders.slice();
    const sourceIndex = next.findIndex((order) => order.id === driverSequenceDragId);
    const targetIndex = next.findIndex((order) => order.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return setDriverSequenceDragId("");
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDriverSequenceDragId("");
    saveDriverSequence(next);
  };

  const acceptDriverDeliveryOrder = async (order) => {
    const authenticatedDriverId = state.auth?.driverId || driverId || "";
    if (!authenticatedDriverId) return setSyncStatus("⚠️ ไม่พบรหัสคนขับ กรุณาออกแล้วเข้าระบบใหม่");
    if (pendingOrderUpdatesRef.current.has(order.id)) return;
    pendingOrderUpdatesRef.current.add(order.id);
    const nextSequence = driverReorderableOrders.reduce((max, item) => Math.max(max, Number(item.driverSequence) || 0), 0) + 1;
    const driverName = drivers.find((driver) => driver.id === authenticatedDriverId)?.name || state.auth?.name || "";
    const acceptedAt = new Date().toISOString();
    const patch = {
      driverId: authenticatedDriverId,
      driverName,
      status: "กำลังส่ง",
      acceptedAt,
      driverSequence: nextSequence,
      driverSequenceServiceDate: todayServiceDate,
      driverSequenceUpdatedAt: acceptedAt,
      driverSequenceUpdatedBy: driverName || authenticatedDriverId,
      updatedAt: acceptedAt
    };
    setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...patch } : item) }));
    setSyncStatus(`⏳ กำลังรับออเดอร์ "${order.id}"...`);
    try {
      const db = getFirestoreDb();
      await fb.updateDoc(fb.doc(db, "orders", String(order.id)), patch);
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...patch } : item) }));
      setSyncStatus(`✅ รับออเดอร์ "${order.id}" และเพิ่มท้ายลำดับส่งแล้ว`);
    } catch (error) {
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...order } : item) }));
      setSyncStatus(`❌ รับออเดอร์ไม่สำเร็จ: ${error?.message || error}`);
    } finally {
      pendingOrderUpdatesRef.current.delete(order.id);
    }
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
      const responseText = await res.text();
      let json = null;
      try { json = responseText ? JSON.parse(responseText) : null; } catch {
        throw new Error(`เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ${res.status})`);
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...json.data } : item) }));
      setSyncStatus(`✅ อัปเดตออเดอร์ ${order.id} แล้ว`);
      return { ok: true };
    } catch (e) {
      const error = e?.message || String(e);
      setSyncStatus(`❌ อัปเดตไม่สำเร็จ: ${error}`);
      return { ok: false, error };
    }
  };

  const cancelDriverDeliveryOrder = async (order) => {
    if (pendingOrderUpdatesRef.current.has(order.id)) return;
    const reason = window.prompt("📝 เหตุผลในการยกเลิก/เลื่อนส่ง:", "");
    if (reason === null) return;
    if (!reason.trim()) return setSyncStatus("⚠️ กรุณาระบุเหตุผลก่อนส่งออเดอร์กลับเข้าคิว");
    pendingOrderUpdatesRef.current.add(order.id);
    try { await updatePreparationWorkflow(order, "driver_cancel", { reason: reason.trim() }); }
    finally { pendingOrderUpdatesRef.current.delete(order.id); }
  };

  const completeDriverDeliveryOrder = async (order, { deliveredAt, driverNote, podPhotoCount }) => {
    if (pendingOrderUpdatesRef.current.has(order.id)) return { ok: false, error: "Order update in progress" };
    pendingOrderUpdatesRef.current.add(order.id);
    try {
      return await updatePreparationWorkflow(order, "driver_complete", { deliveredAt, driverNote, podPhotoCount });
    } finally {
      pendingOrderUpdatesRef.current.delete(order.id);
    }
  };

  const archivePackOrder = async (order) => {
    if (!window.confirm(`นำออเดอร์ "${order.id}" ออกจากคิวห้องแพ็คใช่ไหม?\n\nข้อมูลและ Log จะยังคงถูกเก็บไว้`)) return;
    const reason = window.prompt("ระบุเหตุผล เช่น ส่งไปแล้ว / ออเดอร์ค้าง / รายการซ้ำ:", "");
    if (reason === null) return;
    if (!reason.trim()) return setSyncStatus("⚠️ กรุณาระบุเหตุผลก่อนนำออเดอร์ออกจากคิว");
    setSyncStatus(`⏳ กำลังนำออเดอร์ "${order.id}" ออกจากคิวห้องแพ็ค...`);
    await updatePreparationWorkflow(order, "pack_archive", { reason: reason.trim() });
  };

  const searchChiangmaiHistory = async () => {
    const query = chiangmaiHistoryQuery.trim();
    if (query.length < 2) return setSyncStatus("⚠️ กรุณากรอกคำค้นหาอย่างน้อย 2 ตัวอักษร");
    setChiangmaiHistoryLoading(true);
    setChiangmaiHistorySearched(true);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch(`/api/orders/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setChiangmaiHistoryResults(Array.isArray(json.data) ? json.data : []);
    } catch (error) { setSyncStatus(`❌ ค้นหาประวัติออเดอร์ไม่สำเร็จ: ${error?.message || error}`); }
    finally { setChiangmaiHistoryLoading(false); }
  };

  const openChiangmaiHistoryOrder = async (order) => {
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch(`/api/orders/search?id=${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setChiangmaiHistoryOrder(json.data);
    } catch (error) { setSyncStatus(`❌ เปิดประวัติออเดอร์ไม่สำเร็จ: ${error?.message || error}`); }
  };

  const getOrderTimeline = (order) => {
    const rawActivity = Array.isArray(order?.activity) && order.activity.length ? order.activity : order?.workflowHistory;
    const workflow = Array.isArray(rawActivity) ? rawActivity.map((item, index) => ({ id: item.id || `workflow-${index}`, at: item.at, title: `${item.action || "updated"} · ${item.role || "system"}`, note: item.note || item.name || "" })) : [];
    const delivery = [
      order?.queuedAt && { id: "queued", at: order.queuedAt, title: "ส่งเข้าคิวจัดส่ง", note: order.queuedBy || "" },
      order?.grabReadyAt && { id: "grab-ready", at: order.grabReadyAt, title: order.deliveryMethod === "customer_pickup" ? "ห้องแพ็คยืนยัน · รอลูกค้ารับหน้าร้าน" : "ห้องแพ็คยืนยัน · รอ Grab รับสินค้า", note: order.grabReadyBy || "" },
      order?.grabPickedUpAt && { id: "grab", at: order.grabPickedUpAt, title: "Grab รับสินค้า", note: order.grabPickedUpBy || "" },
      order?.checkInAt && { id: "checkin", at: order.checkInAt, title: "คนขับเช็กอินหน้างาน", note: order.driverName || "" },
      order?.deliveredAt && { id: "delivered", at: order.deliveredAt, title: "จัดส่งสำเร็จ", note: order.driverName || "" }
    ].filter(Boolean);
    return [...workflow, ...delivery].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  };

  const loadCheckerLists = useCallback(async () => {
    if (!["store", "pack", "admin"].includes(auth.role)) return;
    try {
      const idToken = await refreshAuthToken();
      const res = await fetch("/api/preparation/checkers", { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (res.ok && json?.ok) setCheckerLists({ store: Array.isArray(json.data?.store) ? json.data.store : DEFAULT_PREPARATION_CHECKERS.store, pack: Array.isArray(json.data?.pack) ? json.data.pack : DEFAULT_PREPARATION_CHECKERS.pack });
    } catch {}
  }, [auth.role, refreshAuthToken]);

  const saveCheckerList = async (role, names) => {
    const clean = [...new Set(names.map(name => String(name || "").trim()).filter(Boolean))];
    const next = { ...checkerLists, [role]: clean };
    setCheckerLists(next);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/preparation/checkers", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(next) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "บันทึกรายชื่อไม่สำเร็จ");
      setCheckerLists(json.data);
    } catch (error) {
      setCheckerLists(checkerLists);
      setSyncStatus(`❌ บันทึกรายชื่อผู้ตรวจไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  useEffect(() => { loadCheckerLists(); }, [loadCheckerLists]);

  const openWorkModal = (order, role) => {
    clearWorkPhotos();
    delete workPhotoFilesRef.current[`${role}:${order.id}`];
    const details = role === "store" ? order.storeWorkDetails : order.packWorkDetails;
    setWorkModal({ order, role });
    setWorkForm({
      bookingNumber: role === "store" ? normalizeBookingNumber(order.bookingNumber || "") : "",
      detail: details?.detail || "",
      note: details?.note || "",
      missingNote: Array.isArray(order.missingItems) ? order.missingItems.join(", ") : "",
      checkerName: role === "store" ? (order.storeCheckerName || lastCheckerNames.store || auth.name || "") : (order.packCheckerName || lastCheckerNames.pack || auth.name || ""),
      checkResult: "complete",
      checklist: { verified: false }
    });
    setWorkPhotoPreviews([]);
    setWorkSharedToLine(Boolean(details?.sharedToLine));
    setWorkSubmitting(false);
    setWorkSubmitError("");
  };

  const clearWorkPhotos = (modal = workModal) => {
    workPhotoPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    setWorkPhotoPreviews([]);
    if (modal?.order?.id && modal?.role) delete workPhotoFilesRef.current[`${modal.role}:${modal.order.id}`];
  };

  const captureWorkPhoto = (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    if (!selectedFiles.length || !workModal) return;
    const key = `${workModal.role}:${workModal.order.id}`;
    const existing = workPhotoFilesRef.current[key] || [];
    const files = [...existing, ...selectedFiles].slice(0, 5);
    workPhotoFilesRef.current[key] = files;
    setWorkPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
    event.target.value = "";
  };

  const removeWorkPhoto = (index) => {
    if (!workModal) return;
    const key = `${workModal.role}:${workModal.order.id}`;
    const files = (workPhotoFilesRef.current[key] || []).filter((_, i) => i !== index);
    workPhotoFilesRef.current[key] = files;
    setWorkPhotoPreviews(files.map((file) => URL.createObjectURL(file)));
  };

  const validateWorkModal = () => {
    if (!workModal) return false;
    const { role } = workModal;
    const fail = (message) => { setWorkSubmitError(message); setSyncStatus(message); return false; };
    const effectiveBookingNumber = normalizeBookingNumber(workForm.bookingNumber) || getOrderBookingNumbers(workModal.order)[0];
    if (role === "store" && !effectiveBookingNumber) return fail("❌ กรุณากรอกเลขที่ใบสั่งจอง");
    if (role === "store" && !isValidBookingNumber(effectiveBookingNumber)) return fail("❌ เลขที่ใบสั่งจองต้องมีคำนำหน้า ตามด้วย - และตัวเลข 4 หลัก เช่น CSP-1234");
    if (!workForm.checkerName.trim()) return fail(`❌ กรุณาเลือกชื่อผู้ตรวจ${role === "store" ? "สโตร์" : "ห้องแพ็ค"}`);
    if (!workForm.checklist.verified) return fail("❌ กรุณาติ๊กยืนยันว่าตรวจสอบออเดอร์แล้ว");
    if (["partial", "returned"].includes(workForm.checkResult) && !workForm.missingNote.trim()) return fail("❌ กรุณาระบุรายการและเหตุผล");
    return true;
  };

  const shareWorkToLine = async () => {
    if (!workModal) return;
    if (!validateWorkModal()) return;
    const { order, role } = workModal;
    const text = [
      role === "store" ? "📦 สโตร์ยืนยันออเดอร์" : "📦 ห้องแพ็คยืนยันออเดอร์",
      `งาน: ${order.id}`,
      `เลขที่ใบสั่งจอง: ${workForm.bookingNumber || formatOrderBookingNumbers(order) || "-"}`,
      order.customerName ? `ลูกค้า: ${order.customerName}` : "",
      workForm.detail ? `รายละเอียด: ${workForm.detail}` : "",
      workForm.note ? `หมายเหตุ: ${workForm.note}` : "",
      workForm.missingNote ? `ของไม่ครบ/รอของ: ${workForm.missingNote}` : "",
      workForm.checkerName ? `ผู้ตรวจสินค้า: ${workForm.checkerName}` : ""
    ].filter(Boolean).join("\n");
    try {
      let copied = false;
      try { await navigator.clipboard?.writeText?.(text); copied = true; } catch {}
      const files = workPhotoFilesRef.current[`${role}:${order.id}`] || [];
      if (!navigator?.share) throw new Error("อุปกรณ์นี้ไม่รองรับการแชร์");
      const photoSheet = await createLinePhotoSheet(files, `${order.id} · ${order.customerName || ""}`);
      const filesToShare = photoSheet ? [photoSheet] : files;
      if (filesToShare.length && navigator.canShare?.({ files: filesToShare })) await navigator.share({ files: filesToShare, text });
      else await navigator.share({ text });
      setWorkSharedToLine(true);
      const confirmed = await confirmWorkModal(true);
      if (confirmed) setSyncStatus(copied ? "✅ แชร์ LINE และยืนยันออเดอร์แล้ว" : "✅ ยืนยันออเดอร์หลังกลับจาก LINE แล้ว");
    } catch (error) {
      setSyncStatus(`⚠️ ส่ง LINE ไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  const confirmWorkModal = async (sharedToLine = workSharedToLine) => {
    sharedToLine = typeof sharedToLine === "boolean" ? sharedToLine : workSharedToLine;
    if (!workModal || workSubmitting) return false;
    setWorkSubmitError("");
    const { order, role } = workModal;
    if (!validateWorkModal()) return;
    const modalSnapshot = workModal;
    const missingItems = workForm.missingNote.trim() ? [workForm.missingNote.trim()] : [];
    const photoCount = (workPhotoFilesRef.current[`${role}:${order.id}`] || []).length;
    const details = { detail: workForm.detail, note: workForm.note, photoLocal: photoCount > 0, localPhotoCount: photoCount, sharedToLine, checklist: workForm.checklist, checkResult: workForm.checkResult };
    setWorkSubmitting(true);
    const result = await updatePreparationWorkflow(order, role === "store" ? "store_update" : "pack_update", role === "store"
      ? { storeStatus: workForm.checkResult === "partial" ? "partial" : "checked", storePackerName: auth.name, storeCheckerName: workForm.checkerName.trim(), bookingNumber: workForm.bookingNumber, missingItems, storeWorkDetails: details }
      : { packStatus: workForm.checkResult === "returned" ? "returned" : workForm.checkResult === "partial" ? "partial" : "checked", packPackerName: auth.name, packCheckerName: workForm.checkerName.trim(), missingItems, returnReason: workForm.checkResult === "returned" ? workForm.missingNote.trim() : "", packWorkDetails: details });
    setWorkSubmitting(false);
    if (result?.ok) {
      const checkerName = String(workForm.checkerName || "").trim();
      if (checkerName) {
        try {
          const saved = JSON.parse(localStorage.getItem("hillkoff-last-checker-names") || "{}");
          const nextCheckers = { store: String(saved.store || ""), pack: String(saved.pack || ""), [role]: checkerName };
          localStorage.setItem("hillkoff-last-checker-names", JSON.stringify(nextCheckers));
          setLastCheckerNames(nextCheckers);
        } catch {
          setLastCheckerNames(prev => ({ ...prev, [role]: checkerName }));
        }
      }
      clearWorkPhotos(modalSnapshot);
      setWorkModal(null);
      return true;
    }
    setWorkSubmitError(result?.error || "ไม่สามารถบันทึกออเดอร์ได้ กรุณาลองใหม่");
    return false;
  };

  const captureReportPhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    reportPhotoFileRef.current = file;
    setReportPhotoPreview(URL.createObjectURL(file));
    event.target.value = "";
  };

  const shareReportToLine = async () => {
    const text = [`📋 รายงานสโตร์${reportModal === "outstation" ? "ต่างจังหวัด" : "ออนไลน์"}`, ...reportRows.map((row, index) => `${index + 1}. ${row.bookingNumber || "ไม่มีเลขใบสั่งจอง"}${row.detail ? ` · ${row.detail}` : ""}${row.note ? ` · ${row.note}` : ""}`)].join("\n");
    try {
      try { await navigator.clipboard?.writeText?.(text); } catch {}
      if (!navigator?.share) throw new Error("อุปกรณ์นี้ไม่รองรับการแชร์");
      const file = reportPhotoFileRef.current;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else await navigator.share({ text });
      setSyncStatus("✅ เปิดแชร์ LINE สำหรับรายงานแล้ว");
    } catch (error) { setSyncStatus(`⚠️ ส่ง LINE ไม่สำเร็จ: ${error?.message || error}`); }
  };

  const saveStoreReports = async () => {
    if (!reportModal) return;
    if (reportRows.some((row) => row.bookingNumber.trim() && !isValidBookingNumber(row.bookingNumber))) return setSyncStatus("❌ เลขที่ใบสั่งจองต้องมีคำนำหน้าและตามด้วยตัวเลข 4 หลัก");
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ type: reportModal, rows: reportRows }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReports((prev) => [...json.data, ...prev]);
      setReportModal(null);
      setSyncStatus(`✅ บันทึกรายงาน ${json.data.length} รายการแล้ว`);
    } catch (error) {
      setSyncStatus(`❌ บันทึกรายงานไม่สำเร็จ: ${error?.message || error}`);
    }
  };

  const addStoreDraftRow = (type) => {
    if (storeReportDate !== todayServiceDate) return setSyncStatus("⚠️ เพิ่มรายการใหม่ได้เฉพาะวันที่ปัจจุบัน");
    setStoreDraftRows((rows) => ({ ...rows, [type]: [...(rows[type] || []), { draftId: `${Date.now()}-${Math.random()}`, bookingNumber: "", detail: "", note: "", status: "draft" }] }));
  };

  const saveStoreDrafts = async (type) => {
    if (storeReportDate !== todayServiceDate) return [];
    const rows = (storeDraftRows[type] || []).filter((row) => row.bookingNumber.trim() || row.detail.trim() || row.note.trim());
    if (!rows.length) return [];
    if (rows.some((row) => row.bookingNumber.trim() && !isValidBookingNumber(row.bookingNumber))) { setSyncStatus("❌ เลขที่ใบสั่งจองต้องมีคำนำหน้าและตามด้วยตัวเลข 4 หลัก"); return null; }
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ type, rows, draft: true }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReports((prev) => [...json.data, ...prev]);
      setStoreDraftRows((current) => ({ ...current, [type]: [] }));
      setSyncStatus(`✅ บันทึกร่าง ${json.data.length} รายการแล้ว`);
      return json.data;
    } catch (error) { setSyncStatus(`❌ บันทึกร่างไม่สำเร็จ: ${error?.message || error}`); return null; }
  };

  const startStoreReportConfirmation = async (type) => {
    if (storeReportDate !== todayServiceDate) return setSyncStatus("⚠️ วันที่ย้อนหลังดูข้อมูลได้อย่างเดียว ไม่สามารถยืนยันได้");
    const created = await saveStoreDrafts(type);
    if (created === null) return;
    const selectedIds = storeReports.filter((item) => item.type === type && String(item.serviceDate || toServiceDateKey(item.createdAt)) === storeReportDate && !item.confirmedAt && ["draft", "waiting", "partial"].includes(item.status)).map((item) => item.id);
    const ids = [...new Set([...selectedIds, ...created.map((item) => item.id)])];
    if (!ids.length) return setSyncStatus("⚠️ ไม่มีรายการที่รอยืนยันในวันที่เลือก");
    setStoreReportConfirmIds(ids);
    setShowStoreReportConfirm(type);
  };

  const confirmStoreReports = async () => {
    const ids = storeReportConfirmIds;
    if (!ids.length) return setShowStoreReportConfirm(false);
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ ids, type: showStoreReportConfirm, date: storeReportDate }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      const confirmedAt = json.data.confirmedAt;
      setStoreReports((prev) => prev.map((item) => json.data.ids.includes(item.id) ? { ...item, status: item.status === "draft" ? "saved" : item.status, confirmedAt } : item));
      setShowStoreReportConfirm(false);
      setStoreReportConfirmIds([]);
      setSyncStatus(`✅ ยืนยันรายงาน ${ids.length} รายการแล้ว`);
    } catch (error) { setSyncStatus(`❌ ยืนยันรายงานไม่สำเร็จ: ${error?.message || error}`); }
  };

  const saveEditedStoreReport = async () => {
    if (!editingStoreReport) return;
    const normalizedBookingNumber = normalizeBookingNumber(editingStoreReport.bookingNumber || "");
    if (normalizedBookingNumber && !isValidBookingNumber(normalizedBookingNumber)) return setSyncStatus("❌ เลขที่ใบสั่งจองต้องมีคำนำหน้า ตามด้วย - และตัวเลข 4 หลัก");
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ ...editingStoreReport, bookingNumber: normalizedBookingNumber }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReports((prev) => prev.map((item) => item.id === json.data.id ? json.data : item));
      setEditingStoreReport(null);
      setSyncStatus("✅ แก้ไขรายการรายงานแล้ว");
    } catch (error) { setSyncStatus(`❌ แก้ไขรายการไม่สำเร็จ: ${error?.message || error}`); }
  };

  const openStoreReportDetail = async (item) => {
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch(`/api/store/reports?id=${encodeURIComponent(item.id)}`, { headers: { Authorization: `Bearer ${idToken}` } });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReportDetail(json.data);
    } catch (error) { setSyncStatus(`❌ เปิดรายละเอียดไม่สำเร็จ: ${error?.message || error}`); }
  };

  const deleteStoreReport = async (item) => {
    if (!window.confirm(`ยืนยันลบรายการ ${item.bookingNumber || "นี้"} หรือไม่?\nรายการจะถูกซ่อน แต่ประวัติยังคงเก็บในระบบ`)) return;
    try {
      const idToken = await refreshAuthToken(true);
      const res = await fetch("/api/store/reports", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ id: item.id }) });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setStoreReports((prev) => prev.map((report) => report.id === item.id ? json.data : report).filter((report) => storeReportIncludeDeleted || !report.deletedAt));
      setSyncStatus("✅ ลบรายการรายงานแล้ว");
    } catch (error) { setSyncStatus(`❌ ลบรายการไม่สำเร็จ: ${error?.message || error}`); }
  };

  const comparisonLine = (todayValue, previousValue) => {
    const difference = todayValue - previousValue;
    const percent = previousValue ? Math.round((difference / previousValue) * 100) : todayValue ? 100 : 0;
    return `เทียบเมื่อวาน (${previousServiceDate}): ${previousValue} รายการ · ${difference >= 0 ? "+" : ""}${difference} (${percent >= 0 ? "+" : ""}${percent}%)`;
  };
  const projectedEndOfDay = (currentValue) => {
    const now = new Date();
    const bangkokHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(now));
    const elapsed = Math.max(1, Math.min(10, bangkokHour - 8));
    return Math.max(currentValue, Math.round((currentValue / elapsed) * 10));
  };
  const kpiActivitySummary = (tasks, period, department) => {
    const monthKey = todayServiceDate.slice(0, 7);
    const inPeriod = (value) => period === "daily" ? toServiceDateKey(value) === todayServiceDate : String(value || "").slice(0, 7) === monthKey;
    const events = tasks.flatMap((task) => getWorkflowEvents(task).filter((event) => inPeriod(event.at)).map((event, index) => ({ ...event, task, key: `${task.id}-${event.id || event.at || index}` })));
    const count = (actions) => events.filter((event) => actions.includes(event.action)).length;
    const returned = tasks.flatMap((task) => getReturnEvents(task).filter((event) => inPeriod(event.at)).map((event) => ({ ...event, task })));
    const latest = events.slice().sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 8);
    const lines = [
      `รับเข้า/สร้างรายการ: ${count(["created", "created_draft"])} เหตุการณ์`,
      department === "store" ? `สโตร์ตรวจหรือแก้ไข: ${count(["store_update", "confirmed", "updated"])} เหตุการณ์` : `ห้องแพ็คตรวจหรืออัปเดต: ${count(["pack_update", "pack_checked", "pack_partial", "pack_returned"])} เหตุการณ์`,
      `ลบ/นำออกจากคิว: ${count(["deleted", "pack_archive"])} เหตุการณ์`,
      `ส่งกลับแก้ไข: ${returned.length} เหตุการณ์`
    ];
    if (returned.length) {
      lines.push("รายละเอียดงานส่งกลับ:");
      returned.forEach((event) => lines.push(`- ${event.task.bookingNumber || event.task.customerName || event.task.id} · ${event.reason || event.task.returnReason || "ไม่ระบุเหตุผล"} · ผู้จัด: ${event.storePackerName || event.task.storePackerName || "ไม่ระบุ"} · ผู้ตรวจสโตร์: ${event.storeCheckerName || event.task.storeCheckerName || "ไม่ระบุ"} · ผู้ตรวจแพ็ค: ${event.checkerName || event.task.packCheckerName || "ไม่ระบุ"} · สถานะปัจจุบัน: ${["checked", "partial"].includes(event.task.packStatus) ? "แก้ไขและตรวจซ้ำแล้ว" : "อยู่ระหว่างแก้ไข"}`));
    }
    if (latest.length) {
      lines.push("Activity ล่าสุด:");
      latest.forEach((event) => lines.push(`- ${event.at ? new Date(event.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"} ${event.action || "updated"} · ${event.task.bookingNumber || event.task.customerName || event.task.id}`));
    }
    return lines;
  };

  const buildStoreSummary = (period) => {
    const monthKey = todayServiceDate.slice(0, 7);
    const isInPeriod = (value) => {
      const dateKey = String(value || "").slice(0, 10);
      return period === "daily" ? dateKey === todayServiceDate : dateKey.startsWith(monthKey);
    };
    const tasks = storeKpiOrders.filter((item) => isInPeriod(getOrderServiceDate(item)));
    const active = tasks.filter((item) => item.storeStatus !== "archived");
    const nearby = tasks.filter((item) => item.workflowType === "store_route").length;
    const booking = tasks.filter((item) => item.sourceType === "ใบสั่งจอง").length;
    const online = tasks.filter((item) => item.sourceType === "ใบขายออนไลน์").length;
    const pending = active.filter((item) => item.storeStatus === "pending").length;
    const working = active.filter((item) => item.storeStatus === "working").length;
    const completed = active.filter((item) => ["checked", "partial"].includes(item.storeStatus)).length;
    const waiting = active.filter((item) => ["waiting", "partial", "returned"].includes(item.storeStatus)).length;
    const archived = tasks.length - active.length;
    const activityTasks = storeKpiOrders;
    const returned = activityTasks.flatMap(getReturnEvents).filter((event) => isInPeriod(event.at)).length;
    const previousTasks = storeKpiOrders.filter((item) => getOrderServiceDate(item) === previousServiceDate);
    const title = period === "daily" ? `รายงานสโตร์ประจำวัน ${todayServiceDate}` : `รายงานสโตร์ประจำเดือน ${monthKey}`;
    const analysis = period === "daily" ? [comparisonLine(tasks.length, previousTasks.length), `คาดการณ์สิ้นวัน: ประมาณ ${projectedEndOfDay(tasks.length)} รายการ`, waiting > 0 ? `ข้อควรติดตาม: มีงานรอของ/ของไม่ครบ ${waiting} รายการ` : "ข้อควรติดตาม: ไม่มีงานรอของ"] : [`ค่าเฉลี่ยต่อวัน: ${(tasks.length / Math.max(1, Number(todayServiceDate.slice(8, 10)))).toFixed(1)} รายการ`];
    return [title, "", "สรุปยอด", `งานทั้งหมด: ${tasks.length} รายการ`, `เชียงใหม่/ใกล้เคียง และ Grab/รับหน้าร้าน: ${nearby} รายการ`, `ใบสั่งจอง: ${booking} รายการ`, `ใบขายออนไลน์: ${online} รายการ`, `รอตรวจ: ${pending} รายการ`, `กำลังตรวจ: ${working} รายการ`, `ตรวจเสร็จ/ยืนยันแล้ว: ${completed} รายการ`, `ของไม่ครบ/รอของ: ${waiting} รายการ`, `ส่งกลับตรวจ: ${returned} เหตุการณ์`, `นำออกจากคิว: ${archived} รายการ`, "", "วิเคราะห์และคาดการณ์", ...analysis, "", "สรุป Activity", ...kpiActivitySummary(activityTasks, period, "store")].join("\n");
  };

  const copyStoreSummary = async (period) => {
    const text = buildStoreSummary(period);
    try {
      await navigator.clipboard?.writeText?.(text);
      setSyncStatus("✅ คัดลอกรายงานแล้ว");
    } catch { setSyncStatus("⚠️ คัดลอกรายงานไม่สำเร็จ"); }
  };

  const shareStoreSummary = async (period) => {
    const text = buildStoreSummary(period);
    try {
      try { await navigator.clipboard?.writeText?.(text); } catch {}
      if (!navigator?.share) throw new Error("อุปกรณ์นี้ไม่รองรับการแชร์");
      await navigator.share({ title: "รายงานสโตร์", text });
      setSyncStatus("✅ เปิดแชร์รายงานแล้ว");
    } catch (error) { setSyncStatus(`⚠️ ส่งรายงานไม่สำเร็จ: ${error?.message || error}`); }
  };

  const buildPackSummary = (period) => {
    const monthKey = todayServiceDate.slice(0, 7);
    const isInPeriod = value => period === "daily"
      ? String(value || "").slice(0, 10) === todayServiceDate
      : String(value || "").slice(0, 7) === monthKey;
    const packOrders = packKpiOrders.filter(order => isInPeriod(getOrderServiceDate(order)));
    const active = packOrders.filter(order => !["pack_archived", "report_archived"].includes(order.queueStatus) && order.packStatus !== "archived");
    const preparation = packOrders.filter(order => order.workflowType !== "store_report").length;
    const online = packOrders.filter(order => order.sourceType === "ใบขายออนไลน์").length;
    const pending = active.filter(order => order.packStatus === "pending").length;
    const working = active.filter(order => order.packStatus === "working").length;
    const completed = active.filter(order => ["checked", "partial"].includes(order.packStatus)).length;
    const waiting = active.filter(order => ["waiting", "partial", "returned"].includes(order.packStatus)).length;
    const activityTasks = packKpiOrders;
    const returned = activityTasks.flatMap(getReturnEvents).filter(event => isInPeriod(event.at)).length;
    const archived = packOrders.length - active.length;
    const previousTasks = packKpiOrders.filter(order => getOrderServiceDate(order) === previousServiceDate);
    const title = period === "daily" ? `รายงานห้องแพ็คประจำวัน ${todayServiceDate}` : `รายงานห้องแพ็คประจำเดือน ${monthKey}`;
    const analysis = period === "daily" ? [comparisonLine(packOrders.length, previousTasks.length), `คาดการณ์สิ้นวัน: ประมาณ ${projectedEndOfDay(packOrders.length)} รายการ`, waiting > 0 ? `ข้อควรติดตาม: มีงานรอของ/ของไม่ครบ ${waiting} รายการ` : "ข้อควรติดตาม: ไม่มีงานรอของ"] : [`ค่าเฉลี่ยต่อวัน: ${(packOrders.length / Math.max(1, Number(todayServiceDate.slice(8, 10)))).toFixed(1)} รายการ`];
    return [title, "", "สรุปยอด", `งานทั้งหมด: ${packOrders.length} รายการ`, `ออเดอร์เตรียมสินค้า: ${preparation} รายการ`, `ใบขายออนไลน์: ${online} รายการ`, `รอแพ็ค: ${pending} รายการ`, `กำลังแพ็ค: ${working} รายการ`, `แพ็คเสร็จ/ยืนยันแล้ว: ${completed} รายการ`, `รอของ/ของไม่ครบ: ${waiting} รายการ`, `ส่งกลับสโตร์: ${returned} เหตุการณ์`, `นำออกจากคิว: ${archived} รายการ`, "", "วิเคราะห์และคาดการณ์", ...analysis, "", "สรุป Activity", ...kpiActivitySummary(activityTasks, period, "pack")].join("\n");
  };

  const copyPackSummary = async period => {
    try {
      await navigator.clipboard?.writeText?.(buildPackSummary(period));
      setSyncStatus("✅ คัดลอกรายงานห้องแพ็คแล้ว");
    } catch { setSyncStatus("⚠️ คัดลอกรายงานไม่สำเร็จ"); }
  };

  const sharePackSummary = async period => {
    const text = buildPackSummary(period);
    try {
      try { await navigator.clipboard?.writeText?.(text); } catch {}
      if (!navigator?.share) throw new Error("อุปกรณ์นี้ไม่รองรับการแชร์");
      await navigator.share({ title: "รายงานห้องแพ็ค", text });
      setSyncStatus("✅ เปิดแชร์รายงานห้องแพ็คแล้ว");
    } catch (error) { setSyncStatus(`⚠️ ส่งรายงานไม่สำเร็จ: ${error?.message || error}`); }
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
	    const existing = customers.find(c => c.id === id);
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
	    setHistoricalCustomers(prev => prev.map(c => c.id === id ? nextCustomer : c));
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
	        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
	        body: JSON.stringify({ idToken, customerId: id })
	      });
	      const json = await res.json().catch(() => null);
	      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
	      setState(prev => {
	        const nextCustomers = (prev.customers || []).filter(c => c.id !== id);
	        return { ...prev, customers: nextCustomers };
	      });
	      setHistoricalCustomers(prev => prev.filter(c => c.id !== id));
	      if (customerHistoryCustomerId === id) {
	        setCustomerHistoryCustomerId("");
	        setCustomerHistory([]);
	      }
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

  const persistDriverOrderPatch = async (order, patch) => {
    if (pendingOrderUpdatesRef.current.has(order.id)) return { ok: false, error: "Order update in progress" };
    pendingOrderUpdatesRef.current.add(order.id);
    const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
    setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...nextPatch } : item) }));
    try {
      const db = getFirestoreDb();
      await fb.updateDoc(fb.doc(db, "orders", String(order.id)), nextPatch);
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...nextPatch } : item) }));
      return { ok: true };
    } catch (error) {
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, ...order } : item) }));
      return { ok: false, error: error?.message || String(error) };
    } finally {
      pendingOrderUpdatesRef.current.delete(order.id);
    }
  };

  const uploadPod = async (order, selectedFiles) => {
    const incoming = Array.from(selectedFiles || []).filter(file => file?.type?.startsWith("image/"));
    if (!incoming.length) return;
    try {
      const existing = Array.isArray(podFilesRef.current[order.id]) ? podFilesRef.current[order.id] : podFilesRef.current[order.id] ? [podFilesRef.current[order.id]] : [];
      const nextFiles = [...existing, ...incoming].slice(0, 5);
      podFilesRef.current[order.id] = nextFiles;
      const previousPreviews = podPreviewsByOrder[order.id] || [];
      const nextPreviews = [...previousPreviews, ...incoming.slice(0, 5 - existing.length).map(file => URL.createObjectURL(file))].slice(0, 5);
      setPodPreviewsByOrder(prev => ({ ...prev, [order.id]: nextPreviews }));
      setState(prev => ({ ...prev, orders: prev.orders.map(item => item.id === order.id ? { ...item, photo: nextPreviews[0] || item.photo, sharedToLine: false } : item) }));
      setSyncStatus(`✅ เก็บรูป POD แล้ว ${nextFiles.length}/5 รูป — พร้อมส่งพร้อม LINE`);
      if (existing.length + incoming.length > 5) setSyncStatus("⚠️ เก็บได้สูงสุด 5 รูป รูปที่เกินไม่ถูกเพิ่ม");
    } catch (error) {
      setSyncStatus(`❌ บันทึกรูป POD ไม่สำเร็จ: ${error.message || error}`);
    }
  };

  // POD รูปภาพเก็บไว้เฉพาะในเครื่องระหว่างเตรียมแชร์เท่านั้น
  const clearPodPhotos = (orderId) => {
    const previews = podPreviewsByOrder[orderId] || [];
    previews.forEach((preview) => {
      try { URL.revokeObjectURL(preview); } catch {}
    });
    delete podFilesRef.current[orderId];
    setPodPreviewsByOrder((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((item) => item.id === orderId ? { ...item, photo: "" } : item)
    }));
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
    routeTasksToSyncRef.current.add(id);
    setState(prev => ({ ...prev, routeTasks: (prev.routeTasks || []).map(task => task.id === id ? { ...task, ...patch } : task) }));
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

	  const shareOrderToLine = (order, noteDraft) => {
	        if (!navigator?.share) {
	          alert("อุปกรณ์/บราวเซอร์นี้ไม่รองรับการแชร์ กรุณาเปิดผ่านมือถือ");
	          return;
	        }

	    (async () => {
	      let completedOrder = null;
	      let text = "";
      try {
          const deliveredAt = order.deliveredAt || new Date().toLocaleString("th-TH");
          const files = Array.isArray(podFilesRef.current?.[order.id]) ? podFilesRef.current[order.id] : podFilesRef.current?.[order.id] ? [podFilesRef.current[order.id]] : [];
          completedOrder = {
            ...order,
            status: "ส่งสำเร็จ",
            queueStatus: "completed",
            deliveredAt,
	            driverNote: String(noteDraft ?? order.driverNote ?? "").trim(),
            driverName: order.driverName || state.auth?.name || "",
            driverId: order.driverId || state.auth?.driverId || driverId || "",
            sharedToLine: true,
            podPhotoCount: files.length
          };
	        text = buildLineMessageForOrder(completedOrder);
	        try { await navigator.clipboard?.writeText?.(text); } catch {}
	        const photoSheet = await createLinePhotoSheet(files, `${order.id} · ${order.customerName || ""}`);
	        const filesToShare = photoSheet ? [photoSheet] : files;

	        if (filesToShare.length && navigator.canShare?.({ files: filesToShare })) {
	          await navigator.share({ files: filesToShare, text });
	        } else {
	          await navigator.share({ text });
	        }
        const saved = await completeDriverDeliveryOrder(order, {
          deliveredAt: completedOrder.deliveredAt,
          driverNote: completedOrder.driverNote,
          podPhotoCount: files.length || Number(order.podPhotoCount) || 0
        });
	        if (!saved.ok) throw new Error(saved.error);
	        // ล้างไฟล์และ preview หลังบันทึกส่งสำเร็จ เช่นเดียวกับ flow ห้องแพ็ค
	        clearPodPhotos(order.id);
	        setDriverNoteDrafts((drafts) => { const next = { ...drafts }; delete next[order.id]; return next; });
	        setSyncStatus(`✅ ส่งสำเร็จและส่งพร้อม LINE แล้ว ${files.length} รูป (${order.id})`);
      } catch (error) {
        try { await navigator.clipboard?.writeText?.(text); } catch {}
        setSyncStatus(`⚠️ ยังไม่บันทึกส่งสำเร็จ: แชร์ LINE ถูกยกเลิก/ไม่สำเร็จ (${order.id})`);
	      }
	    })();
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
              <div className="panel-head"><h1>เข้าสู่ระบบ</h1><span>{loginForm.role === "driver" ? "Username + Password" : "บัญชีพนักงาน"}</span></div>
              <div className="segmented">
                <button className={loginForm.role === "sales" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "sales" }))}>ฝ่ายขาย</button>
                <button className={loginForm.role === "driver" ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "driver" }))}>คนขับ</button>
                <button className={["store", "pack"].includes(loginForm.role) ? "active" : ""} onClick={() => setLoginForm(p => ({ ...p, role: "store" }))}>สโตร์/ห้องแพ็ค</button>
              </div>
              {["store", "pack"].includes(loginForm.role) ? (
                <>
                  <input value={loginForm.username} onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))} placeholder="ชื่อผู้ใช้" autoComplete="username" />
                  <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="รหัสผ่าน" autoComplete="current-password" />
                  <button className="primary wide" onClick={loginStaff}>เข้าสู่ระบบสโตร์/ห้องแพ็ค</button>
                  <p className="login-note">บัญชีและแผนกกำหนดโดย Admin เท่านั้น</p>
                </>
              ) : (
              <>
              {loginForm.role === "sales" && <input value={loginForm.name} onChange={e => setLoginForm(p => ({ ...p, name: e.target.value }))} placeholder="ชื่อผู้ใช้งานฝ่ายขาย" />}
              {loginForm.role === "driver" && <input value={loginForm.phone} onChange={e => setLoginForm(p => ({ ...p, phone: e.target.value }))} placeholder="Username (เบอร์โทร)" inputMode="tel" autoComplete="username" />}
              {loginForm.role === "sales" && (googleOtpStage === "otp" ? (
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
              ))}
              {loginForm.role === "sales" && <p className="login-note">ฝ่ายขายเข้าสู่ระบบด้วย Google อีเมล @hillkoff.com เท่านั้น</p>}
              {loginForm.role === "driver" && <>
                <input type="password" value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="Password" autoComplete="current-password" />
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px" }}>
                  <input type="checkbox" checked={rememberPhone} onChange={e => setRememberPhone(e.target.checked)} />
                  จดจำ Username ในครั้งต่อไป
                </label>
                <button className="primary wide" onClick={loginDriver} disabled={driverLoginSubmitting}>
                  {driverLoginSubmitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบคนขับ"}
                </button>
                <p className="login-note">ใช้เบอร์โทรเป็น Username ระบบจะเรียกชื่อและประวัติที่ผูกกับบัญชีให้อัตโนมัติ</p>
              </>}
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

  const selectAppTab = (nextTab) => {
    setTab(nextTab);
  };

  return (
    <>
      <main>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src="/delivery-logo.svg" alt="Hillkoff Delivery" />
          <div><strong>Hillkoff</strong><span>Delivery System</span></div>
        </div>
        <nav className="app-nav" aria-label="เมนูหลัก">
          {["sales", "admin"].includes(auth.role) && (
            <>
              <button type="button" className={displayTab === "sales" ? "active" : ""} onClick={() => selectAppTab("sales")}><Store size={18} /> แดชบอร์ดการขาย</button>
              <button type="button" className={displayTab === "sales-outstation" ? "active" : ""} onClick={() => selectAppTab("sales-outstation")}><FileText size={18} /> ออเดอร์ต่างจังหวัด</button>
              <button type="button" className={displayTab === "dispatch" ? "active" : ""} onClick={() => selectAppTab("dispatch")}><Users size={18} /> แดชบอร์ดการจัดส่ง</button>
              <button type="button" className={displayTab === "chiangmai" ? "active" : ""} onClick={() => selectAppTab("chiangmai")}><PackagePlus size={18} /> <span>เตรียมออเดอร์เชียงใหม่</span>{todayPreparationOrders.length > 0 && <span className="nav-count-badge" aria-label={`ออเดอร์เชียงใหม่ในคิวเตรียม ${todayPreparationOrders.length} งาน`}>{todayPreparationOrders.length}</span>}</button>
              <button type="button" className={displayTab === "driver-sop-report" ? "active" : ""} onClick={() => selectAppTab("driver-sop-report")}><ClipboardList size={18} /> รายงานตรวจรถ</button>
            </>
          )}
          {auth.role === "driver" && (
            <>
              <button type="button" className={displayTab === "driver" ? "active" : ""} onClick={() => selectAppTab("driver")}><Truck size={18} /> งานจัดส่ง</button>
              <button type="button" className={displayTab === "driver-prep" ? "active" : ""} onClick={() => selectAppTab("driver-prep")}><PackagePlus size={18} /> เช็คออเดอร์เชียงใหม่</button>
              <button type="button" className={displayTab === "driver-vehicle" ? "active" : ""} onClick={() => selectAppTab("driver-vehicle")}><FileSpreadsheet size={18} /> บันทึกการใช้รถ</button>
              <button type="button" className={displayTab === "driver-sop" ? "active" : ""} onClick={() => selectAppTab("driver-sop")}><ClipboardList size={18} /> ตรวจรถประจำวัน</button>
              <button type="button" className={displayTab === "driver-dashboard" ? "active" : ""} onClick={() => selectAppTab("driver-dashboard")}><ChartNoAxesCombined size={18} /> รายงาน KPI คนขับ</button>
            </>
          )}
          {auth.role === "store" && (
            <>
              <button type="button" className={displayTab === "store-work" ? "active" : ""} onClick={() => selectAppTab("store-work")}><PackagePlus size={18} /> <span>เชียงใหม่/ใกล้เคียง</span>{storeWorkOrders.length > 0 && <span className="nav-count-badge" aria-label={`ออเดอร์เชียงใหม่หรือจังหวัดใกล้เคียงที่รอสโตร์ ${storeWorkOrders.length} งาน`}>{storeWorkOrders.length}</span>}</button>
              <button type="button" className={displayTab === "store-pickup" ? "active" : ""} onClick={() => selectAppTab("store-pickup")}><Store size={18} /> <span>Grab/รับหน้าร้าน</span>{storePickupOrders.length > 0 && <span className="nav-count-badge" aria-label={`งาน Grab หรือรับหน้าร้านที่รอสโตร์ ${storePickupOrders.length} งาน`}>{storePickupOrders.length}</span>}</button>
              <button type="button" className={displayTab === "store-booking" ? "active" : ""} onClick={() => selectAppTab("store-booking")}><FileText size={18} /> ใบสั่งจอง{storeReportIssues.booking.count > 0 && <span className="nav-count-badge" aria-label={`ใบสั่งจองของไม่ครบ ${storeReportIssues.booking.count} รายการ`}>{storeReportIssues.booking.count}</span>}</button>
              <button type="button" className={displayTab === "store-online" ? "active" : ""} onClick={() => selectAppTab("store-online")}><FileSpreadsheet size={18} /> ใบขายออนไลน์{storeReportIssues.online.count > 0 && <span className="nav-count-badge" aria-label={`ใบขายออนไลน์ของไม่ครบ ${storeReportIssues.online.count} รายการ`}>{storeReportIssues.online.count}</span>}</button>
              <button type="button" className={displayTab === "store-dashboard" ? "active" : ""} onClick={() => selectAppTab("store-dashboard")}><ClipboardList size={18} /> รายงาน KPI สโตร์{storeReportIssues.booking.count + storeReportIssues.online.count > 0 && <span className="nav-count-badge" aria-label={`งานของไม่ครบรวม ${storeReportIssues.booking.count + storeReportIssues.online.count} รายการ`}>{storeReportIssues.booking.count + storeReportIssues.online.count}</span>}</button>
            </>
          )}
          {auth.role === "pack" && (
            <>
              <button type="button" className={displayTab === "pack-work" ? "active" : ""} onClick={() => selectAppTab("pack-work")}><PackagePlus size={18} /> <span>เชียงใหม่/ใกล้เคียง</span>{packWorkOrders.length > 0 && <span className="nav-count-badge" aria-label={`ออเดอร์เชียงใหม่หรือจังหวัดใกล้เคียงที่รอห้องแพ็ค ${packWorkOrders.length} งาน`}>{packWorkOrders.length}</span>}</button>
              <button type="button" className={displayTab === "pack-pickup" ? "active" : ""} onClick={() => selectAppTab("pack-pickup")}><Store size={18} /> <span>Grab/รับหน้าร้าน</span>{packPickupOrders.length > 0 && <span className="nav-count-badge" aria-label={`งาน Grab หรือรับหน้าร้านที่รอห้องแพ็ค ${packPickupOrders.length} งาน`}>{packPickupOrders.length}</span>}</button>
              <button type="button" className={displayTab === "pack-outstation" ? "active" : ""} onClick={() => selectAppTab("pack-outstation")}><FileText size={18} /> <span>ออเดอร์ต่างจังหวัด</span>{salesOutstationPackOrders.length > 0 && <span className="nav-count-badge" aria-label={`ออเดอร์ต่างจังหวัดที่รอห้องแพ็ค ${salesOutstationPackOrders.length} งาน`}>{salesOutstationPackOrders.length}</span>}</button>
              <button type="button" className={displayTab === "pack-booking" ? "active" : ""} onClick={() => selectAppTab("pack-booking")}><FileText size={18} /> ใบสั่งจอง</button>
              <button type="button" className={displayTab === "pack-online" ? "active" : ""} onClick={() => selectAppTab("pack-online")}><Store size={18} /> ใบขายออนไลน์</button>
              <button type="button" className={displayTab === "pack-dashboard" ? "active" : ""} onClick={() => selectAppTab("pack-dashboard")}><ClipboardList size={18} /> รายงาน KPI ห้องแพ็ค</button>
            </>
          )}
           {["sales", "admin"].includes(auth.role) && (
             <>
               <button type="button" className={displayTab === "reports" ? "active" : ""} onClick={() => selectAppTab("reports")}><ClipboardList size={18} /> รายงานประจำวัน</button>
               <button type="button" className={displayTab === "settings" ? "active" : ""} onClick={() => selectAppTab("settings")}><Settings size={18} /> การตั้งค่า</button>
               {["sales", "admin"].includes(auth.role) && (
                 <button type="button" className={aiOpen ? "active" : ""} onClick={() => setAiOpen(true)}><Sparkles size={18} /> แชทบอทฐานข้อมูล</button>
               )}
             </>
           )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>เชียงใหม่และจังหวัดใกล้เคียง · {todayText()}</p>
            <h1>{TAB_TITLES[displayTab] || "ระบบจัดการงาน"}</h1>
          </div>
          <div className="top-actions">
            <span className="google-status">{{ driver: "คนขับ", sales: "ฝ่ายขาย", admin: "Admin", store: "สโตร์", pack: "ห้องแพ็ค" }[auth.role] || auth.role}: {auth.name || auth.phone || auth.email}</span>
            {["store-dashboard", "pack-dashboard"].includes(displayTab) && <span className="ops-realtime-status">{syncStatus}</span>}
            <button className="secondary" onClick={logout}>ออก</button>
          </div>
        </header>
        {!['store-dashboard', 'pack-dashboard'].includes(displayTab) && <div className="sync-banner" role="status" aria-live="polite">{syncStatus}</div>}
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
                <button className="secondary" aria-label="ปิดแชทบอท" style={{ padding: "6px 10px", fontSize: "12px" }} onClick={() => setAiOpen(false)}>✕</button>
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

        {!['store-dashboard', 'pack-dashboard'].includes(displayTab) && !["store", "pack", "driver"].includes(auth.role) && <div className="stats">
          <>
            <StoreMetricCard icon={PackagePlus} title="ออเดอร์วันนี้" value={totals.jobs} suffix=" งาน" description="ฝ่ายขายเปิดงานส่ง" />
            <StoreMetricCard icon={UserCheck} title="รอคนขับรับ" value={totals.waiting} suffix=" งาน" description="เด้งเข้าหน้าคนขับ" tone="#92400e" />
            <StoreMetricCard icon={Navigation} title="กำลังส่ง" value={totals.active} suffix=" งาน" description="เช็คอินได้จากหน้างาน" tone="#1d4ed8" />
            <StoreMetricCard icon={CheckCircle2} title="ส่งสำเร็จ" value={totals.done} suffix=" งาน" description="ต้องมีหลักฐานรูปถ่าย" tone="#166534" />
            <StoreMetricCard icon={MapPinned} title="งานวิ่งวันนี้" value={todayRouteTasks.length} suffix=" งาน" description="วิ่งสาขาและงานวิ่งไกล" tone="#0e7490" />
          </>
        </div>}

        {displayTab === "sales" && (
          <>
            <div className="sales-grid">
            {syncStatus && syncStatus !== "Local mode" && (
              <section className="panel" style={{ gridColumn: "1 / -1", background: "#fef3c7", borderLeft: "4px solid #f59e0b" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "#92400e" }}>✓ {syncStatus}</p>
              </section>
            )}
            <section className="panel" style={{ gridColumn: "1 / -1", borderLeft: "4px solid #dc2626", background: "#fffafa" }}>
              <div className="panel-head"><h2>⏳ งานรอของ / ของไม่ครบ</h2><span>{salesWaitingOrders.length} งาน{salesWaitingOrders.length > salesWaitingOrdersVisible.length ? ` · แสดง ${salesWaitingOrdersVisible.length} งานล่าสุด` : ""}</span></div>
              {salesWaitingOrdersVisible.length === 0 ? <p className="muted" style={{ margin: 0 }}>ไม่มีงานรอของหรือของไม่ครบ</p> : <div style={{ display: "grid", gap: "8px" }}>{salesWaitingOrdersVisible.map(order => <article key={order.id} style={{ background: "white", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px", display: "grid", gap: "6px" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}><div><b>{order.id}</b><div className="muted">{order.customerName || "-"} · วันที่งาน {getOrderServiceDate(order) || "-"}</div></div><span className="status-chip" style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", fontWeight: 800 }}>รอของ / ของไม่ครบ</span></div><div style={{ display: "flex", gap: "7px", flexWrap: "wrap", fontSize: "12px" }}><span className="status-chip">สโตร์: {order.storeStatus === "partial" ? "ของไม่ครบ" : "รอของ"}</span><span className="status-chip">ห้องแพ็ค: {order.packStatus === "partial" ? "ของไม่ครบ" : order.packStatus === "waiting" ? "รอของ" : order.packStatus || "รอตรวจ"}</span></div>{Array.isArray(order.missingItems) && order.missingItems.length > 0 && <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: "6px", padding: "7px", fontSize: "12px" }}><b>รายการที่รอ:</b> {order.missingItems.join(", ")}</div>}<small className="muted">อัปเดตล่าสุด {formatThaiDateTime(order.updatedAt || order.createdAt)}</small></article>)}</div>}
            </section>
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

            <section className="panel" style={{ gridColumn: "1 / -1", order: 99 }}>
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

            <section className="panel" style={{ order: -10 }}>
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
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button className="secondary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => {
                      setEditingCustomerId(selectedCustomer.id);
                      setEditCustomerForm(selectedCustomer);
                    }}>✏️ แก้ไขข้อมูล</button>
                    <button className="secondary" style={{ padding: "8px", fontSize: "12px" }} onClick={() => loadCustomerOrderHistory(selectedCustomer)} disabled={customerHistoryLoading && customerHistoryCustomerId === selectedCustomer.id}>
                      {customerHistoryLoading && customerHistoryCustomerId === selectedCustomer.id ? "กำลังโหลด…" : "📚 ดูประวัติออเดอร์"}
                    </button>
                    <button className="secondary danger" style={{ padding: "8px", fontSize: "12px" }} onClick={() => deleteCustomer(selectedCustomer)}>ลบลูกค้า</button>
                  </div>
                  {customerHistoryCustomerId === selectedCustomer.id && (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #bbf7d0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                        <b style={{ fontSize: "13px" }}>ประวัติออเดอร์ทั้งหมด</b>
                        {!customerHistoryLoading && <span className="status-chip">พบ {customerHistory.length} งาน</span>}
                      </div>
                      {customerHistoryLoading ? <p className="muted" style={{ margin: 0 }}>กำลังค้นหาออเดอร์เก่าจาก Firestore…</p> : customerHistory.length === 0 ? (
                        <p className="muted" style={{ margin: 0 }}>ยังไม่พบออเดอร์ของลูกค้ารายนี้</p>
                      ) : (
                        <div style={{ display: "grid", gap: "7px", maxHeight: "420px", overflowY: "auto" }}>
                          {customerHistory.map(order => (
                            <article key={order.id} style={{ background: "#fff", border: "1px solid #d1fae5", borderRadius: "8px", padding: "8px", display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                              <div style={{ minWidth: 0 }}>
                                <b style={{ fontSize: "12px" }}>{order.id} · {order.customerName || selectedCustomer.name}</b>
                                <div className="muted" style={{ fontSize: "11px" }}>ใบสั่งจอง: {order.bookingNumber || "-"} · {order.zone || selectedCustomer.zone || "-"}</div>
                                <div className="muted" style={{ fontSize: "11px" }}>สถานะ: {order.status || "-"} · อัปเดต {order.updatedAt || order.createdAt || "-"}</div>
                              </div>
                              <button className="secondary" style={{ padding: "6px 8px", fontSize: "11px", whiteSpace: "nowrap" }} onClick={() => openChiangmaiHistoryOrder(order)}>ดูรายละเอียด</button>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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

            <section className="panel" style={{ order: -10 }}>
              <div className="panel-head"><h2>เปิดออเดอร์ส่งของ</h2><span>ค้นหารายชื่อลูกค้าทั้งหมดจาก Firestore</span></div>
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
                    {q && matches.length === 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "8px", padding: "8px 10px", border: "1px dashed #9ac7a4", borderRadius: "9px", background: "#f5fbf4", fontSize: "12px" }}>
                        <span>{allHistoricalCustomersLoaded ? "ยังไม่พบชื่อลูกค้าที่ตรงกันในข้อมูลที่โหลดแล้ว" : "ยังไม่พบในรายชื่อที่แสดงอยู่"}</span>
                        <button type="button" className="secondary" disabled={allHistoricalCustomersLoading || allHistoricalCustomersLoaded} onClick={loadAllHistoricalCustomers}>{allHistoricalCustomersLoading ? "กำลังโหลด…" : allHistoricalCustomersLoaded ? "โหลดข้อมูลแล้ว" : "โหลดข้อมูลลูกค้าเก่าทั้งหมด"}</button>
                      </div>
                    )}
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
                  <option value="5">เวลารอจัดเตรียมสินค้า: 5 นาที</option>
                  <option value="10">เวลารอจัดเตรียมสินค้า: 10 นาที</option>
                  <option value="15">เวลารอจัดเตรียมสินค้า: 15 นาที</option>
                  <option value="20">เวลารอจัดเตรียมสินค้า: 20 นาที</option>
                  <option value="30">เวลารอจัดเตรียมสินค้า: 30 นาที</option>
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 92px", gap: "8px", alignItems: "center" }}>
                  <input
                    value={orderForm.qty}
                    onChange={e => setOrderForm(p => ({ ...p, qty: digitsOnly(e.target.value) }))}
                    inputMode="numeric"
                    type="text"
                    placeholder="จำนวนของที่ส่ง"
                  />
                  <select value={orderForm.packageUnit} onChange={e => setOrderForm(p => ({ ...p, packageUnit: e.target.value }))} aria-label="หน่วยของที่ส่ง"><option value="box">กล่อง</option><option value="bag">ถุง</option></select>
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
              <div style={{ display: "grid", gap: "7px" }}><span style={{ fontSize: "12px", fontWeight: 800 }}>เลขที่ใบสั่งจอง * <small className="muted">(เพิ่มได้หลายเลข · สร้างเพียง 1 ออเดอร์)</small></span><div style={{ display: "grid", gridTemplateColumns: orderForm.bookingPrefix === "custom" ? "92px minmax(92px, .8fr) 1fr auto" : "92px 1fr auto", gap: "8px" }}><select value={orderForm.bookingPrefix} onChange={e => setOrderForm(p => ({ ...p, bookingPrefix: e.target.value, bookingCustomPrefix: e.target.value === "custom" ? "" : p.bookingCustomPrefix }))}><option value="CSP">CSP</option><option value="CSR">CSR</option><option value="TSR">TSR</option><option value="AS7">AS7</option><option value="AS2">AS2</option><option value="AS1">AS1</option><option value="AS6">AS6</option><option value="custom">เพิ่มรหัสเอง</option></select>{orderForm.bookingPrefix === "custom" && <input value={orderForm.bookingCustomPrefix} onChange={e => setOrderForm(p => ({ ...p, bookingCustomPrefix: e.target.value.replace(/-/g, "").trim().toUpperCase().slice(0, 20) }))} placeholder="รหัสหน้า" aria-label="กรอกรหัสหน้าเอง" />}<input value={orderForm.bookingDigits} onChange={e => setOrderForm(p => ({ ...p, bookingDigits: digitsOnly(e.target.value).slice(0, 4) }))} inputMode="numeric" maxLength={4} placeholder="ตัวเลข 4 หลัก" /><button type="button" className="secondary" onClick={() => { const digits = digitsOnly(orderForm.bookingDigits); const prefix = String(orderForm.bookingPrefix === "custom" ? orderForm.bookingCustomPrefix : orderForm.bookingPrefix || "").replace(/-/g, "").trim().toUpperCase(); if (!prefix) return setSyncStatus("❌ กรุณากรอกรหัสหน้า"); if (digits.length !== 4) return setSyncStatus("❌ กรุณากรอกเลขให้ครบ 4 หลัก"); const value = `${prefix}-${digits}`; setOrderForm(p => ({ ...p, bookingDigits: "", bookingNumbers: [...new Set([...(p.bookingNumbers || []), value])] })); }}>เพิ่มเลข</button></div>{(orderForm.bookingNumbers || []).length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{orderForm.bookingNumbers.map(value => <span key={value} className="status-chip">{value}<button type="button" aria-label={`ลบ ${value}`} onClick={() => setOrderForm(p => ({ ...p, bookingNumbers: p.bookingNumbers.filter(item => item !== value) }))} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#991b1b", fontWeight: 900 }}>×</button></span>)}</div>}<small className="muted">ตรวจซ้ำจากรหัสเต็ม เช่น CSP-1234 และ CSR-1234 ใช้พร้อมกันได้ · กรอกรหัสหน้าเองได้โดยไม่ใช้คำว่า OTHER · รหัสเดียวกันห้ามซ้ำภายในเดือน</small></div>
              <button className="primary wide" onClick={createOrder}><PackagePlus size={18} /> ส่งออเดอร์เข้าคิวเตรียมสินค้า</button>
            </section>

            <section className="panel" style={{ order: -10 }}>
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
                        <button className="secondary danger" aria-label={`ลบออเดอร์ ${order.id}`} style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>ลบ</button>
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

        {displayTab === "sales-outstation" && (
          <section className="panel role-workspace">
            <div className="panel-head"><h2>ออเดอร์ต่างจังหวัดจากฝ่ายขาย</h2><span>{salesOutstationOrders.length} งานที่กำลังเตรียม</span></div>
            <p className="muted">งานต่างจังหวัดส่งตรงห้องแพ็ค สถานะอัปเดตทันทีเมื่อห้องแพ็คยืนยันงาน</p>
            <div style={{ display: "grid", gap: "10px" }}>{salesOutstationOrders.map(order => <article key={order.id} className="role-order-card"><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">ใบสั่งจอง: {order.bookingNumber || "ยังไม่ระบุ"} · ขนส่ง: {order.shippingCarrier || "-"}</div></div><span className="status-chip">{order.queueStatus === "outstation_ready" ? "พร้อมส่งขนส่ง" : "กำลังเตรียม"}</span></div><div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}><span className="status-chip">เส้นทาง: ส่งตรงห้องแพ็ค</span><span className="status-chip">ห้องแพ็ค: {WORKFLOW_STATUS_META[order.packStatus]?.label || order.packStatus || "รอรับงาน"}</span>{order.packCheckerName && <span className="muted">ผู้ตรวจแพ็ค: {order.packCheckerName}</span>}</div><details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์</summary><PackSalesOrderDetails order={order} /></details>{order.packWorkDetails?.note && <div className="prep-work-notes"><div className="prep-note-pack"><b>หมายเหตุห้องแพ็ค</b><span>{order.packWorkDetails.note}</span></div></div>}</article>)}{!salesOutstationOrders.length && <p className="muted">ยังไม่มีออเดอร์ต่างจังหวัดจากฝ่ายขาย</p>}</div>
            <details className="prep-order-details" style={{ marginTop: "14px" }}><summary>ประวัติออเดอร์ต่างจังหวัดที่ห้องแพ็คยืนยันแล้ว ({salesOutstationHistory.length})</summary><div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>{salesOutstationHistory.map(order => <article key={order.id} className="role-order-card"><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">ใบสั่งจอง: {order.bookingNumber || "ยังไม่ระบุ"} · ขนส่ง: {order.shippingCarrier || "-"}</div></div><span className="status-chip" style={{ color: "#166534", background: "#dcfce7" }}>สำเร็จ · พร้อมส่งขนส่ง</span></div><div className="muted">ห้องแพ็คยืนยันโดย: {order.packCheckerName || "-"} · {order.outstationCompletedAt ? new Date(order.outstationCompletedAt).toLocaleString("th-TH") : "-"}</div><details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์</summary><PackSalesOrderDetails order={order} /></details></article>)}{!salesOutstationHistory.length && <p className="muted">ยังไม่มีประวัติออเดอร์ที่เสร็จแล้ว</p>}</div></details>
          </section>
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

        {storeUrgentOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
          <section className="panel role-workspace ops-workspace" style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflowY: "auto", display: "grid", gap: "14px" }}>
            <div className="panel-head"><h2>เปิดออเดอร์เร่งด่วน</h2><button className="secondary" onClick={() => setStoreUrgentOpen(false)}>ปิด</button></div>
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "5px solid #2563eb", borderRadius: "9px", padding: "10px", fontSize: "13px" }}><b>ใช้ฐานลูกค้ากลางชุดเดียวกับฝ่ายขาย</b><div className="muted" style={{ marginTop: "3px" }}>ทุกออเดอร์จะบันทึกอัตโนมัติว่า “สโตร์ช่วยคีย์” และฝ่ายขายสามารถเปิดข้อมูลเดิมมาเติมรายละเอียดต่อได้</div></div>
            <div style={{ display: "grid", gap: "8px" }}>
              <label className="field-label">ค้นหาลูกค้าเก่า</label>
              <div className="search"><Search size={16} /><input value={orderCustomerSearch} onChange={e => { setOrderCustomerSearch(e.target.value); setSelectedCustomerId(""); }} placeholder="พิมพ์ชื่อ / เบอร์ / ผู้ติดต่อ / พื้นที่" /></div>
              {(() => { const query = orderCustomerSearch.trim(); const matches = customers.filter(customer => customerMatchesQuery(customer, query)).slice(0, 10); if (!query) return <small className="muted">พิมพ์อย่างน้อย 3 ตัวอักษร ระบบจะแสดงข้อมูลลูกค้าทันที</small>; if (query.length < 3) return <small className="muted">พิมพ์เพิ่มอีก {3 - query.length} ตัวอักษรเพื่อค้นหาฐานลูกค้ากลาง</small>; if (!matches.length) return <small className="muted">กำลังค้นหา หรือยังไม่พบลูกค้าที่ตรงกัน</small>; return <div style={{ display: "grid", gap: "6px", maxHeight: "260px", overflowY: "auto" }}>{matches.map(customer => <button key={customer.id} type="button" onClick={() => { setSelectedCustomerId(customer.id); setOrderCustomerSearch(""); }} style={{ textAlign: "left", border: "1px solid #dbe4ee", background: "#fff", borderRadius: "8px", padding: "9px", cursor: "pointer" }}><b>{customer.name}</b><span style={{ display: "block", fontSize: "12px", color: "#4b5563", marginTop: "2px" }}>{[customer.contact, customer.phone, customer.zone].filter(Boolean).join(" · ") || "-"}</span>{customer.address && <small className="muted" style={{ display: "block", marginTop: "2px" }}>{customer.address}</small>}</button>)}</div>; })()}
              {selectedCustomerId && (() => { const customer = customers.find(item => item.id === selectedCustomerId); return customer ? <div className="customer-detail"><div><b>{customer.name}</b><p>{[customer.contact, customer.phone, customer.zone].filter(Boolean).join(" · ")}</p><p>{customer.address || "-"}</p></div></div> : null; })()}
            </div>
            <div className="form-grid two"><input value={customerForm.name} onChange={e => setCustomerForm(p => ({ ...p, name: e.target.value }))} placeholder="เพิ่มลูกค้าใหม่: ชื่อร้าน/ลูกค้า" /><input value={customerForm.phone} onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="เบอร์โทร" /><input value={customerForm.contact} onChange={e => setCustomerForm(p => ({ ...p, contact: e.target.value }))} placeholder="ผู้ติดต่อ" /><select value={customerForm.zone} onChange={e => setCustomerForm(p => ({ ...p, zone: e.target.value }))}>{ZONES.map(zone => <option key={zone}>{zone}</option>)}</select></div>
            <input value={customerForm.address} onChange={e => setCustomerForm(p => ({ ...p, address: e.target.value }))} placeholder="ที่อยู่/ย่าน" />
            <button className="secondary" onClick={saveCustomer}>+ บันทึกลูกค้าเข้าฐานกลาง</button>
            <div className="form-grid two"><select value={orderForm.deliveryMethod} onChange={e => setOrderForm(p => ({ ...p, deliveryMethod: e.target.value, workflowType: "store_route" }))}><option value="company_driver">เชียงใหม่/ใกล้เคียง · คนขับบริษัท</option><option value="grab_pickup">Grab</option><option value="customer_pickup">ลูกค้ารับหน้าร้าน</option></select><select value={orderForm.pickupWaitMinutes} onChange={e => setOrderForm(p => ({ ...p, pickupWaitMinutes: e.target.value }))}><option value="5">รอจัดเตรียม 5 นาที</option><option value="10">รอจัดเตรียม 10 นาที</option><option value="15">รอจัดเตรียม 15 นาที</option><option value="20">รอจัดเตรียม 20 นาที</option></select><input value={orderForm.qty} onChange={e => setOrderForm(p => ({ ...p, qty: digitsOnly(e.target.value) }))} inputMode="numeric" placeholder="จำนวนกล่อง/ถุง" /><select value={orderForm.packageUnit} onChange={e => setOrderForm(p => ({ ...p, packageUnit: e.target.value }))}><option value="box">กล่อง</option><option value="bag">ถุง</option></select></div>
            <div style={{ display: "grid", gap: "6px" }}><label className="field-label">เลขใบสั่งจอง (ถ้ามี)</label><BookingNumberInput value={orderForm.urgentBookingNumber} onChange={value => setOrderForm(p => ({ ...p, urgentBookingNumber: value }))} /><small className="muted">เว้นว่างได้สำหรับงานเร่งด่วน และฝ่ายขายสามารถเติมภายหลัง</small></div>
            <textarea value={orderForm.salesNote} onChange={e => setOrderForm(p => ({ ...p, salesNote: e.target.value }))} rows={3} placeholder="รายละเอียดสินค้า / หมายเหตุงานเร่งด่วน" />
            <button className="primary wide" onClick={createOrder}><PackagePlus size={18} /> เปิดออเดอร์เร่งด่วน</button>
          </section>
          </div>
        )}

        {["store-work", "store-pickup", "store-booking", "store-online", "store-dashboard"].includes(displayTab) && (
          <section className={`panel role-workspace ops-workspace${displayTab === "store-dashboard" ? " ops-dashboard-panel" : ""}`}>
            {displayTab === "store-dashboard" && <div className="store-report-filters"><label className="store-report-deleted-filter"><input type="checkbox" checked={kpiAutoRefresh} onChange={(event) => setKpiAutoRefresh(event.target.checked)} /> อัปเดต KPI อัตโนมัติทุก 5 นาที</label><button className="secondary" onClick={() => fetchStoreReports({ includeDeleted: true, kpi: true })}>↻ รีเฟรช KPI</button><span className="muted">{storeReportsUpdatedAt ? `อัปเดตล่าสุด ${new Date(storeReportsUpdatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : "ยังไม่อัปเดต"}</span></div>}
            {displayTab !== "store-dashboard" && <div className="panel-head"><h2>งานสโตร์</h2><span>เฉพาะบัญชีสโตร์</span></div>}
            {displayTab === "store-work" && <div className="ops-store-work" style={{ display: "grid", gap: "10px" }}>
              <button className="primary" style={{ width: "fit-content" }} onClick={() => { setSelectedCustomerId(""); setOrderCustomerSearch(""); setOrderForm(p => ({ ...p, deliveryMethod: "company_driver", workflowType: "store_route" })); setStoreUrgentOpen(true); }}>+ เปิดออเดอร์ด่วนเชียงใหม่/ใกล้เคียง</button>
              <OrderHistorySearch title="ค้นหาประวัติออเดอร์เชียงใหม่/ใกล้เคียง" query={chiangmaiHistoryQuery} onQueryChange={setChiangmaiHistoryQuery} onSearch={searchChiangmaiHistory} onClear={() => { setChiangmaiHistoryQuery(""); setChiangmaiHistoryResults([]); setChiangmaiHistorySearched(false); }} loading={chiangmaiHistoryLoading} searched={chiangmaiHistorySearched} results={chiangmaiHistoryResults} onOpen={openChiangmaiHistoryOrder} />
              {storeWorkOrders.map(order => { const storePending = ["partial", "waiting", "returned"].includes(order.storeStatus) || (order.missingItems || []).length > 0; return <article key={order.id} className="role-order-card" style={storePending ? { borderColor: order.storeStatus === "returned" ? "#ef4444" : order.storeStatus === "partial" ? "#fb923c" : "#facc15", borderLeft: `5px solid ${order.storeStatus === "returned" ? "#dc2626" : order.storeStatus === "partial" ? "#f97316" : "#eab308"}`, background: order.storeStatus === "returned" ? "#fef2f2" : order.storeStatus === "partial" ? "#fff7ed" : "#fefce8" } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">{order.zone} · {order.address}</div></div><WorkflowStatus role="store" status={order.storeStatus} /></div>
                <OrderCreatedAt order={order} />
                <div style={{ fontSize: "12px", color: "#4b5563" }}>เลขที่ใบสั่งจอง: {formatOrderBookingNumbers(order) || "ยังไม่ระบุ"}{order.storeWorkDetails?.detail && <> · {order.storeWorkDetails.detail}</>}</div>
                {storePending && <b style={{ color: order.storeStatus === "returned" ? "#b91c1c" : order.storeStatus === "partial" ? "#c2410c" : "#a16207", fontSize: "12px" }}>{order.storeStatus === "returned" ? `↩️ ห้องแพ็คส่งกลับตรวจสอบ: ${order.returnReason || "ของผิด"}` : "⚠️ รอของ / ของยังไม่ครบ — ติดตามและอัปเดทเมื่อของเข้า"}</b>}
                {order.storeWorkDetails?.sharedToLine && <span className="status-chip" style={{ color: "#166534", background: "#dcfce7", width: "fit-content" }}>💬 แชร์ LINE แล้ว</span>}
                {order.storeWorkDetails?.localPhotoCount > 0 && <span className="muted">📷 แนบรูป {order.storeWorkDetails.localPhotoCount} รูป (เก็บในเครื่อง)</span>}
                <details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์จากฝ่ายขาย</summary><PackSalesOrderDetails order={order} /></details>
                <button className={storePending ? "secondary" : "primary"} onClick={() => openWorkModal(order, "store")}>{storePending ? "อัปเดทออเดอร์" : "รับงาน / บันทึกรายละเอียด"}</button>
              </article>})}
              {!storeWorkOrders.length && <p className="muted">ยังไม่มีออเดอร์เชียงใหม่/จังหวัดใกล้เคียงที่รอสโตร์</p>}
            </div>}
            {displayTab === "store-pickup" && <div className="ops-store-work" style={{ display: "grid", gap: "10px" }}>
              <button className="primary" style={{ width: "fit-content" }} onClick={() => { setSelectedCustomerId(""); setOrderCustomerSearch(""); setOrderForm(p => ({ ...p, deliveryMethod: "grab_pickup", workflowType: "store_route" })); setStoreUrgentOpen(true); }}>+ เปิดออเดอร์ด่วน Grab/รับหน้าร้าน</button>
              {storePickupOrders.map(order => <article key={order.id} className="role-order-card"><div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">{order.deliveryMethod === "customer_pickup" ? "ลูกค้ารับหน้าร้าน" : "Grab รับสินค้า"} · {order.bookingNumber || "ไม่มีเลขใบสั่งจอง"}</div></div><WorkflowStatus role="store" status={order.storeStatus} /></div><OrderCreatedAt order={order} /><details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์จากฝ่ายขาย</summary><PackSalesOrderDetails order={order} /></details><button className="primary" onClick={() => openWorkModal(order, "store")}>รับงาน / บันทึกรายละเอียด</button></article>)}
              {!storePickupOrders.length && <p className="muted">ยังไม่มีงาน Grab หรือลูกค้ารับหน้าร้านที่รอสโตร์</p>}
            </div>}
            {["store-booking", "store-online"].includes(displayTab) && <div className="store-report-workspace">
              {(() => { const type = displayTab === "store-booking" ? "booking" : "online"; const issueSummary = storeReportIssues[type] || { count: 0, items: [] }; const issueRows = Array.isArray(issueSummary.items) ? issueSummary.items : []; if (!issueSummary.count) return null; const openAllIssues = () => { setStoreReportQuery(""); setStoreReportSearchActive(true); fetchStoreReports({ type, includeDeleted: false }); }; const openIssue = (item) => { setStoreReportQuery(item.bookingNumber || ""); setStoreReportSearchActive(true); fetchStoreReports({ type, query: item.bookingNumber || "", includeDeleted: false }); }; return <section style={{ background: "#fef2f2", border: "2px solid #dc2626", borderLeftWidth: "7px", borderRadius: "10px", padding: "12px", display: "grid", gap: "9px", boxShadow: "0 5px 14px rgba(153, 27, 27, .12)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}><div><b style={{ color: "#991b1b" }}>⚠️ มีงานของไม่ครบ / รอของค้าง {issueSummary.count} รายการ</b><div style={{ color: "#b91c1c", fontSize: "12px" }}>รวมงานข้ามวัน · แสดงงานเก่าก่อน เพื่อเร่งติดตาม</div></div><button className="secondary" style={{ borderColor: "#dc2626", color: "#991b1b" }} onClick={openAllIssues}>ดูทั้งหมด</button></div><div style={{ display: "grid", gap: "6px" }}>{issueRows.slice(0, 5).map((item) => <button key={item.id} type="button" onClick={() => openIssue(item)} style={{ textAlign: "left", border: "1px solid #fecaca", background: "#fff", color: "#7f1d1d", borderRadius: "7px", padding: "8px", cursor: "pointer" }}><b>{item.bookingNumber || "ไม่มีเลขเอกสาร"}</b><span style={{ display: "block", fontSize: "12px" }}>{[item.detail, item.note].filter(Boolean).join(" · ") || "ของไม่ครบ / รอของ"}</span><small>{item.createdAt ? formatThaiDateTime(item.createdAt) : ""}</small></button>)}</div>{issueSummary.count > issueRows.length && <small style={{ color: "#991b1b" }}>แสดง {issueRows.length} รายการแรกจาก {issueSummary.count} รายการ</small>}</section>; })()}
              {storeReports.filter(item => item.type === (displayTab === "store-booking" ? "booking" : "online") && ["returned", "partial"].includes(item.packStatus) && !item.deletedAt).map(item => <div key={`resubmit-${item.id}`} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px", display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}><div><b>{item.bookingNumber || "รายการ"} · ห้องแพ็คส่งกลับ</b><div style={{ color: "#991b1b" }}>{item.returnReason || "ของไม่ครบหรือข้อมูลไม่ถูกต้อง"}</div></div><button className="primary" onClick={() => resubmitStoreReport(item)}>แก้ไขแล้ว · ส่งตรวจใหม่</button></div>)}
              {(() => { const type = displayTab === "store-booking" ? "booking" : "online"; const baseRows = storeReports.filter(item => item.type === type && (storeReportSearchActive || String(item.serviceDate || toServiceDateKey(item.createdAt)) === storeReportDate)); const activeRows = baseRows.filter(item => !item.deletedAt); const isProblem = item => ["waiting", "partial"].includes(item.status) || (type === "online" && ["partial", "returned"].includes(item.packStatus)); const needsAction = item => !item.deletedAt && !item.confirmedAt && ["draft", "waiting", "partial"].includes(item.status); const matchesStatus = item => storeReportStatusFilter === "all" || (storeReportStatusFilter === "action" && needsAction(item)) || (storeReportStatusFilter === "confirmed" && Boolean(item.confirmedAt) && !item.deletedAt) || (storeReportStatusFilter === "problem" && !item.deletedAt && isProblem(item)) || (storeReportStatusFilter === "deleted" && Boolean(item.deletedAt)); const selectedRows = baseRows.filter(matchesStatus).slice().sort((a, b) => { const priority = item => item.deletedAt ? 3 : isProblem(item) ? 0 : needsAction(item) ? 1 : 2; return priority(a) - priority(b) || Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0); }); const overdue = storeReports.filter(item => item.type === type && needsAction(item) && String(item.serviceDate || toServiceDateKey(item.createdAt)) < todayServiceDate); const deletedCount = baseRows.length - activeRows.length; const refreshReports = () => fetchStoreReports({ date: storeReportSearchActive ? "" : storeReportDate, query: storeReportSearchActive ? storeReportQuery : "", type, includeDeleted: storeReportIncludeDeleted }); const runSearch = () => { const active = Boolean(storeReportQuery.trim()); setStoreReportSearchActive(active); if (active) fetchStoreReports({ query: storeReportQuery, type, includeDeleted: storeReportIncludeDeleted }); }; return <>
                {overdue.length > 0 && <div style={{ background: overdue.some(item => Math.floor((Date.parse(`${todayServiceDate}T00:00:00`) - Date.parse(`${String(item.serviceDate || toServiceDateKey(item.createdAt))}T00:00:00`)) / 86400000) > 1) ? "#fee2e2" : "#fef3c7", border: "1px solid #fca5a5", padding: "10px", borderRadius: "8px" }}><b>⚠️ มี {overdue.length} รายการค้างยืนยันจากวันก่อน</b><div className="muted">สีเหลือง = ค้าง 1 วัน · สีแดง = ค้างเกิน 1 วัน</div></div>}
                <header className="store-report-header"><div><span className="store-report-eyebrow">STORE OPERATIONS</span><h2>{type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}</h2><p>{type === "booking" ? "ติดตามเอกสารและงานที่รอยืนยัน" : "ติดตามงานออนไลน์ก่อนส่งต่อห้องแพ็ค"}</p></div><div className="store-report-header-tools"><div className="store-report-date"><input aria-label="วันที่รายงาน" type="date" value={storeReportDate} onChange={e => { setStoreReportDate(e.target.value); setStoreReportSearchActive(false); }} /><button className="secondary" onClick={() => { setStoreReportDate(todayServiceDate); setStoreReportSearchActive(false); }}>วันนี้</button></div><div className="store-report-sync"><Clock3 size={15} /><span>{storeReportsUpdatedAt ? `อัปเดตล่าสุด ${storeReportsUpdatedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : "ยังไม่อัปเดต"}</span><button className="secondary" onClick={refreshReports} disabled={storeReportsLoading} aria-label="รีเฟรชรายงาน">↻ รีเฟรช</button></div></div></header>
                <div className="store-report-kpis"><article><span>ทั้งหมด</span><strong>{activeRows.length}</strong><small>{deletedCount ? `ไม่รวมลบแล้ว ${deletedCount}` : "รายการที่ใช้งาน"}</small></article><article className="is-action"><span>ต้องดำเนินการ</span><strong>{activeRows.filter(needsAction).length}</strong><small>ร่างหรือยังไม่ยืนยัน</small></article><article className="is-confirmed"><span>ยืนยันแล้ว</span><strong>{activeRows.filter(item => item.confirmedAt).length}</strong><small>พร้อมดำเนินงานต่อ</small></article><article className="is-problem"><span>มีปัญหา</span><strong>{activeRows.filter(isProblem).length}</strong><small>รอของ / ของไม่ครบ</small></article></div>
                <div className="store-report-filters"><div className="store-report-search"><Search size={17} /><input value={storeReportQuery} onChange={e => setStoreReportQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") runSearch(); }} placeholder="ค้นหาเลขใบสั่งจอง / รายละเอียด / หมายเหตุ" /></div><button className="secondary" onClick={runSearch}>ค้นหาประวัติ</button><button className="secondary" onClick={() => { setStoreReportQuery(""); setStoreReportSearchActive(false); }}>ล้าง</button><select aria-label="กรองตามสถานะ" value={storeReportStatusFilter} onChange={e => setStoreReportStatusFilter(e.target.value)}><option value="all">ทุกสถานะ</option><option value="action">ต้องดำเนินการ</option><option value="confirmed">ยืนยันแล้ว</option><option value="problem">มีปัญหา</option><option value="deleted">ลบแล้ว</option></select><label className="store-report-deleted-filter"><input type="checkbox" checked={storeReportIncludeDeleted} onChange={e => setStoreReportIncludeDeleted(e.target.checked)} /> รวมรายการลบแล้ว{deletedCount > 0 ? ` (${deletedCount})` : ""}</label></div>
                {storeReportSearchActive && <div style={{ background: "#eff6ff", padding: "8px", borderRadius: "6px", fontSize: "12px" }}>ผลค้นหาย้อนหลัง: “{storeReportQuery}”</div>}
                <div className="store-report-drafts">{(storeDraftRows[type] || []).map((row) => <div key={row.draftId} className="store-report-draft-row"><BookingNumberInput value={row.bookingNumber} onChange={bookingNumber => setStoreDraftRows(rows => ({ ...rows, [type]: rows[type].map((item) => item.draftId === row.draftId ? { ...item, bookingNumber } : item) }))} /><input value={row.detail} onChange={e => setStoreDraftRows(rows => ({ ...rows, [type]: rows[type].map((item) => item.draftId === row.draftId ? { ...item, detail: e.target.value } : item) }))} placeholder="รายละเอียด" /><input value={row.note} onChange={e => setStoreDraftRows(rows => ({ ...rows, [type]: rows[type].map((item) => item.draftId === row.draftId ? { ...item, note: e.target.value } : item) }))} placeholder="หมายเหตุ/รอของ" /><select value={row.status} onChange={e => setStoreDraftRows(rows => ({ ...rows, [type]: rows[type].map((item) => item.draftId === row.draftId ? { ...item, status: e.target.value } : item) }))}><option value="draft">ครบ</option><option value="waiting">รอของ</option><option value="partial">ของไม่ครบ</option></select><button className="secondary danger" onClick={() => setStoreDraftRows(rows => ({ ...rows, [type]: rows[type].filter((item) => item.draftId !== row.draftId) }))}>ลบ</button></div>)}</div>
                <div className="store-report-actions"><button className="secondary" disabled={storeReportDate !== todayServiceDate} onClick={() => addStoreDraftRow(type)}>+ เพิ่มรายการ</button><div><button className="secondary" disabled={storeReportDate !== todayServiceDate || !(storeDraftRows[type] || []).length} onClick={() => saveStoreDrafts(type)}>บันทึกร่าง</button><button className="primary" disabled={storeReportDate !== todayServiceDate} onClick={() => startStoreReportConfirmation(type)}>ยืนยันรายการ</button></div></div>
                {storeReportsLoading ? <p className="muted">กำลังโหลดรายงาน…</p> : <div className="store-report-table-wrap"><table className="store-report-table"><thead><tr><th>เลขเอกสาร</th><th>รายละเอียด</th><th>เวลา / ผู้บันทึก</th><th>สถานะงาน</th><th>จัดการ</th></tr></thead><tbody>{selectedRows.map(item => { const serviceDate = String(item.serviceDate || toServiceDateKey(item.createdAt)); const age = Math.max(0, Math.floor((Date.parse(`${todayServiceDate}T00:00:00`) - Date.parse(`${serviceDate}T00:00:00`)) / 86400000)); const tone = item.deletedAt ? "deleted" : item.status === "draft" ? "draft" : item.status === "waiting" ? "waiting" : item.status === "partial" ? "partial" : "confirmed"; const statusLabel = item.deletedAt ? "ลบแล้ว" : item.status === "draft" ? "ครบ · ยังไม่ยืนยัน" : item.status === "waiting" ? "รอของ" : item.status === "partial" ? "ของไม่ครบ" : "ยืนยันแล้ว"; return <tr key={item.id} className={`store-report-row is-${tone}`}><td data-label="เลขเอกสาร"><b>{item.bookingNumber || "ไม่มีเลขใบสั่งจอง"}</b>{item.linkedOrder && <small className="muted">ฝ่ายขาย: {item.linkedOrder.id} · {item.linkedOrder.customerName || "ไม่ระบุลูกค้า"}{item.linkedOrder.zone ? ` · ${item.linkedOrder.zone}` : ""}</small>}{needsAction(item) && <small className={`store-report-priority ${age > 1 ? "is-urgent" : ""}`}>{age > 0 ? `ค้าง ${age} วัน` : "ต้องดำเนินการวันนี้"}</small>}</td><td data-label="รายละเอียด"><span>{item.detail || "-"}</span>{item.note && <small>{item.note}</small>}</td><td data-label="เวลา / ผู้บันทึก"><span>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "-"}</span><small>{item.createdBy || "-"} · {serviceDate}</small></td><td data-label="สถานะงาน"><span className={`store-report-status is-${tone}`}>{statusLabel}</span>{type === "online" && item.packStatus && <small>ห้องแพ็ค: {item.packStatus}</small>}</td><td data-label="จัดการ"><div className="store-report-row-actions"><button className="secondary" onClick={() => openStoreReportDetail(item)} aria-label={`ดู ${item.bookingNumber || "รายการ"}`}>👁 ดู</button>{!item.deletedAt && <><button className="secondary" onClick={() => setEditingStoreReport({ ...item, reason: "" })} aria-label={`แก้ไข ${item.bookingNumber || "รายการ"}`}>✎ แก้ไข</button><button className="secondary danger" onClick={() => deleteStoreReport(item)} aria-label={`ลบ ${item.bookingNumber || "รายการ"}`}>ลบ</button></>}</div></td></tr>})}</tbody></table></div>}
                {!storeReportsLoading && !selectedRows.length && <p className="muted">ยังไม่มีรายงานในวันที่เลือก</p>}
              </>; })()}
            </div>}
            {displayTab === "store-dashboard" && (() => { const pending = storeTodayOrders.filter(order => order.storeStatus === "pending").length; const working = storeTodayOrders.filter(order => order.storeStatus === "working").length; const waiting = storeTodayOrders.filter(order => ["waiting", "partial", "returned"].includes(order.storeStatus)).length; const monthOrders = storeKpiOrders.filter(order => getOrderServiceDate(order).startsWith(currentMonthKey)); const monthCompleted = monthOrders.filter(order => ["checked", "partial"].includes(order.storeStatus)); const monthReturned = storeKpiOrders.flatMap(getReturnEvents).filter(event => String(event.at || "").startsWith(currentMonthKey)); const monthOverdue = monthOrders.filter(order => ["pending", "working", "waiting", "partial", "returned"].includes(order.storeStatus)).filter(isOverdueWorkflowOrder); const statusLabels = { pending: "รอตรวจ", working: "กำลังตรวจ", checked: "ตรวจเสร็จ", partial: "ของไม่ครบ", waiting: "รอของ", returned: "ส่งกลับตรวจ" }; const statusTones = { pending: "is-amber", working: "is-blue", checked: "is-green", partial: "is-red", waiting: "is-red", returned: "is-red" }; const recentOrders = storeTodayOrders.slice().sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0)).slice(0, 6).map(order => ({ ...order, statusLabel: statusLabels[order.storeStatus] || "รอตรวจ", statusTone: statusTones[order.storeStatus] })); let activityRows = buildKpiActivityRows(storeKpiOrders, "store"); if (!activityRows.length) activityRows = storeTodayOrders.map(order => ({ id: order.id, at: order.updatedAt || order.createdAt, title: "ฝ่ายขายสร้างหรืออัปเดตออเดอร์", note: order.customerName || order.id })); activityRows.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)); return <OperationsKpiDashboard cards={[{ icon: "📦", value: storeTodayOrders.length, label: "ออเดอร์วันนี้", detail: "งานที่ฝ่ายขายส่งให้สโตร์", tone: "is-primary" }, { icon: "🟡", value: pending, label: "รอตรวจ", detail: "ยังไม่ได้เริ่มตรวจ", tone: "is-amber" }, { icon: "🔵", value: working, label: "กำลังตรวจ", detail: "สโตร์กำลังดำเนินการ", tone: "is-blue" }, { icon: "🟢", value: storeTodayCompleted, label: "ตรวจเสร็จ", detail: "พร้อมส่งต่อห้องแพ็ค", tone: "is-green" }, { icon: "🔴", value: waiting, label: "รอของ", detail: "รอของหรือของไม่ครบ", tone: "is-red" }]} completed={storeTodayCompleted} total={storeTodayOrders.length} followUps={[{ label: "งานส่งกลับให้สโตร์ตรวจ", emptyLabel: "ไม่มีงานส่งกลับ", value: storeKpiReturned.length }, { label: "งานสโตร์ค้างเกิน 1 วัน", emptyLabel: "ไม่มีงานค้างเกินวัน", value: storeKpiOverdue.length }, { label: "งานรอของ / ของไม่ครบ", emptyLabel: "ไม่มีงานรอสินค้า", value: waiting }]} monthly={[{ label: "งานทั้งหมด", value: monthOrders.length }, { label: "ตรวจเสร็จ", value: monthCompleted.length }, { label: "ส่งกลับตรวจ", value: monthReturned.length }, { label: "ค้างเกินวัน", value: monthOverdue.length }, { label: "อัตราตรวจครบ", value: monthOrders.length ? Math.round((monthCompleted.length / monthOrders.length) * 100) : 0, suffix: "%" }]} recentOrders={recentOrders} activities={activityRows} reportActions={{ copyDaily: () => copyStoreSummary("daily"), shareDaily: () => shareStoreSummary("daily"), copyMonthly: () => copyStoreSummary("monthly"), shareMonthly: () => shareStoreSummary("monthly") }} information="ออเดอร์ออนไลน์ส่งต่อให้ห้องแพ็คติดตาม ส่วนรายงานต่างจังหวัดแบบบันทึกใช้เก็บประวัติสโตร์ และทั้งสองส่วนไม่ขึ้น Google Sheets" />; })()}
          </section>
        )}

        {displayTab === "store-chiangmai-track" && (
          <section className="panel">
            <div className="panel-head"><h2>ติดตามเตรียมออเดอร์เชียงใหม่</h2><span>ดูข้อมูลจากฝ่ายขาย · อ่านอย่างเดียว</span></div>
            <div style={{ display: "grid", gap: "10px" }}>
              {chiangmaiPreparationOrders.map(order => <article key={order.id} style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px", display: "grid", gap: "7px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">{order.zone} · {order.address}</div></div><div className="status-pair"><WorkflowStatus role="store" status={order.storeStatus} /><WorkflowStatus role="pack" status={order.packStatus} /></div></div>
                <div style={{ fontSize: "12px", color: "#4b5563" }}>เลขที่ใบสั่งจอง: {order.bookingNumber || "ยังไม่ระบุ"} · {order.boxes || 0} กล่อง {order.window ? `· ${order.window}` : ""}{order.shippingCarrier ? ` · ขนส่ง: ${order.shippingCarrier}` : ""}</div>
                {order.salesNote && <div style={{ background: "#eff6ff", padding: "8px", borderRadius: "6px", fontSize: "12px" }}><b>หมายเหตุฝ่ายขาย:</b> {order.salesNote}</div>}
                {Array.isArray(order.missingItems) && order.missingItems.length > 0 && <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "6px", fontSize: "12px" }}><b>รอสินค้า/ของไม่ครบ:</b> {order.missingItems.join(", ")}</div>}
              </article>)}
              {!chiangmaiPreparationOrders.length && <p className="muted">ยังไม่มีออเดอร์เชียงใหม่/ใกล้เคียงที่อยู่ระหว่างเตรียม</p>}
            </div>
          </section>
        )}

        {displayTab === "pack-dashboard" && (() => { const pending = packTodayOrders.filter(order => order.packStatus === "pending").length; const working = packTodayOrders.filter(order => order.packStatus === "working").length; const waiting = packTodayOrders.filter(order => ["waiting", "partial", "returned"].includes(order.packStatus)).length; const monthOrders = packKpiOrders.filter(order => getOrderServiceDate(order).startsWith(currentMonthKey)); const monthCompleted = monthOrders.filter(order => ["checked", "partial"].includes(order.packStatus)); const monthReturned = packKpiOrders.flatMap(getReturnEvents).filter(event => String(event.at || "").startsWith(currentMonthKey)); const monthOverdue = monthOrders.filter(order => ["pending", "working", "waiting", "partial", "returned"].includes(order.packStatus)).filter(isOverdueWorkflowOrder); const statusLabels = { pending: "รอแพ็ค", working: "กำลังแพ็ค", checked: "แพ็คเสร็จ", partial: "ของไม่ครบ", waiting: "รอของ", returned: "ส่งกลับสโตร์" }; const statusTones = { pending: "is-amber", working: "is-blue", checked: "is-green", partial: "is-red", waiting: "is-red", returned: "is-red" }; const recentOrders = packTodayOrders.slice().sort((a, b) => Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0)).slice(0, 6).map(order => ({ ...order, statusLabel: statusLabels[order.packStatus] || "รอแพ็ค", statusTone: statusTones[order.packStatus] })); let activityRows = buildKpiActivityRows(packKpiOrders, "pack"); if (!activityRows.length) activityRows = packTodayOrders.map(order => ({ id: order.id, at: order.updatedAt || order.createdAt, title: "อัปเดตออเดอร์ห้องแพ็ค", note: order.customerName || order.id })); activityRows.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)); return <section className="panel role-workspace ops-workspace ops-dashboard-panel"><OperationsKpiDashboard cards={[{ icon: "📦", value: packTodayOrders.length, label: "ออเดอร์วันนี้", detail: "งานที่เข้าสู่ห้องแพ็ค", tone: "is-primary" }, { icon: "🟡", value: pending, label: "รอแพ็ค", detail: "ยังไม่ได้เริ่มแพ็ค", tone: "is-amber" }, { icon: "🔵", value: working, label: "กำลังแพ็ค", detail: "ห้องแพ็คกำลังดำเนินการ", tone: "is-blue" }, { icon: "🟢", value: packTodayCompleted, label: "แพ็คเสร็จ", detail: "ตรวจและยืนยันแล้ว", tone: "is-green" }, { icon: "🔴", value: waiting, label: "รอของ", detail: "รอของหรือของไม่ครบ", tone: "is-red" }]} completed={packTodayCompleted} total={packTodayOrders.length} followUps={[{ label: "งานส่งกลับสโตร์", emptyLabel: "ไม่มีงานส่งกลับ", value: packKpiReturned.length }, { label: "งานค้างเกิน 1 วัน", emptyLabel: "ไม่มีงานค้างเกินวัน", value: packKpiOverdue.length }, { label: "งานรอดำเนินการ / รอของ", emptyLabel: "ไม่มีงานรอสินค้า", value: waiting }]} monthly={[{ label: "งานทั้งหมด", value: monthOrders.length }, { label: "แพ็คเสร็จ", value: monthCompleted.length }, { label: "ส่งกลับสโตร์", value: monthReturned.length }, { label: "ค้างเกินวัน", value: monthOverdue.length }, { label: "อัตราแพ็คครบ", value: monthOrders.length ? Math.round((monthCompleted.length / monthOrders.length) * 100) : 0, suffix: "%" }]} recentOrders={recentOrders} activities={activityRows} reportActions={{ copyDaily: () => copyPackSummary("daily"), shareDaily: () => sharePackSummary("daily"), copyMonthly: () => copyPackSummary("monthly"), shareMonthly: () => sharePackSummary("monthly") }} information="KPI ห้องแพ็คอ้างอิง Log การตรวจจริงแบบเรียลไทม์ เคสส่งกลับที่แก้เสร็จแล้วยังคงอยู่ในสถิติย้อนหลัง แต่ไม่แสดงเป็นงานค้าง" progressTitle="ความคืบหน้าการแพ็คสินค้า" progressLabel="แพ็คเสร็จ" />;</section>; })()}

        {displayTab === "pack-dashboard" && <div className="store-report-filters"><label className="store-report-deleted-filter"><input type="checkbox" checked={kpiAutoRefresh} onChange={(event) => setKpiAutoRefresh(event.target.checked)} /> อัปเดต KPI อัตโนมัติทุก 5 นาที</label><button className="secondary" onClick={() => fetchStoreReports({ includeDeleted: true, kpi: true })}>↻ รีเฟรช KPI</button><span className="muted">{storeReportsUpdatedAt ? `อัปเดตล่าสุด ${new Date(storeReportsUpdatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.` : "ยังไม่อัปเดต"}</span></div>}

        {["pack-booking", "pack-online"].includes(displayTab) && (() => {
          const type = displayTab === "pack-booking" ? "booking" : "online";
          const title = type === "booking" ? "ใบสั่งจอง · ห้องแพ็ค" : "ใบขายออนไลน์ · ห้องแพ็ค";
          const pendingRows = storeReports.filter((item) => item.type === type && item.confirmedAt && !item.deletedAt && ["pending", "partial", "returned"].includes(item.packStatus));
          const rows = storeReportSearchActive ? storeReports.filter((item) => item.type === type && !item.deletedAt) : pendingRows;
          const search = () => { const active = Boolean(storeReportQuery.trim()); setStoreReportSearchActive(active); fetchStoreReports({ type, query: storeReportQuery, includeDeleted: true }); };
          const clear = () => { setStoreReportQuery(""); setStoreReportSearchActive(false); setPackReportSelectedIds([]); fetchStoreReports({ type, date: storeReportDate, includeDeleted: false }); };
          return <PackReportWorkspace type={type} title={title} rows={rows} loading={storeReportsLoading} query={storeReportQuery} onQueryChange={setStoreReportQuery} onSearch={search} onClear={clear} selectedIds={packReportSelectedIds} onSelectedIdsChange={setPackReportSelectedIds} onConfirmSelected={(ids) => confirmSelectedPackReports(type, ids)} onUpdateStatus={updateReportPackStatus} updatedAt={storeReportsUpdatedAt} date={storeReportDate} onDateChange={(nextDate) => { setStoreReportDate(nextDate); setStoreReportSearchActive(false); setPackReportSelectedIds([]); }} />;
        })()}

        {false && ["pack-booking", "pack-online"].includes(displayTab) && (() => {
          const type = displayTab === "pack-booking" ? "booking" : "online";
          const title = type === "booking" ? "ใบสั่งจอง · ห้องแพ็ค" : "ใบขายออนไลน์ · ห้องแพ็ค";
          const pendingRows = storeReports.filter(item => item.type === type && item.confirmedAt && !["checked", "blocked"].includes(item.packStatus) && !item.deletedAt);
          const rows = storeReportSearchActive ? storeReports.filter(item => item.type === type && !item.deletedAt) : pendingRows;
          return <section className="panel role-workspace ops-workspace"><div className="panel-head"><h2>{title}</h2><span>{rows.length} งานรอตรวจ</span></div><div className="store-report-filters" style={{ marginBottom: "10px" }}><div className="store-report-search"><Search size={17} /><input value={storeReportQuery} onChange={event => setStoreReportQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { const active = Boolean(event.currentTarget.value.trim()); setStoreReportSearchActive(active); fetchStoreReports({ type, query: event.currentTarget.value, includeDeleted: true }); } }} placeholder="ค้นหาเลขใบสั่งจอง / รายละเอียด / หมายเหตุ" /></div><button className="secondary" onClick={() => { const active = Boolean(storeReportQuery.trim()); setStoreReportSearchActive(active); fetchStoreReports({ type, query: storeReportQuery, includeDeleted: true }); }}>ค้นหาประวัติ</button><button className="secondary" onClick={() => { setStoreReportQuery(""); setStoreReportSearchActive(false); fetchStoreReports({ type, date: storeReportDate, includeDeleted: false }); }}>ล้าง</button></div><p className="muted">ตรวจยืนยันด้วย Flow เดียวกัน: ครบจึงปิดงาน หากผิดหรือไม่ครบให้ส่งกลับสโตร์แก้ไขและส่งตรวจใหม่</p><div className="ops-pack-work" style={{ display: "grid", gap: "10px" }}>{rows.map(item => <article key={item.id} className="role-order-card" style={["returned", "partial"].includes(item.packStatus) ? { borderLeft: "5px solid #dc2626", background: "#fef2f2" } : undefined}><div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}><b>{item.bookingNumber || "ไม่มีเลขใบสั่งจอง"}</b><span className="status-chip">{item.packStatus === "returned" ? "ส่งกลับสโตร์" : item.packStatus === "partial" ? "ของไม่ครบ" : "รอห้องแพ็คตรวจ"}</span></div><div>{item.detail || "-"}</div>{item.note && <small className="muted">หมายเหตุสโตร์: {item.note}</small>}{item.returnReason && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px", borderRadius: "6px" }}><b>เหตุผลส่งกลับ:</b> {item.returnReason}</div>}<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><button className="primary" onClick={() => updateReportPackStatus(item, "checked")}>ยืนยันครบ</button><button className="secondary" onClick={() => updateReportPackStatus(item, "partial")}>ของไม่ครบ / รอของ</button><button className="secondary danger" onClick={() => updateReportPackStatus(item, "returned")}>ส่งกลับสโตร์ตรวจซ้ำ</button></div></article>)}{!rows.length && <p className="muted">ยังไม่มี{type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}ที่รอห้องแพ็คตรวจ</p>}</div></section>;
        })()}

        {["pack-work", "pack-pickup", "pack-outstation"].includes(displayTab) && (
          <section className="panel role-workspace ops-workspace">
            <div className="panel-head"><h2>{displayTab === "pack-outstation" ? "ออเดอร์ต่างจังหวัด · ห้องแพ็ค" : displayTab === "pack-pickup" ? "Grab/รับหน้าร้าน · ห้องแพ็ค" : "ออเดอร์เชียงใหม่/ใกล้เคียง · ห้องแพ็ค"}</h2><span>{(displayTab === "pack-outstation" ? salesOutstationPackOrders : displayTab === "pack-pickup" ? packPickupOrders : packWorkOrders).length} งาน</span></div>
            <OrderHistorySearch title="ค้นหาประวัติออเดอร์ห้องแพ็ค" query={chiangmaiHistoryQuery} onQueryChange={setChiangmaiHistoryQuery} onSearch={searchChiangmaiHistory} onClear={() => { setChiangmaiHistoryQuery(""); setChiangmaiHistoryResults([]); setChiangmaiHistorySearched(false); }} loading={chiangmaiHistoryLoading} searched={chiangmaiHistorySearched} results={chiangmaiHistoryResults} onOpen={openChiangmaiHistoryOrder} />
            <div className="ops-pack-work" style={{ display: "grid", gap: "10px" }}>
              {(displayTab === "pack-outstation" ? salesOutstationPackOrders : displayTab === "pack-pickup" ? packPickupOrders : packWorkOrders).map(order => <article key={order.id} className="role-order-card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}><div><b>{order.id} · {order.customerName}</b><div className="muted">{order.zone} · {order.address}</div></div><WorkflowStatus role="pack" status={order.packStatus} /></div>
                <OrderCreatedAt order={order} />
                {displayTab === "pack-outstation" && <span className="status-chip" style={{ width: "fit-content", color: "#1d4ed8", background: "#dbeafe" }}>เส้นทาง: ส่งตรงห้องแพ็ค · ข้ามสโตร์</span>}
                {displayTab === "pack-pickup" && <span className="status-chip" style={{ width: "fit-content", color: "#1d4ed8", background: "#dbeafe" }}>{order.deliveryMethod === "customer_pickup" ? "ลูกค้ารับหน้าร้าน" : "Grab รับสินค้า"} · สโตร์: {["checked", "partial"].includes(order.storeStatus) ? "ส่งตรวจแล้ว" : "รอสโตร์ตรวจ"}</span>}
                <div style={{ fontSize: "12px", color: "#4b5563" }}>เลขที่ใบสั่งจอง: {formatOrderBookingNumbers(order) || "ยังไม่ระบุ"}{order.shippingCarrier && <> · ขนส่ง: {order.shippingCarrier}</>}{order.storeWorkDetails?.detail && <> · สโตร์: {order.storeWorkDetails.detail}</>}{order.storeWorkDetails?.note && <> · หมายเหตุ: {order.storeWorkDetails.note}</>}</div>
                {order.packWorkDetails?.sharedToLine && <span className="status-chip" style={{ color: "#166534", background: "#dcfce7", width: "fit-content" }}>💬 แชร์ LINE แล้ว</span>}
                {order.packWorkDetails?.localPhotoCount > 0 && <span className="muted">📷 แนบรูป {order.packWorkDetails.localPhotoCount} รูป (เก็บในเครื่อง)</span>}
                <details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์จากฝ่ายขาย</summary><PackSalesOrderDetails order={order} /></details>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><button className="primary" style={{ flex: "1 1 220px" }} onClick={() => openWorkModal(order, "pack")}>รับงาน / ยืนยันการแพ็ค</button><button className="secondary danger" onClick={() => archivePackOrder(order)}>นำออกจากคิว</button></div>
              </article>)}
              {!(displayTab === "pack-outstation" ? salesOutstationPackOrders : displayTab === "pack-pickup" ? packPickupOrders : packWorkOrders).length && <p className="muted">ยังไม่มีออเดอร์ในขั้นตอนนี้</p>}
            </div>
          </section>
        )}

        {["chiangmai", "driver-prep"].includes(displayTab) && (
          <section className={displayTab === "chiangmai" ? "panel role-workspace ops-workspace" : "panel"}>
            <div className="panel-head">
              <h2>{displayTab === "driver-prep" ? "เช็คสถานะออเดอร์เชียงใหม่" : "ออเดอร์ส่งเชียงใหม่และจังหวัดใกล้เคียง"}</h2>
              <span>{todayPreparationOrders.length} งานที่ต้องดำเนินการ{displayTab === "chiangmai" && readyPreparationOrdersCount > 0 ? ` · พร้อมจัดส่ง ${readyPreparationOrdersCount}` : ""}</span>
            </div>
            {displayTab === "chiangmai" && <OrderHistorySearch title="ค้นหาประวัติออเดอร์ฝ่ายขาย" query={chiangmaiHistoryQuery} onQueryChange={setChiangmaiHistoryQuery} onSearch={searchChiangmaiHistory} onClear={() => { setChiangmaiHistoryQuery(""); setChiangmaiHistoryResults([]); setChiangmaiHistorySearched(false); }} loading={chiangmaiHistoryLoading} searched={chiangmaiHistorySearched} results={chiangmaiHistoryResults} onOpen={openChiangmaiHistoryOrder} />}
            <div className={displayTab === "chiangmai" ? "ops-pack-work" : ""} style={{ display: "grid", gap: "10px" }}>
              {sortedPreparationOrders.map(order => (
                <article key={order.id} className={displayTab === "chiangmai" ? "role-order-card" : undefined} style={displayTab === "chiangmai" ? (isPreparationReadyForDriver(order) ? { borderColor: "#ef4444", borderLeftColor: "#dc2626", background: "linear-gradient(145deg, #ffffff 0%, #fff1f1 100%)" } : undefined) : { border: "1px solid #e5e7eb", borderRadius: "10px", padding: "12px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div><b>{order.id} · {order.customerName}</b><div className="muted">{order.zone} · {order.address}</div></div>
                    <div className="status-pair"><WorkflowStatus role="store" status={order.storeStatus} /><WorkflowStatus role="pack" status={order.packStatus} /></div>
                  </div>
                  {displayTab === "chiangmai" && isPreparationReadyForDriver(order) && <span className="status-chip" style={{ width: "fit-content", color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", fontWeight: 800 }}>พร้อมส่งคนขับ</span>}
                  {displayTab === "chiangmai" && isReadyDriverBacklog(order) && !isTodayOrder(order) && <span className="status-chip" style={{ width: "fit-content", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", fontWeight: 800 }}>ค้างจากวันก่อน · รอส่งเข้าคิวคนขับ</span>}
                  <div style={{ fontSize: "12px", color: "#4b5563" }}>
                    เส้นทาง: {order.workflowType === "direct_pack" ? "ส่งตรงห้องแพ็ค" : "ผ่านสโตร์"} · {order.boxes || 0} กล่อง
                    {order.storePackerName && <> · ผู้จัด: {order.storePackerName}</>}
                    {order.storeCheckerName && <> · ผู้ตรวจสโตร์: {order.storeCheckerName}</>}
                    {order.packPackerName && <> · ผู้แพ็ค: {order.packPackerName}</>}
                    {order.packCheckerName && <> · ผู้ตรวจแพ็ค: {order.packCheckerName}</>}
                  </div>
                  {displayTab === "chiangmai" && <><details className="prep-order-details"><summary>ดูรายละเอียดออเดอร์จากฝ่ายขาย</summary><PackSalesOrderDetails order={order} /></details>{(order.storeWorkDetails?.note || order.packWorkDetails?.note) && <div className="prep-work-notes">{order.storeWorkDetails?.note && <div className="prep-note-store"><b>หมายเหตุสโตร์</b><span>{order.storeWorkDetails.note}</span></div>}{order.packWorkDetails?.note && <div className="prep-note-pack"><b>หมายเหตุห้องแพ็ค</b><span>{order.packWorkDetails.note}</span></div>}</div>}</>}
                  {Array.isArray(order.missingItems) && order.missingItems.length > 0 && <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "6px", fontSize: "12px" }}>รอสินค้า: {order.missingItems.map(item => typeof item === "string" ? item : `${item.name || item.sku || "สินค้า"}: ${item.reason || "รอสินค้า"}`).join(", ")}</div>}
                  {displayTab === "chiangmai" && isPreparationReadyForDriver(order) && (
                    <button className="primary" onClick={() => updatePreparationWorkflow(order, "queue")}>ส่งเข้าคิวคนขับ</button>
                  )}
                  {displayTab === "chiangmai" && canDeleteBeforeDriverQueue(order) && (
                    <button className="secondary danger" onClick={() => deleteOrder(order.id)}>ลบออเดอร์ที่กรอกผิด</button>
                  )}
                </article>
              ))}
              {todayPreparationOrders.length === 0 && <p className="muted">ยังไม่มีออเดอร์ของวันนี้ในขั้นตอนนี้</p>}
            </div>
          </section>
        )}

        {showStoreReportConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(460px, 100%)" }}>
              <div className="panel-head"><h2>ยืนยันบันทึกรายงาน</h2><span>สโตร์</span></div>
              <p>รายการที่ยังไม่ยืนยันทั้งหมดจะถูกปิดสถานะและบันทึกวันเวลายืนยัน</p>
              <p className="muted">รวม {storeReportConfirmIds.length} รายการของวันที่เลือก</p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}><button className="secondary" onClick={() => setShowStoreReportConfirm(false)}>กลับไปแก้ไข</button><button className="primary" onClick={confirmStoreReports}>ยืนยันบันทึก</button></div>
            </section>
          </div>
        )}

        {workModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="panel-head"><h2>{workModal.role === "store" ? "รับงานสโตร์" : "รับงานห้องแพ็ค"}</h2><span>{workModal.order.id}</span></div>
              <div style={{ display: "grid", gap: "10px" }}>
                <div className="muted">{workModal.order.customerName} · {workModal.order.zone}</div>
                <details className="prep-order-details"><summary>ดูรายละเอียดลูกค้าและออเดอร์</summary><PackSalesOrderDetails order={workModal.order} /></details>
                {workModal.role === "store" ? <><label className="field-label">เลขที่ใบสั่งจอง *</label><BookingNumberInput value={workForm.bookingNumber} onChange={bookingNumber => setWorkForm(p => ({ ...p, bookingNumber }))} required /><small className="muted">เลขท้าย 4 ตัวซ้ำได้เมื่อหัวรหัสต่างกัน เช่น CSP-1234 / CSR-1234</small>{getOrderBookingNumbers(workModal.order).length > 1 && <small className="muted">มีเลขร่วมในออเดอร์นี้: {formatOrderBookingNumbers(workModal.order)}</small>}</> : <div><b>เลขที่ใบสั่งจอง:</b> {formatOrderBookingNumbers(workModal.order) || "ยังไม่ระบุจากฝ่ายขาย"}</div>}
                {workModal.role === "pack" && workModal.order.storeWorkDetails?.detail && <div style={{ background: "#eff6ff", padding: "8px", borderRadius: "6px", fontSize: "12px" }}><b>รายละเอียดจากสโตร์:</b> {workModal.order.storeWorkDetails.detail}</div>}
                <label className="field-label">ชื่อผู้ตรวจสินค้า *</label><select value={workForm.checkerName} onChange={e => setWorkForm(p => ({ ...p, checkerName: e.target.value }))}><option value="">-- เลือกชื่อผู้ตรวจ --</option>{[...new Set([...(checkerLists[workModal.role] || []), workForm.checkerName].filter(Boolean))].map(name => <option key={name} value={name}>{name}</option>)}</select>
                <details style={{ border: "1px solid #dbe4d6", borderRadius: "8px", padding: "8px 10px", background: "#fbfdf9" }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>จัดการรายชื่อผู้ตรวจ</summary><div style={{ display: "grid", gap: "8px", marginTop: "10px" }}><div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>{(checkerLists[workModal.role] || []).map(name => <span key={name} className="status-chip" style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>{name}<button type="button" aria-label={`แก้ไข ${name}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0 }} onClick={() => { const next = prompt("แก้ไขชื่อผู้ตรวจ", name); if (next?.trim()) saveCheckerList(workModal.role, (checkerLists[workModal.role] || []).map(item => item === name ? next.trim() : item)); }}>✎</button><button type="button" aria-label={`ลบ ${name}`} style={{ border: 0, background: "transparent", cursor: "pointer", padding: 0, color: "#b91c1c" }} onClick={() => { if (confirm(`ลบชื่อ “${name}” หรือไม่?`)) saveCheckerList(workModal.role, (checkerLists[workModal.role] || []).filter(item => item !== name)); }}>×</button></span>)}</div><div style={{ display: "flex", gap: "8px" }}><input value={newCheckerName} onChange={e => setNewCheckerName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); const name = newCheckerName.trim(); if (name) { saveCheckerList(workModal.role, [...(checkerLists[workModal.role] || []), name]); setNewCheckerName(""); } } }} placeholder="เพิ่มชื่อผู้ตรวจ" /><button type="button" className="secondary" onClick={() => { const name = newCheckerName.trim(); if (!name) return; saveCheckerList(workModal.role, [...(checkerLists[workModal.role] || []), name]); setNewCheckerName(""); }}>+ เพิ่ม</button></div></div></details>
                <label style={{ display: "flex", gap: "8px", alignItems: "center", background: "#f8fafc", border: "1px solid #dbe4ee", borderRadius: "8px", padding: "10px", fontWeight: 700 }}><input type="checkbox" checked={workForm.checklist.verified} onChange={e => setWorkForm(p => ({ ...p, checklist: { verified: e.target.checked } }))} />ตรวจสอบออเดอร์แล้ว</label>
                <label className="field-label">ผลตรวจสินค้า *</label><select value={workForm.checkResult} onChange={e => setWorkForm(p => ({ ...p, checkResult: e.target.value, missingNote: ["partial", "returned"].includes(e.target.value) ? p.missingNote : "" }))}><option value="complete">ครบ</option><option value="partial">ไม่ครบ / รอสินค้า</option>{workModal.role === "pack" && !skipsStoreCheck(workModal.order) && <option value="returned">ของผิด — ส่งกลับสโตร์ตรวจสอบ</option>}</select>
                <label className="field-label">รายละเอียด</label><textarea value={workForm.detail} onChange={e => setWorkForm(p => ({ ...p, detail: e.target.value }))} placeholder="รายละเอียดสินค้า/การจัดเตรียม" rows={3} />
                {["partial", "returned"].includes(workForm.checkResult) && <><label className="field-label">{workForm.checkResult === "returned" ? "รายการผิด / เหตุผลส่งกลับสโตร์ *" : "ของไม่ครบ / รอของ *"}</label><textarea value={workForm.missingNote} onChange={e => setWorkForm(p => ({ ...p, missingNote: e.target.value }))} placeholder={workForm.checkResult === "returned" ? "ระบุของผิดและเหตุผลเพื่อส่งกลับสโตร์" : "ระบุรายการและเหตุผล"} rows={2} /></>}
                {workModal.role === "store" && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: "8px", padding: "9px", fontSize: "12px", fontWeight: 700 }}>สโตร์: เมื่อตรวจครบแล้ว กดยืนยันออเดอร์ได้ทันที — รูปถ่ายและการส่ง LINE เป็นตัวเลือก</div>}
                {workModal.role === "pack" && workModal.order.deliveryMethod === "outstation" && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: "8px", padding: "9px", fontSize: "12px", fontWeight: 700 }}>ออเดอร์ต่างจังหวัด: ถ้าตรวจครบแล้ว กดยืนยันออเดอร์ได้ทันที — ระบบจะอัปเดตสโตร์เป็นเสร็จและสถานะเป็นพร้อมส่งขนส่งอัตโนมัติ · รูปถ่ายและ LINE เป็นตัวเลือก</div>}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <label className="secondary" style={{ cursor: "pointer" }}>📷 ถ่ายรูป{workModal.role === "store" || (workModal.role === "pack" && workModal.order.deliveryMethod === "outstation") ? " (ไม่บังคับ)" : ""} ({workPhotoPreviews.length}/5)<input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={captureWorkPhoto} /></label>
                  <button type="button" className={workSharedToLine ? "secondary" : "primary"} disabled={workSubmitting} onClick={shareWorkToLine}>💬 {workSharedToLine ? "แชร์ LINE แล้ว ✓" : "ส่ง LINE + ยืนยันอัตโนมัติ"}</button>
                  {workPhotoPreviews.length > 0 && <span className="muted">มีรูปในเครื่อง {workPhotoPreviews.length} รูป</span>}
                  {workSharedToLine && <span className="muted">แชร์ LINE แล้ว</span>}
                </div>
                {workPhotoPreviews.length > 0 && <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>{workPhotoPreviews.map((preview, index) => <div key={`${preview}-${index}`} style={{ position: "relative" }}><img src={preview} alt={`รูปที่ถ่าย ${index + 1}`} style={{ width: "92px", height: "92px", objectFit: "cover", borderRadius: "8px", border: "1px solid #d1d5db" }} /><button className="secondary" aria-label={`ลบรูปที่ ${index + 1}`} style={{ position: "absolute", top: "-7px", right: "-7px", borderRadius: "999px", minWidth: "24px", padding: "2px 5px" }} onClick={() => removeWorkPhoto(index)}>×</button></div>)}</div>}
                {workSubmitError && <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: "8px", padding: "9px", fontSize: "12px", fontWeight: 700 }}>บันทึกออเดอร์ไม่สำเร็จ: {workSubmitError}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}><button type="button" className="secondary" disabled={workSubmitting} onClick={() => { clearWorkPhotos(); setWorkModal(null); }}>ยกเลิก</button><button type="button" className="primary" disabled={workSubmitting} onClick={() => confirmWorkModal(false)}>{workSubmitting ? "กำลังบันทึก..." : (workModal.role === "store" || (workModal.role === "pack" && workModal.order.deliveryMethod === "outstation") ? "ยืนยันออเดอร์ได้เลย" : "ยืนยันออเดอร์")}</button></div>
              </div>
            </section>
          </div>
        )}

        {onlineReturnTarget && (
          <div className="modal-backdrop" role="presentation">
            <section className="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="online-return-title">
              <div className="panel-head"><h2 id="online-return-title">ส่งงานกลับสโตร์ตรวจสอบ</h2><span>{onlineReturnTarget.bookingNumber || "ไม่ระบุเลขใบสั่งจอง"}</span></div>
              <label className="field-label" htmlFor="online-return-reason">ของผิด / เหตุผลที่ต้องตรวจสอบใหม่ *</label>
              <textarea id="online-return-reason" rows={4} value={onlineReturnReason} onChange={event => setOnlineReturnReason(event.target.value)} placeholder="ระบุรายการที่ผิดและสิ่งที่สโตร์ต้องตรวจสอบ" autoFocus />
              <div className="modal-actions"><button className="secondary" onClick={() => { setOnlineReturnTarget(null); setOnlineReturnReason(""); }}>ยกเลิก</button><button className="primary" disabled={!onlineReturnReason.trim()} onClick={async () => { const target = onlineReturnTarget; const reason = onlineReturnReason; setOnlineReturnTarget(null); setOnlineReturnReason(""); await updateReportPackStatus(target, "returned", reason); }}>ยืนยันส่งกลับสโตร์</button></div>
            </section>
          </div>
        )}

        {chiangmaiHistoryOrder && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="panel-head"><h2>ประวัติออเดอร์เชียงใหม่/ใกล้เคียง</h2><button className="secondary" onClick={() => setChiangmaiHistoryOrder(null)}>ปิด</button></div>
              <PackSalesOrderDetails order={chiangmaiHistoryOrder} />
              <div style={{ display: "grid", gap: "6px", marginTop: "10px" }}><div><b>สถานะล่าสุด:</b> {chiangmaiHistoryOrder.status || "-"}</div><div><b>สโตร์:</b> {storeStatusLabel(chiangmaiHistoryOrder)} · <b>ห้องแพ็ค:</b> {WORKFLOW_STATUS_META[chiangmaiHistoryOrder.packStatus]?.label || chiangmaiHistoryOrder.packStatus || "-"}</div>{chiangmaiHistoryOrder.missingItems?.length > 0 && <div style={{ background: "#fef3c7", padding: "8px", borderRadius: "6px" }}><b>รอสินค้า/ของไม่ครบ:</b> {chiangmaiHistoryOrder.missingItems.join(", ")}</div>}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px", padding: "10px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #dbe4ee" }}>
                {auth.role === "pack" && chiangmaiHistoryOrder.workflowType === "store_route" && chiangmaiHistoryOrder.packStatus !== "returned" && <button className="secondary danger" onClick={() => { const order = chiangmaiHistoryOrder; setChiangmaiHistoryOrder(null); openWorkModal(order, "pack"); }}>⚠️ พบปัญหา · ส่งกลับสโตร์ตรวจสอบ</button>}
                {auth.role === "store" && chiangmaiHistoryOrder.storeStatus === "returned" && <button className="primary" onClick={() => { const order = chiangmaiHistoryOrder; setChiangmaiHistoryOrder(null); openWorkModal(order, "store"); }}>🔧 สโตร์แก้ไขและยืนยัน</button>}
                {chiangmaiHistoryOrder.storeStatus === "returned" && <span className="muted" style={{ alignSelf: "center" }}>งานนี้ส่งกลับให้สโตร์ตรวจสอบแล้ว · แก้ไขเสร็จให้ยืนยันเพื่อส่งห้องแพ็คตรวจซ้ำ</span>}
              </div>
              <h3 style={{ marginTop: "16px" }}>Timeline การดำเนินงาน</h3><div style={{ display: "grid", gap: "8px" }}>{getOrderTimeline(chiangmaiHistoryOrder).map(item => <article key={item.id} style={{ borderLeft: "3px solid #2563eb", padding: "7px 10px", background: "#f8fafc" }}><b>{item.title}</b><div className="muted">{item.at || "-"}</div>{item.note && <div>{item.note}</div>}</article>)}{!getOrderTimeline(chiangmaiHistoryOrder).length && <p className="muted">ออเดอร์เก่ายังไม่มี Timeline ที่ระบบบันทึกไว้</p>}</div>
            </section>
          </div>
        )}

        {storeReportDetail && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="panel-head"><h2>รายละเอียดรายงาน</h2><button className="secondary" onClick={() => setStoreReportDetail(null)}>ปิด</button></div>
              <div style={{ display: "grid", gap: "7px" }}><b>{storeReportDetail.bookingNumber || "ไม่มีเลขใบสั่งจอง"}</b>{storeReportDetail.linkedOrder && <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "7px", padding: "8px" }}><b>เชื่อมกับออเดอร์ฝ่ายขาย</b><div>{storeReportDetail.linkedOrder.id} · {storeReportDetail.linkedOrder.customerName || "ไม่ระบุลูกค้า"}</div><small>{[storeReportDetail.linkedOrder.zone, storeReportDetail.linkedOrder.address].filter(Boolean).join(" · ")}</small></div>}<div>{storeReportDetail.detail || "-"}</div>{storeReportDetail.note && <div className="muted">หมายเหตุ: {storeReportDetail.note}</div>}<div className="muted">สร้างโดย {storeReportDetail.createdBy || "-"} · {storeReportDetail.createdAt || "-"}</div>{storeReportDetail.confirmedAt && <div className="muted">ยืนยัน: {storeReportDetail.confirmedAt} โดย {storeReportDetail.confirmedBy || "-"}</div>}{storeReportDetail.deletedAt && <div style={{ color: "#991b1b" }}>ลบเมื่อ {storeReportDetail.deletedAt} · เหตุผล: {storeReportDetail.deleteReason || "-"}</div>}</div>
              <h3 style={{ marginTop: "16px" }}>ประวัติการเปลี่ยนแปลง</h3><div style={{ display: "grid", gap: "8px" }}>{(storeReportDetail.history || []).map(log => <article key={log.id} style={{ borderLeft: "3px solid #2563eb", padding: "7px 10px", background: "#f8fafc" }}><b>{log.event}</b><div className="muted">{log.at} · {log.by || "-"}</div>{log.reason && <div>เหตุผล: {log.reason}</div>}</article>)}{!(storeReportDetail.history || []).length && <p className="muted">รายการเก่าอาจยังไม่มี log ก่อนเริ่มใช้ระบบนี้</p>}</div>
            </section>
          </div>
        )}

        {reportModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(850px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
              <div className="panel-head"><h2>บันทึกรายงาน{reportModal === "outstation" ? "ต่างจังหวัด" : "ออนไลน์"}</h2><span>{reportModal === "online" ? "ส่งต่อห้องแพ็ค · ไม่ขึ้น Sheet" : "บันทึกประวัติสโตร์ · ไม่ขึ้น Sheet"}</span></div>
              <div style={{ display: "grid", gap: "10px" }}>{reportRows.map((row, index) => <div key={index} style={{ border: "1px solid #e5e7eb", padding: "10px", borderRadius: "8px", display: "grid", gap: "8px" }}><b>รายการ {index + 1}</b><BookingNumberInput value={row.bookingNumber} onChange={bookingNumber => setReportRows(rows => rows.map((item, i) => i === index ? { ...item, bookingNumber } : item))} /><textarea value={row.detail} onChange={e => setReportRows(rows => rows.map((item, i) => i === index ? { ...item, detail: e.target.value } : item))} placeholder="รายละเอียด" rows={2} /><textarea value={row.note} onChange={e => setReportRows(rows => rows.map((item, i) => i === index ? { ...item, note: e.target.value } : item))} placeholder="หมายเหตุ/ของไม่ครบ/รอของ" rows={2} /><select value={row.status} onChange={e => setReportRows(rows => rows.map((item, i) => i === index ? { ...item, status: e.target.value } : item))}><option value="saved">ครบ</option><option value="waiting">รอของ</option><option value="partial">ของไม่ครบ</option></select>{reportRows.length > 1 && <button className="secondary" onClick={() => setReportRows(rows => rows.filter((_, i) => i !== index))}>ลบรายการนี้</button>}</div>)}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginTop: "12px" }}><label className="secondary" style={{ cursor: "pointer" }}>📷 ถ่ายรูป (ไม่บังคับ)<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={captureReportPhoto} /></label><button className="secondary" onClick={shareReportToLine}>💬 ส่ง LINE (ไม่บังคับ)</button>{reportPhotoPreview && <span className="muted">มีรูปในเครื่องแล้ว</span>}</div>
              {reportPhotoPreview && <img src={reportPhotoPreview} alt="รูปประกอบรายงาน" style={{ maxWidth: "100%", maxHeight: "220px", objectFit: "contain", borderRadius: "8px", marginTop: "8px" }} />}
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}><button className="secondary" onClick={() => setReportRows(rows => [...rows, { bookingNumber: "", detail: "", note: "", status: "saved" }])}>+ เพิ่มรายการ</button><div style={{ display: "flex", gap: "8px" }}><button className="secondary" onClick={() => setReportModal(null)}>ยกเลิก</button><button className="primary" onClick={saveStoreReports}>บันทึกทั้งหมด</button></div></div>
            </section>
          </div>
        )}

        {editingStoreReport && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.48)", zIndex: 1500, display: "grid", placeItems: "center", padding: "16px" }}>
            <section className="panel" style={{ width: "min(620px, 100%)" }}>
              <div className="panel-head"><h2>แก้ไขรายการรายงาน</h2><span>{editingStoreReport.type === "booking" ? "ใบสั่งจอง" : "ใบขายออนไลน์"}</span></div>
              <div style={{ display: "grid", gap: "10px" }}><BookingNumberInput value={editingStoreReport.bookingNumber || ""} onChange={bookingNumber => setEditingStoreReport(item => ({ ...item, bookingNumber }))} /><textarea rows={3} value={editingStoreReport.detail || ""} onChange={e => setEditingStoreReport(item => ({ ...item, detail: e.target.value }))} placeholder="รายละเอียด" /><textarea rows={3} value={editingStoreReport.note || ""} onChange={e => setEditingStoreReport(item => ({ ...item, note: e.target.value }))} placeholder="หมายเหตุ/ของไม่ครบ/รอของ" /><select value={editingStoreReport.status || "draft"} onChange={e => setEditingStoreReport(item => ({ ...item, status: e.target.value }))}><option value="draft">ครบ</option><option value="saved">ครบ · ยืนยันแล้ว</option><option value="waiting">รอของ</option><option value="partial">ของไม่ครบ</option></select>{editingStoreReport.confirmedAt && <textarea rows={2} value={editingStoreReport.reason || ""} onChange={e => setEditingStoreReport(item => ({ ...item, reason: e.target.value }))} placeholder="เหตุผลการแก้ไข (บังคับ เพราะยืนยันแล้ว)" />}<div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}><button className="secondary" onClick={() => setEditingStoreReport(null)}>ยกเลิก</button><button className="primary" onClick={saveEditedStoreReport}>บันทึกการแก้ไข</button></div></div>
            </section>
          </div>
        )}

        {displayTab === "dispatch" && (
          <div className="dispatch-grid">
            <section className="panel">
              {auth.role === "admin" && <div style={{ marginBottom: "12px", display: "flex", gap: "8px" }}>
                <button type="button" className="secondary" onClick={resetAllOrders} style={{ padding: "8px 14px", fontSize: "13px", fontWeight: "bold" }}>🔄 รีเซ็ตออเดอร์</button>
              </div>}
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
                      <button className="secondary danger" aria-label={`ลบออเดอร์ ${order.id}`} style={{ padding: "4px 8px", fontSize: "12px" }} onClick={() => deleteOrder(order.id)}>ลบ</button>
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

        {auth.role === "driver" && displayTab === "driver-dashboard" && (() => {
          const waiting = driverTodayOrders.filter(order => order.status === "กำลังส่ง").length;
          const delivering = driverTodayOrders.filter(order => order.status === "กำลังจัดส่ง").length;
          const completedTotal = driverTodayCompletedOrders.length + driverTodayCompletedRouteTasks.length;
          const workTotal = driverTodayOrders.length + driverTodayRouteTasks.length;
          const driverMonthOrders = (orders || []).filter(order => order.driverId === driverId && getOrderServiceDate(order).startsWith(currentMonthKey));
          const driverMonthRouteTasks = (routeTasks || []).filter(task => task.driverId === driverId && String(task.serviceDate || "").startsWith(currentMonthKey));
          const driverMonthCompletedOrders = driverMonthOrders.filter(order => order.status === "ส่งสำเร็จ");
          const driverMonthCompletedRoutes = driverMonthRouteTasks.filter(task => task.status === "เสร็จงาน");
          const backlog = (orders || []).filter(order => order.driverId === driverId && getOrderServiceDate(order) < todayServiceDate && ["กำลังส่ง", "กำลังจัดส่ง"].includes(order.status));
          const issues = (orders || []).filter(order => order.driverId === driverId && order.status === "ติดปัญหา");
          const statusTones = { "กำลังส่ง": "is-amber", "กำลังจัดส่ง": "is-blue", "ส่งสำเร็จ": "is-green", "ติดปัญหา": "is-red" };
          const recentOrders = driverTodayOrders.slice(0, 6).map(order => ({ ...order, statusLabel: order.status || "รอจัดส่ง", statusTone: statusTones[order.status] || "is-primary" }));
          const activities = driverTodayOrders.flatMap(order => [
            order.acceptedAt && { id: `${order.id}-accepted`, at: order.acceptedAt, title: "รับออเดอร์", note: order.customerName || order.id },
            order.checkInAt && { id: `${order.id}-checkin`, at: order.checkInAt, title: "ถึงจุดจัดส่ง", note: order.customerName || order.id },
            order.deliveredAt && { id: `${order.id}-delivered`, at: order.updatedAt || order.deliveredAt, title: "จัดส่งสำเร็จ", note: order.customerName || order.id }
          ].filter(Boolean)).sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)).slice(0, 12);
          return <section className="panel role-workspace ops-workspace ops-dashboard-panel"><OperationsKpiDashboard
            cards={[
              { value: driverTodayOrders.length, label: "ออเดอร์วันนี้", detail: "งานที่รับไว้วันนี้", tone: "is-primary" },
              { value: waiting, label: "รอจัดส่ง", detail: "รับงานแล้วและรอออกส่ง", tone: "is-amber" },
              { value: delivering, label: "กำลังจัดส่ง", detail: "เช็กอินถึงจุดหมายแล้ว", tone: "is-blue" },
              { value: driverTodayCompletedOrders.length, label: "ส่งสำเร็จ", detail: "ออเดอร์ที่ส่งเสร็จวันนี้", tone: "is-green" },
              { value: driverTodayRouteTasks.length, label: "งานวิ่ง", detail: "งานสาขาและงานวิ่งไกล", tone: "is-red" }
            ]}
            completed={completedTotal} total={workTotal}
            followUps={[
              { label: "งานค้างจากวันก่อน", emptyLabel: "ไม่มีงานค้างจากวันก่อน", value: backlog.length },
              { label: "งานติดปัญหา", emptyLabel: "ไม่มีงานติดปัญหา", value: issues.length },
              { label: "งานวันนี้ที่ยังไม่เสร็จ", emptyLabel: "งานวันนี้เสร็จครบแล้ว", value: Math.max(0, workTotal - completedTotal) }
            ]}
            monthly={[
              { label: "ออเดอร์ทั้งหมด", value: driverMonthOrders.length },
              { label: "ส่งสำเร็จ", value: driverMonthCompletedOrders.length },
              { label: "งานวิ่ง", value: driverMonthRouteTasks.length },
              { label: "วิ่งเสร็จ", value: driverMonthCompletedRoutes.length },
              { label: "อัตราสำเร็จ", value: (driverMonthOrders.length + driverMonthRouteTasks.length) ? Math.round(((driverMonthCompletedOrders.length + driverMonthCompletedRoutes.length) / (driverMonthOrders.length + driverMonthRouteTasks.length)) * 100) : 0, suffix: "%" }
            ]}
            recentOrders={recentOrders} activities={activities}
            information="KPI คนขับคำนวณจากออเดอร์และงานวิ่งที่ผูกกับบัญชีคนขับปัจจุบันแบบเรียลไทม์ โดยไม่เปลี่ยนขั้นตอนรับงานหรือจัดส่ง"
            progressTitle="ความคืบหน้างานจัดส่งวันนี้" progressLabel="เสร็จแล้ว"
          /></section>;
        })()}

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
              const pending = orders.filter(o => o.status === "รอคนขับรับ" && o.queueStatus === "queued" && !o.driverId && !pendingOrderUpdatesRef.current.has(o.id));
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
                          {order.workflowType === "direct_driver" && <span className="status-chip" style={{ display: "inline-flex", marginTop: "6px", color: "#991b1b", background: "#fee2e2", border: "2px solid #dc2626", fontWeight: 900 }}>🚨 เร่งด่วน · ส่งตรงคนขับ</span>}
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
                            acceptDriverDeliveryOrder(order);
                          }}>✓ รับออเดอร์นี้</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
            })()}

	            {/* ส่วนออเดอร์ที่รับแล้ว (In-Progress Orders) */}
	            {driverDeliveryOrders.length > 0 && (
	              <section className="panel">
	                <div className="panel-head"><h2>🚗 ลำดับส่งของฉัน</h2><span>{driverDeliveryOrders.length} งาน</span></div>
	                <div className="driver-sequence-help">ลากการ์ดเพื่อจัดลำดับได้ · งานที่กำลังจัดส่งจะถูกตรึงบนสุด · งานใหม่จะต่อท้ายอัตโนมัติ</div>
	                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
	                  {driverDeliveryOrders.map((order, sequenceIndex) => (
	                    <div key={order.id} className={`driver-sequence-card ${order.status === "กำลังจัดส่ง" ? "locked" : ""}`} draggable={order.status === "กำลังส่ง"} onDragStart={() => setDriverSequenceDragId(order.id)} onDragOver={(event) => { if (order.status === "กำลังส่ง") event.preventDefault(); }} onDrop={() => { if (order.status === "กำลังส่ง") dropDriverSequence(order.id); }} style={{ background: "#f0f9ff", padding: "12px", borderRadius: "8px", border: `2px solid ${statusColor[order.status]}`, display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div className="driver-sequence-bar">{order.status === "กำลังจัดส่ง" ? <span>📍 กำลังนำส่ง · ตรึงลำดับ</span> : <><span>☰ ลำดับ {sequenceIndex - driverCurrentDeliveryOrders.length + 1}</span><div><button className="secondary" disabled={sequenceIndex === driverCurrentDeliveryOrders.length} onClick={() => moveDriverSequence(order.id, -1)}>↑</button><button className="secondary" disabled={sequenceIndex === driverDeliveryOrders.length - 1} onClick={() => moveDriverSequence(order.id, 1)}>↓</button></div></>}</div>
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
	                              onClick={async () => {
	                                setSyncStatus(`⏳ กำลังบันทึกว่าถึงจุดหมาย "${order.id}"...`);
	                                const saved = await persistDriverOrderPatch(order, { status: "กำลังจัดส่ง", checkInAt: new Date().toLocaleString("th-TH") });
	                                if (!saved.ok) return setSyncStatus(`❌ บันทึกไปถึงแล้วไม่สำเร็จ: ${saved.error}`);
	                                recordDriverCheckInLocation({ ...order, status: "กำลังจัดส่ง" });
	                                setSyncStatus(`✅ ถึงจุดหมายแล้ว กรุณาถ่ายรูป POD 1–5 รูป`);
	                              }}>🚗 ไปถึงแล้ว</button>
	                            <button 
	                              className="secondary" 
	                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} 
	                              disabled={false}
                              onClick={() => cancelDriverDeliveryOrder(order)}>❌ ยกเลิก</button>
                          </>
                        )}
                        {order.status === "กำลังจัดส่ง" && (
                          <>
	                            <label 
	                              className="primary" 
	                              style={{ padding: "8px", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "8px", background: "#176b3a", color: "white" }}>
	                              📷 ถ่ายรูป ({(podPreviewsByOrder[order.id] || []).length}/5)
	                              <input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} disabled={(podPreviewsByOrder[order.id] || []).length >= 5} onChange={(e) => {
	                                if (e.target.files?.length) uploadPod(order, e.target.files);
	                                e.target.value = "";
	                              }} />
	                            </label>
	                            <button 
	                              className="secondary" 
	                              style={{ padding: "8px", fontSize: "12px", background: "#fee2e2", color: "#991b1b" }} 
	                              disabled={false}
                              onClick={() => cancelDriverDeliveryOrder(order)}>❌ ยกเลิก</button>
                          </>
                        )}
	                        {order.status === "กำลังจัดส่ง" && (podPreviewsByOrder[order.id] || []).length > 0 && !order.sharedToLine && <textarea value={driverNoteDrafts[order.id] ?? order.driverNote ?? ""} onChange={e => setDriverNoteDrafts((drafts) => ({ ...drafts, [order.id]: e.target.value }))} placeholder="หมายเหตุจากคนขับ (ถ้ามี)" rows={2} style={{ gridColumn: "1 / -1", width: "100%", boxSizing: "border-box", padding: "8px", borderRadius: "8px", border: "1px solid #bfdbfe" }} />}
	                        {order.status === "กำลังจัดส่ง" && (podPreviewsByOrder[order.id] || []).length > 0 && !order.sharedToLine && (
	                          <button
	                            className="primary"
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#2563eb" }}
	                            onClick={() => shareOrderToLine(order, driverNoteDrafts[order.id] ?? order.driverNote ?? "")}
	                          >✅ ส่งสำเร็จ + ส่งพร้อม LINE</button>
	                        )}
	                        {order.status === "กำลังจัดส่ง" && order.photo && order.sharedToLine && (
	                          <button 
	                            className="primary" 
	                            style={{ padding: "8px", fontSize: "12px", gridColumn: "1 / -1", background: "#059669" }} 
	                            disabled={false}
	                            onClick={() => {
	                              updateOrder(order.id, { status: "ส่งสำเร็จ", queueStatus: "completed", deliveredAt: new Date().toLocaleString("th-TH"), driverName: order.driverName || state.auth?.name || "", driverId: order.driverId || state.auth?.driverId || driverId || "" });
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
                      {(podPreviewsByOrder[order.id] || []).length > 0 && (
                        <div style={{ marginTop: "8px" }}><b style={{ display: "block", marginBottom: "6px", fontSize: "12px", color: "#166534" }}>📷 รูป POD {(podPreviewsByOrder[order.id] || []).length}/5</b><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "6px" }}>{(podPreviewsByOrder[order.id] || []).map((preview, index) => <div key={preview} style={{ borderRadius: "6px", overflow: "hidden", border: "2px solid #22c55e", aspectRatio: "1 / 1" }}><img src={preview} alt={`POD ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>)}</div></div>
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
	                <button type="button" className="secondary" style={{ width: "100%", padding: "10px", marginBottom: "8px" }} onClick={async () => {
	                  if (!window.confirm("ยืนยันย้าย UID คนขับเข้าสู่ระบบใหม่? ประวัติงานจะยังใช้ driverId เดิมทั้งหมด")) return;
	                  try {
	                    const idToken = await refreshAuthToken(true);
	                    const res = await fetch("/api/admin/driver-identities", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ dryRun: false }) });
	                    const json = await res.json().catch(() => null);
	                    if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
	                    const data = json.data || {};
	                    setSyncStatus(`✅ ย้ายตัวตนคนขับแล้ว ${data.migrated || 0} คน · ข้าม ${data.skipped || 0} คน`);
	                    alert(`✅ ย้ายตัวตนคนขับแล้ว ${data.migrated || 0} คน\nประวัติเดิมยังเชื่อมด้วย driverId เดิม`);
	                  } catch (error) { setSyncStatus(`❌ ย้ายตัวตนคนขับไม่สำเร็จ: ${error?.message || error}`); }
	                }}>🔐 ย้ายตัวตนคนขับ (เก็บประวัติเดิม)</button>
	                <button type="button" className="secondary" style={{ background: "#dc2626", color: "white", width: "100%", padding: "10px" }} onClick={resetAllOrders}>🔄 รีเซ็ตแดชบอร์ด</button>
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
	              <div className="panel-head"><h2>ประวัติการเข้าสู่ระบบ</h2><span>{(state.loginHistory || []).length} รายการ</span></div>
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
        zIndex: 1200,
        background: unreadChatCount > 0 && !chatOpen ? "linear-gradient(135deg, #f97316, #dc2626)" : "linear-gradient(135deg, #fb923c, #ea580c)",
        border: "2px solid #fff7ed",
        boxShadow: unreadChatCount > 0 && !chatOpen ? "0 0 0 5px rgba(249, 115, 22, 0.24), 0 10px 22px rgba(220, 38, 38, 0.42)" : "0 7px 16px rgba(234, 88, 12, 0.34)",
        transform: unreadChatCount > 0 && !chatOpen ? "scale(1.08)" : "scale(1)",
        transition: "transform .18s ease, box-shadow .18s ease"
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
          width: "90%",
          maxHeight: "90vh",
          overflowY: "auto"
        }}>
          <h2 style={{ marginTop: 0, color: "#1f2937" }}>📦 ยืนยันส่งออเดอร์</h2>
          {orderConfirmError && <div role="alert" style={{ background: "#fef2f2", border: "2px solid #dc2626", borderLeftWidth: "6px", color: "#991b1b", borderRadius: "10px", padding: "11px", marginBottom: "12px", display: "grid", gap: "4px" }}><b>❌ ยังบันทึกออเดอร์ไม่ได้</b><span style={{ fontSize: "13px" }}>{orderConfirmError}</span><small>ตรวจสอบข้อมูลด้านล่าง แล้วกดยืนยันอีกครั้งได้ทันที</small></div>}
          {!getOrderBookingNumbers(pendingOrder).length && <div role="alert" style={{ background: "#fff1f2", border: "2px solid #e11d48", borderLeftWidth: "6px", color: "#9f1239", borderRadius: "10px", padding: "11px", marginBottom: "12px", display: "grid", gap: "4px" }}><b>⚠️ ออเดอร์นี้ยังไม่มีเลขใบสั่งจอง</b><span style={{ fontSize: "13px" }}>ส่งเข้าสโตร์ ห้องแพ็ค หรือคิวคนขับได้ตามปกติ แต่ต้องติดตามด้วยเลขออเดอร์ และเพิ่มเลขใบสั่งจองภายหลังเมื่อได้รับเอกสาร</span></div>}
          <div style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}><b>เส้นทางตรวจสอบสินค้า</b><select value={pendingOrder.deliveryMethod === "outstation" ? "direct_pack" : pendingOrder.workflowType} disabled={pendingOrder.deliveryMethod === "outstation"} style={pendingOrder.workflowType === "direct_driver" ? { border: "2px solid #dc2626", background: "#fef2f2", color: "#991b1b", fontWeight: 800 } : undefined} onChange={e => setPendingOrder(order => ({ ...order, workflowType: e.target.value }))}><option value="store_route">ผ่านสโตร์ก่อน แล้วส่งห้องแพ็ค</option><option value="direct_pack">ส่งเข้าห้องแพ็คโดยตรง</option>{pendingOrder.deliveryMethod === "company_driver" && <option value="direct_driver">🚨 ส่งตรงคนขับทันที (เร่งด่วน)</option>}</select>{pendingOrder.deliveryMethod === "outstation" && <small className="muted">งานต่างจังหวัดส่งเข้าห้องแพ็คโดยตรงอัตโนมัติ</small>}</label>
            <label style={{ display: "grid", gap: "6px" }}><b>รูปแบบจัดส่ง</b><select value={pendingOrder.deliveryMethod} onChange={e => { const deliveryMethod = e.target.value; setPendingOrder(order => ({ ...order, deliveryMethod, workflowType: deliveryMethod === "outstation" ? "direct_pack" : deliveryMethod !== "company_driver" && order.workflowType === "direct_driver" ? "store_route" : order.workflowType, shippingCarrier: deliveryMethod === "outstation" ? order.shippingCarrier : "", shippingCarrierOther: deliveryMethod === "outstation" ? order.shippingCarrierOther : "" })); }}><option value="company_driver">คนขับบริษัท</option><option value="grab_pickup">Grab</option><option value="customer_pickup">ลูกค้ารับหน้าร้าน</option><option value="outstation">ต่างจังหวัด</option></select></label>
            {pendingOrder.workflowType === "direct_driver" && pendingOrder.deliveryMethod === "company_driver" && <div style={{ background: "#fee2e2", border: "2px solid #dc2626", color: "#991b1b", borderRadius: "10px", padding: "12px", fontWeight: 800 }}><div style={{ fontSize: "15px" }}>🚨 ออเดอร์เร่งด่วน · ส่งตรงเข้าคิวคนขับ</div><small style={{ display: "block", marginTop: "4px" }}>ออเดอร์นี้จะข้ามสโตร์และห้องแพ็ค และแจ้งเตือนคนขับทันทีหลังยืนยัน</small></div>}
            {pendingOrder.deliveryMethod === "outstation" && <label style={{ display: "grid", gap: "6px" }}><b>บริษัทขนส่ง *</b><select value={pendingOrder.shippingCarrier || ""} onChange={e => setPendingOrder(order => ({ ...order, shippingCarrier: e.target.value, shippingCarrierOther: e.target.value === "อื่นๆ" ? order.shippingCarrierOther : "" }))}><option value="">-- เลือกบริษัทขนส่ง --</option>{["Kerry", "Flash", "Nim Express", "NTC", "เมล์เขียว", "นครชัยทัวร์", "นครชัยแอร์", "เปรมประชา", "ศรีขนส่ง", "ชนกานต์ขนส่ง", "พงษ์เดช", "Nim ปลายทาง", "อื่นๆ"].map(carrier => <option key={carrier} value={carrier}>{carrier}</option>)}</select>{pendingOrder.shippingCarrier === "อื่นๆ" && <input value={pendingOrder.shippingCarrierOther || ""} onChange={e => setPendingOrder(order => ({ ...order, shippingCarrierOther: e.target.value }))} placeholder="ระบุชื่อบริษัทขนส่ง" />}</label>}
            <label style={{ display: "grid", gap: "6px" }}><b>รายละเอียดสินค้า / หมายเหตุฝ่ายขาย</b><textarea rows={3} value={pendingOrder.salesNote || ""} onChange={e => setPendingOrder(order => ({ ...order, salesNote: e.target.value }))} placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)" /></label>
          </div>
          <div style={{ background: "#f3f4f6", padding: "12px", borderRadius: "6px", margin: "12px 0" }}>
            <p><b>ลูกค้า:</b> {pendingOrder.customerName}</p>
            <p><b>พื้นที่:</b> {pendingOrder.zone}</p>
            <p><b>เวลารอจัดเตรียม:</b> {pendingOrder.window}</p>
            <p><b>จำนวนของที่ส่ง:</b> {pendingOrder.boxes} {pendingOrder.packageUnit === "bag" ? "ถุง" : "กล่อง"}</p>
            <p><b>COD:</b> ฿{money(pendingOrder.cod)}</p>
            <p><b>เลขที่ใบสั่งจอง:</b> {formatOrderBookingNumbers(pendingOrder) || "ยังไม่ระบุ · ติดตามด้วยเลขออเดอร์"}</p>
            {pendingOrder.shippingCarrier && <p><b>ขนส่งต่างจังหวัด:</b> {pendingOrder.shippingCarrier}</p>}
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
            <button className="secondary" style={{ flex: 1 }} disabled={orderConfirmSubmitting} onClick={() => { setShowOrderConfirm(false); setOrderConfirmError(""); setShareNewOrderToLine(false); }}>ยกเลิก</button>
            <button className="primary" style={{ flex: 1 }} disabled={orderConfirmSubmitting} onClick={confirmOrder}>{orderConfirmSubmitting ? "กำลังบันทึก..." : "ยืนยันและบันทึกออเดอร์"}</button>
          </div>
        </div>
      </div>
    )}
    {showOutstationCarrierModal && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1600, display: "grid", placeItems: "center", padding: "16px" }}>
        <section className="panel" style={{ width: "min(520px, 100%)" }}>
          <div className="panel-head"><h2>เลือกขนส่งต่างจังหวัด</h2><span>จำเป็นสำหรับออเดอร์นี้</span></div>
          <div style={{ display: "grid", gap: "10px" }}>
            <select value={orderForm.shippingCarrier} onChange={e => setOrderForm(p => ({ ...p, shippingCarrier: e.target.value }))}>
              <option value="">-- เลือกบริษัทขนส่ง --</option>
              {["Kerry", "Flash", "Nim Express", "NTC", "เมล์เขียว", "นครชัยทัวร์", "นครชัยแอร์", "เปรมประชา", "ศรีขนส่ง", "ชนกานต์ขนส่ง", "พงษ์เดช", "Nim ปลายทาง", "อื่นๆ"].map(carrier => <option key={carrier} value={carrier}>{carrier}</option>)}
            </select>
            {orderForm.shippingCarrier === "อื่นๆ" && <input value={orderForm.shippingCarrierOther} onChange={e => setOrderForm(p => ({ ...p, shippingCarrierOther: e.target.value }))} placeholder="ระบุชื่อบริษัทขนส่ง" autoFocus />}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}><button className="secondary" onClick={() => { setShowOutstationCarrierModal(false); if (!orderForm.shippingCarrier) setOrderForm(p => ({ ...p, deliveryMethod: "company_driver" })); }}>ยกเลิก</button><button className="primary" onClick={() => { const carrier = orderForm.shippingCarrier === "อื่นๆ" ? orderForm.shippingCarrierOther.trim() : orderForm.shippingCarrier; if (!carrier) return setSyncStatus("❌ กรุณาระบุบริษัทขนส่ง"); setOrderForm(p => ({ ...p, shippingCarrier: carrier })); setShowOutstationCarrierModal(false); }}>ยืนยันขนส่ง</button></div>
          </div>
        </section>
      </div>
    )}
    </>
  );
}


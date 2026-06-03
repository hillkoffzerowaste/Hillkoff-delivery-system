import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { CHATBOT_TRAINING } from "../../../../lib/chatbotTraining";

export const runtime = "nodejs";

const MAX_ORDERS = 500;
const MAX_CUSTOMERS = 250;
const MAX_SESSIONS = 40;

const STATUS_DONE = "ส่งสำเร็จ";
const STATUS_WAITING = "รอคนขับรับ";
const STATUS_SHIPPING = ["กำลังส่ง", "กำลังจัดส่ง"];
const STATUS_PROBLEM = "ติดปัญหา";

function toServiceDateKeyBangkok(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function hasAny(text, words = []) {
  const normalized = normalizeText(text);
  const compact = compactText(text);
  return words.some((word) => {
    const w = normalizeText(word);
    if (!w) return false;
    return normalized.includes(w) || compact.includes(compactText(w));
  });
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function orderServiceDate(order) {
  return String(order?.serviceDate || "").slice(0, 10);
}

function orderDriverName(order, drivers = []) {
  const driver = drivers.find((d) => {
    const ids = [d.driverId, d.id, d.phone].filter(Boolean).map(String);
    return ids.includes(String(order?.driverId || ""));
  });
  return order?.driverName || driver?.name || driver?.firstName || order?.driverId || "";
}

function isAssignedToDriver(order) {
  return Boolean(order?.driverId || order?.driverName);
}

function statusStats(orders) {
  const stats = { total: orders.length, waiting: 0, shipping: 0, done: 0, problem: 0, canceled: 0, cod: 0, codDone: 0, zones: {} };
  for (const order of orders) {
    const status = String(order.status || "");
    const zone = String(order.zone || order.area || "ไม่ระบุพื้นที่");
    const cod = Number(order.cod || order.codAmount || 0);
    stats.cod += cod;
    stats.zones[zone] = (stats.zones[zone] || 0) + 1;
    if (status === STATUS_WAITING) stats.waiting += 1;
    else if (STATUS_SHIPPING.includes(status)) stats.shipping += 1;
    else if (status === STATUS_DONE) {
      stats.done += 1;
      stats.codDone += cod;
    } else if (status === STATUS_PROBLEM || order.complaint) stats.problem += 1;
    else if (status === "ยกเลิก") stats.canceled += 1;
  }
  return stats;
}

function formatOrderLine(order, drivers = []) {
  const customer = order.customerName || order.customer || "ไม่ระบุลูกค้า";
  const zone = order.zone || order.area || "-";
  const driver = orderDriverName(order, drivers) || "ยังไม่ระบุคนส่ง";
  const deliveredAt = order.deliveredAt ? ` | เสร็จ ${order.deliveredAt}` : "";
  return `- ${order.id || "-"} | ${customer} | ${zone} | ${order.status || "-"} | คนส่ง: ${driver} | COD ฿${money(order.cod || 0)}${deliveredAt}`;
}

function topEntries(record, limit = 6) {
  return Object.entries(record || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, limit);
}

async function verifySales(payload) {
  const idToken = String(payload?.idToken || "").trim();
  const phoneDigits = String(payload?.phoneDigits || "").replace(/\D/g, "");
  if (!idToken) return { ok: false, status: 400, error: "Missing idToken" };
  if (!phoneDigits) return { ok: false, status: 400, error: "Missing phoneDigits" };

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const userSnap = await db.collection("users_by_phone").doc(phoneDigits).get();
    const user = userSnap.exists ? userSnap.data() : null;
    const role = String(user?.role || "");
    const uid = String(user?.uid || user?.uidLast || "");
    if (!user || role !== "sales" || !uid || uid !== decoded.uid) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
    return { ok: true, db, user, phoneDigits };
  } catch (e) {
    return { ok: false, status: 401, error: e?.message || "Unauthorized" };
  }
}

async function safeGetDocs(query) {
  try {
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  } catch {
    return [];
  }
}

async function loadContext(db, todayKey) {
  const [orders, customers, drivers, assessments, sessions] = await Promise.all([
    safeGetDocs(db.collection("orders").orderBy("updatedAt", "desc").limit(MAX_ORDERS)),
    safeGetDocs(db.collection("customers").orderBy("updatedAt", "desc").limit(MAX_CUSTOMERS)),
    safeGetDocs(db.collection("users_by_phone").limit(250)),
    safeGetDocs(db.collection("driver_daily_assessments").where("serviceDate", "==", todayKey).limit(250)),
    safeGetDocs(db.collection("chatbot_sessions").orderBy("createdAt", "desc").limit(MAX_SESSIONS)),
  ]);
  return { orders, customers, drivers, assessments, sessions };
}

function detectIntent(question) {
  const q = normalizeText(question);
  for (const intent of CHATBOT_TRAINING.intents) {
    const hasRequired = (intent.required || []).every((group) => hasAny(q, group));
    const hasPhrase = hasAny(q, intent.phrases || []);
    if (hasRequired || hasPhrase) return intent.id;
  }
  return "overview";
}

function answerGreeting(context, todayKey) {
  const todayStats = statusStats((context.orders || []).filter((order) => orderServiceDate(order) === todayKey));
  return [
    "สวัสดีครับ ผมช่วยดูข้อมูลส่งของของ Hillkoff ให้ได้ครับ",
    `วันนี้มีออเดอร์ ${todayStats.total} งาน สำเร็จ ${todayStats.done} งาน กำลังส่ง ${todayStats.shipping} งาน และมีปัญหา ${todayStats.problem} งาน`,
    "ถามต่อได้เลยครับ เช่น วันนี้มีคนส่งของกี่คน, งานไหนยังไม่เสร็จ, COD วันนี้เท่าไหร่ หรือโซนไหนงานเยอะ",
  ].join("\n");
}

function answerDeliveryDriversToday(context, todayKey) {
  const todayOrders = (context.orders || []).filter((order) => orderServiceDate(order) === todayKey);
  const assigned = todayOrders.filter(isAssignedToDriver);
  const byDriver = new Map();
  assigned.forEach((order) => {
    const name = orderDriverName(order, context.drivers) || "ไม่ระบุชื่อ";
    if (!byDriver.has(name)) byDriver.set(name, []);
    byDriver.get(name).push(order);
  });
  const lines = [
    `วันนี้มีคนส่งของ ${byDriver.size} คน จากออเดอร์ที่มีการรับ/มอบหมายงาน ${assigned.length} งาน`,
    "",
  ];
  if (!byDriver.size) {
    lines.push("ตอนนี้ยังไม่เห็นออเดอร์ที่มีคนส่งรับงานครับ");
    return lines.join("\n");
  }
  Array.from(byDriver.entries()).forEach(([name, orders], index) => {
    const done = orders.filter((order) => order.status === STATUS_DONE).length;
    lines.push(`${index + 1}. ${name}: ${orders.length} งาน | ส่งสำเร็จ ${done}`);
    orders.slice(0, 12).forEach((order) => lines.push(`   - ${order.id || "-"} | ${order.customerName || "-"} | ${order.status || "-"}`));
  });
  return lines.join("\n");
}

function answerOrders(question, context, todayKey) {
  const todayOnly = hasAny(question, ["วันนี้", "ประจำวัน", "today"]);
  const orders = todayOnly ? (context.orders || []).filter((order) => orderServiceDate(order) === todayKey) : (context.orders || []);
  const stats = statusStats(orders);
  if (hasAny(question, ["cod", "เงิน", "ยอดเงิน", "เก็บเงิน"])) {
    return [`สรุป COD${todayOnly ? "วันนี้" : "ล่าสุด"}`, `- COD รวม: ฿${money(stats.cod)}`, `- COD งานส่งสำเร็จ: ฿${money(stats.codDone)}`, `- จำนวนงาน: ${stats.total} งาน`].join("\n");
  }
  if (hasAny(question, ["โซน", "พื้นที่", "เขต", "งานเยอะ"])) {
    const zones = topEntries(stats.zones).map(([zone, count]) => `- ${zone}: ${count} งาน`).join("\n");
    return [`โซนงาน${todayOnly ? "วันนี้" : "ล่าสุด"}`, zones || "- ยังไม่มีข้อมูลโซน", `รวม ${stats.total} งาน`].join("\n\n");
  }
  return [
    `สรุปออเดอร์${todayOnly ? `วันนี้ (${todayKey})` : "ล่าสุด"}`,
    `- งานทั้งหมด: ${stats.total}`,
    `- รอคนขับรับ: ${stats.waiting}`,
    `- กำลังส่ง: ${stats.shipping}`,
    `- ส่งสำเร็จ: ${stats.done}`,
    `- ติดปัญหา: ${stats.problem}`,
    `- ยกเลิก: ${stats.canceled}`,
    `- COD รวม: ฿${money(stats.cod)}`,
  ].join("\n");
}

function answerFollowUp(context, todayKey) {
  const todayOrders = (context.orders || []).filter((order) => orderServiceDate(order) === todayKey);
  const problem = todayOrders.filter((order) => order.status === STATUS_PROBLEM || order.complaint).slice(0, 8);
  const waiting = todayOrders.filter((order) => order.status === STATUS_WAITING).slice(0, 8);
  const shipping = todayOrders.filter((order) => STATUS_SHIPPING.includes(order.status)).slice(0, 8);
  const lines = ["ได้ครับ งานที่ควรตามก่อนเรียงแบบนี้ครับ", ""];
  let n = 1;
  if (problem.length) {
    lines.push(`${n}. งานติดปัญหา/ร้องเรียน`);
    lines.push(...problem.map((order) => formatOrderLine(order, context.drivers)));
    lines.push("");
    n += 1;
  }
  if (waiting.length) {
    lines.push(`${n}. งานรอคนขับรับ`);
    lines.push(...waiting.map((order) => formatOrderLine(order, context.drivers)));
    lines.push("");
    n += 1;
  }
  if (shipping.length) {
    lines.push(`${n}. งานกำลังส่งที่ควรเช็คความคืบหน้า`);
    lines.push(...shipping.map((order) => formatOrderLine(order, context.drivers)));
  }
  if (n === 1) lines.push("ตอนนี้ยังไม่เห็นงานที่ต้องรีบตามเป็นพิเศษครับ");
  return lines.join("\n");
}

function answerAssessments(context, todayKey) {
  const drivers = (context.drivers || []).filter((u) => String(u.role || "") === "driver");
  const doneIds = new Set((context.assessments || []).map((a) => String(a.driverId || a.id || "").split("_")[0]));
  const done = drivers.filter((d) => doneIds.has(String(d.driverId || d.id || d.phone || "")));
  const missing = drivers.filter((d) => !doneIds.has(String(d.driverId || d.id || d.phone || "")));
  return [
    `รายงานตรวจรถประจำวันที่ ${todayKey}`,
    `- คนขับทั้งหมด: ${drivers.length} คน`,
    `- ทำแบบประเมินแล้ว: ${done.length} คน`,
    `- ยังไม่ได้ทำ: ${missing.length} คน`,
    "",
    missing.length ? `รายชื่อที่ยังไม่ได้ทำ:\n${missing.slice(0, 20).map((d) => `- ${d.name || d.firstName || d.phone || d.id}`).join("\n")}` : "ครบทุกคนแล้วครับ",
  ].join("\n");
}

function answerCustomers(question, context) {
  const words = normalizeText(question).split(" ").filter((w) => w.length >= 2 && !["ลูกค้า", "ร้าน", "ค้นหา"].includes(w));
  const matches = (context.customers || []).filter((c) => {
    const haystack = normalizeText(`${c.name || ""} ${c.contact || ""} ${c.phone || ""} ${c.zone || ""} ${c.address || ""}`);
    return words.some((w) => haystack.includes(w));
  }).slice(0, 8);
  if (!matches.length) return `มีข้อมูลลูกค้าล่าสุด ${context.customers.length} รายการครับ พิมพ์ชื่อร้าน เบอร์โทร หรือโซนบางส่วนมาได้เลย`;
  return [`พบลูกค้าที่ใกล้เคียง ${matches.length} รายการ`, ...matches.map((c) => `- ${c.name || c.id} | ${c.phone || "-"} | ${c.zone || "-"} | ${c.address || "-"}`)].join("\n");
}

function answerTraining(question) {
  const q = normalizeText(question);
  const match = CHATBOT_TRAINING.knowledge.find((item) => hasAny(q, [item.title, ...(item.keywords || [])]));
  if (!match) return null;
  return match.answer;
}

function buildAnswer(question, todayKey, context) {
  const intent = detectIntent(question);
  if (intent === "greeting") return answerGreeting(context, todayKey);
  if (intent === "deliveryDriversToday") return answerDeliveryDriversToday(context, todayKey);
  if (intent === "followUp") return answerFollowUp(context, todayKey);
  if (intent === "assessments") return answerAssessments(context, todayKey);
  if (intent === "customers") return answerCustomers(question, context);
  if (intent === "orders") return answerOrders(question, context, todayKey);

  const trained = answerTraining(question);
  if (trained) return trained;
  const todayStats = statusStats((context.orders || []).filter((order) => orderServiceDate(order) === todayKey));
  return [
    CHATBOT_TRAINING.persona.fallback,
    "",
    `ภาพรวมวันนี้: ออเดอร์ ${todayStats.total} งาน | กำลังส่ง ${todayStats.shipping} | สำเร็จ ${todayStats.done} | ปัญหา ${todayStats.problem}`,
    "ลองถามแบบนี้ได้ครับ: วันนี้มีคนส่งของกี่คน, COD วันนี้เท่าไหร่, งานไหนควรตามก่อน, โซนไหนงานเยอะ",
  ].join("\n");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const question = String(payload?.question || "").trim();
  if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

  const auth = await verifySales(payload);
  if (!auth.ok) return Response.json({ ok: false, error: auth.error }, { status: auth.status });

  const todayKey = toServiceDateKeyBangkok();
  const context = await loadContext(auth.db, todayKey);
  const answer = buildAnswer(question, todayKey, context);

  try {
    await auth.db.collection("chatbot_sessions").add({
      phoneDigits: auth.phoneDigits,
      question,
      answer,
      source: "code_trained_bot",
      createdAt: new Date().toISOString(),
    });
  } catch {}

  return Response.json({
    ok: true,
    data: {
      answer,
      source: "code_trained_bot",
      counts: {
        orders: context.orders.length,
        customers: context.customers.length,
        users: context.drivers.length,
        assessments: context.assessments.length,
        sessions: context.sessions.length,
      },
    },
  });
}

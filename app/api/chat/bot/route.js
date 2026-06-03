import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { CHATBOT_SEED_KNOWLEDGE, CHATBOT_SYNONYMS } from "../../../../lib/chatbotKnowledge";

export const runtime = "nodejs";

const MAX_ORDERS = 400;
const MAX_CUSTOMERS = 250;
const MAX_KNOWLEDGE = 80;
const MAX_SESSIONS = 60;

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

function levenshtein(a, b) {
  const left = compactText(a);
  const right = compactText(b);
  if (!left || !right) return 999;
  if (left.includes(right) || right.includes(left)) return 0;
  const dp = Array.from({ length: left.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[left.length][right.length];
}

function fuzzyIncludes(question, words) {
  const q = normalizeText(question);
  const compact = compactText(q);
  return (words || []).some((word) => {
    const w = normalizeText(word);
    if (!w) return false;
    if (q.includes(w) || compact.includes(compactText(w))) return true;
    if (compactText(w).length < 4) return false;
    return levenshtein(compact, w) <= Math.max(1, Math.floor(compactText(w).length * 0.28));
  });
}

function hasIntent(question, key) {
  return fuzzyIncludes(question, CHATBOT_SYNONYMS[key] || []);
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function orderServiceDate(order) {
  return String(order.serviceDate || "").slice(0, 10);
}

function statusStats(orders) {
  const stats = { total: orders.length, waiting: 0, shipping: 0, done: 0, problem: 0, canceled: 0, cod: 0, codDone: 0, zones: {}, statuses: {} };
  for (const order of orders) {
    const status = String(order.status || "ไม่ระบุ");
    const zone = String(order.zone || order.area || "ไม่ระบุพื้นที่");
    const cod = Number(order.cod || order.codAmount || 0);
    stats.cod += cod;
    stats.zones[zone] = (stats.zones[zone] || 0) + 1;
    stats.statuses[status] = (stats.statuses[status] || 0) + 1;
    if (status === "รอคนขับรับ") stats.waiting += 1;
    else if (status === "กำลังส่ง" || status === "กำลังจัดส่ง") stats.shipping += 1;
    else if (status === "ส่งสำเร็จ") {
      stats.done += 1;
      stats.codDone += cod;
    } else if (status === "ติดปัญหา" || order.complaint) stats.problem += 1;
    else if (status === "ยกเลิก") stats.canceled += 1;
  }
  return stats;
}

function topEntries(record, limit = 6) {
  return Object.entries(record || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, limit);
}

function formatOrderLine(order) {
  const customer = order.customerName || order.customer || "ไม่ระบุลูกค้า";
  const zone = order.zone || order.area || "-";
  const driver = order.driverName || order.driverId || "ยังไม่ระบุคนขับ";
  return `- ${order.id || "-"} | ${customer} | ${zone} | ${order.status || "-"} | ${driver} | COD ฿${money(order.cod || 0)}`;
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
  const [orders, customers, drivers, locations, assessments, knowledge, sessions] = await Promise.all([
    safeGetDocs(db.collection("orders").orderBy("updatedAt", "desc").limit(MAX_ORDERS)),
    safeGetDocs(db.collection("customers").orderBy("updatedAt", "desc").limit(MAX_CUSTOMERS)),
    safeGetDocs(db.collection("users_by_phone").limit(250)),
    safeGetDocs(db.collection("driver_locations").limit(120)),
    safeGetDocs(db.collection("driver_daily_assessments").where("serviceDate", "==", todayKey).limit(250)),
    safeGetDocs(db.collection("chatbot_knowledge").orderBy("updatedAt", "desc").limit(MAX_KNOWLEDGE)),
    safeGetDocs(db.collection("chatbot_sessions").orderBy("createdAt", "desc").limit(MAX_SESSIONS)),
  ]);
  return { orders, customers, drivers, locations, assessments, knowledge, sessions };
}

function findKnowledgeAnswer(question, context) {
  const all = [
    ...CHATBOT_SEED_KNOWLEDGE,
    ...(context.knowledge || []).map((item) => ({
      id: item.id,
      title: item.title || "ความรู้ที่บันทึกไว้",
      answer: item.answer || item.content || "",
      keywords: item.keywords || [item.title || "", item.answer || ""],
    })),
  ];

  let best = null;
  for (const item of all) {
    const words = [item.title, ...(item.keywords || [])].filter(Boolean);
    const score = words.reduce((sum, word) => sum + (fuzzyIncludes(question, [word]) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { score, item };
  }
  if (!best?.item?.answer) return null;
  return `ข้อมูลจากชุดความรู้: ${best.item.title}\n\n${best.item.answer}`;
}

function findLearnedSessionAnswer(question, context) {
  const qWords = new Set(normalizeText(question).split(" ").filter((w) => w.length >= 3));
  let best = null;
  for (const session of context.sessions || []) {
    const pastQuestion = String(session.question || "");
    const answer = String(session.answer || "");
    if (!pastQuestion || !answer) continue;
    const words = normalizeText(pastQuestion).split(" ").filter((w) => w.length >= 3);
    const overlap = words.reduce((sum, word) => sum + (qWords.has(word) ? 1 : 0), 0);
    const fuzzy = fuzzyIncludes(question, [pastQuestion]) ? 2 : 0;
    const score = overlap + fuzzy;
    if (score > 0 && (!best || score > best.score)) best = { score, answer };
  }
  if (!best || best.score < 2) return null;
  return `ผมลองเทียบกับคำถามเดิมที่ใกล้เคียงแล้วนะครับ\n\n${best.answer}`;
}

function answerPriorityFollowUp(todayKey, context) {
  const orders = context.orders || [];
  const todayOrders = orders.filter((order) => orderServiceDate(order) === todayKey);
  const scope = todayOrders.length ? todayOrders : orders;
  const problem = scope.filter((o) => o.status === "ติดปัญหา" || o.complaint).slice(0, 8);
  const waiting = scope.filter((o) => o.status === "รอคนขับรับ").slice(0, 8);
  const shipping = scope.filter((o) => o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง").slice(0, 8);
  const lines = ["ได้ครับ ผมจัดลำดับงานที่ควรตามก่อนให้แบบเร็ว ๆ:", ""];
  let index = 1;
  if (problem.length) {
    lines.push(`${index}. งานติดปัญหา/มีร้องเรียน`);
    lines.push(...problem.map(formatOrderLine));
    lines.push("");
    index += 1;
  }
  if (waiting.length) {
    lines.push(`${index}. งานที่ยังรอคนขับรับ`);
    lines.push(...waiting.map(formatOrderLine));
    lines.push("");
    index += 1;
  }
  if (shipping.length) {
    lines.push(`${index}. งานที่กำลังส่ง ควรเช็คความคืบหน้า`);
    lines.push(...shipping.map(formatOrderLine));
    lines.push("");
  }
  if (!problem.length && !waiting.length && !shipping.length) {
    lines.push("ตอนนี้ยังไม่เห็นงานที่ต้องรีบตามเป็นพิเศษครับ ภาพรวมดูนิ่งดี");
  } else {
    lines.push("ถ้าจะเริ่ม ผมแนะนำตามงานติดปัญหาก่อน แล้วค่อยไล่งานรอรับครับ");
  }
  return lines.join("\n");
}

function answerAssessments(todayKey, context) {
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
    missing.length
      ? `รายชื่อที่ยังไม่ได้ทำ:\n${missing.slice(0, 20).map((d) => `- ${d.name || d.firstName || d.phone || d.id}`).join("\n")}`
      : "ครบทุกคนแล้วครับ",
  ].join("\n");
}

function answerOrders(question, todayKey, context) {
  const orders = context.orders || [];
  const todayOrders = orders.filter((order) => orderServiceDate(order) === todayKey);
  const scope = hasIntent(question, "today") ? todayOrders : orders;
  const stats = statusStats(scope);

  if (hasIntent(question, "zone")) {
    const lines = topEntries(stats.zones).map(([zone, count]) => `- ${zone}: ${count} งาน`).join("\n");
    return [`สรุปโซนงาน${hasIntent(question, "today") ? "วันนี้" : "ล่าสุด"}`, lines || "- ยังไม่มีข้อมูลโซน", `รวม ${stats.total} งาน`].join("\n\n");
  }

  if (hasIntent(question, "cod")) {
    return [`สรุป COD${hasIntent(question, "today") ? "วันนี้" : "ล่าสุด"}`, `- COD รวม: ฿${money(stats.cod)}`, `- COD งานส่งสำเร็จ: ฿${money(stats.codDone)}`, `- จำนวนงาน: ${stats.total} งาน`].join("\n");
  }

  const statusAsked = hasIntent(question, "status");
  const recentProblem = scope.filter((o) => o.status === "ติดปัญหา" || o.complaint).slice(0, 8);
  const recentWaiting = scope.filter((o) => o.status === "รอคนขับรับ").slice(0, 8);
  const extraLines = statusAsked
    ? [
        "",
        recentWaiting.length ? `งานรอรับตัวอย่าง:\n${recentWaiting.map(formatOrderLine).join("\n")}` : "",
        recentProblem.length ? `งานมีปัญหาตัวอย่าง:\n${recentProblem.map(formatOrderLine).join("\n")}` : "",
      ].filter(Boolean)
    : [];

  return [
    `สรุปออเดอร์${hasIntent(question, "today") ? `วันนี้ (${todayKey})` : "ล่าสุด"}`,
    `- งานทั้งหมด: ${stats.total}`,
    `- รอคนขับรับ: ${stats.waiting}`,
    `- กำลังส่ง: ${stats.shipping}`,
    `- ส่งสำเร็จ: ${stats.done}`,
    `- ติดปัญหา: ${stats.problem}`,
    `- ยกเลิก: ${stats.canceled}`,
    `- COD รวม: ฿${money(stats.cod)}`,
    ...extraLines,
  ].join("\n");
}

function answerCustomers(question, context) {
  const customers = context.customers || [];
  const q = normalizeText(question);
  const matches = customers.filter((c) => {
    const haystack = normalizeText(`${c.name || ""} ${c.contact || ""} ${c.phone || ""} ${c.zone || ""} ${c.address || ""}`);
    return q.split(" ").filter((w) => w.length >= 2).some((w) => haystack.includes(w));
  }).slice(0, 8);
  if (!matches.length) return `มีข้อมูลลูกค้าล่าสุด ${customers.length} รายการ ถ้าต้องการค้นหาให้พิมพ์ชื่อร้านหรือเบอร์โทรบางส่วนได้ครับ`;
  return [
    `พบลูกค้าที่ใกล้เคียง ${matches.length} รายการ`,
    ...matches.map((c) => `- ${c.name || c.id} | ${c.phone || "-"} | ${c.zone || "-"} | ${c.address || "-"}`),
  ].join("\n");
}

function answerDrivers(context) {
  const drivers = (context.drivers || []).filter((u) => String(u.role || "") === "driver");
  const locations = context.locations || [];
  return [
    `ข้อมูลคนขับในระบบ`,
    `- คนขับทั้งหมด: ${drivers.length} คน`,
    `- มีข้อมูลตำแหน่ง/เช็คอินล่าสุด: ${locations.length} รายการ`,
    "",
    drivers.slice(0, 20).map((d) => `- ${d.name || d.firstName || d.phone || d.id} | ${d.phone || "-"} | ${d.driverId || d.id || "-"}`).join("\n") || "ยังไม่มีข้อมูลคนขับ",
  ].join("\n");
}

function buildAnswer(question, todayKey, context) {
  if (fuzzyIncludes(question, ["ติดตาม", "ควรติดตาม", "ตามงาน", "เร่งด่วน", "แนะนำ", "งานไหนก่อน"])) return answerPriorityFollowUp(todayKey, context);
  if (hasIntent(question, "assessments")) return answerAssessments(todayKey, context);
  if (hasIntent(question, "orders") || hasIntent(question, "status") || hasIntent(question, "zone") || hasIntent(question, "cod")) return answerOrders(question, todayKey, context);
  if (hasIntent(question, "customers")) return answerCustomers(question, context);
  if (hasIntent(question, "drivers")) return answerDrivers(context);

  const knowledge = findKnowledgeAnswer(question, context);
  if (knowledge) return knowledge;

  const learned = findLearnedSessionAnswer(question, context);
  if (learned) return learned;

  const todayStats = statusStats((context.orders || []).filter((order) => orderServiceDate(order) === todayKey));
  return [
    "ได้ครับ ผมช่วยดูข้อมูลในระบบ Hillkoff ให้ได้จากออเดอร์ ลูกค้า คนขับ ตรวจรถ และประวัติคำถามเดิมครับ",
    "",
    `วันนี้มีออเดอร์ ${todayStats.total} งาน, รอรับ ${todayStats.waiting}, กำลังส่ง ${todayStats.shipping}, สำเร็จ ${todayStats.done}, ปัญหา ${todayStats.problem}`,
    "",
    "ถามต่อได้เลย เช่น งานไหนควรตามก่อน, วันนี้ COD เท่าไหร่, โซนไหนงานเยอะ, ใครยังไม่ตรวจรถ, หรือลูกค้าร้านนี้อยู่ตรงไหน",
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
      source: "firestore_rule_bot",
      createdAt: new Date().toISOString(),
    });
  } catch {}

  return Response.json({
    ok: true,
    data: {
      answer,
      source: "firestore_rule_bot",
      counts: {
        orders: context.orders.length,
        customers: context.customers.length,
        users: context.drivers.length,
        assessments: context.assessments.length,
        knowledge: CHATBOT_SEED_KNOWLEDGE.length + context.knowledge.length,
        sessions: context.sessions.length,
      },
    },
  });
}

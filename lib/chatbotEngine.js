import { CHATBOT_TRAINING } from "./chatbotTraining.js";

export const STATUS_DONE = "ส่งสำเร็จ";
export const STATUS_WAITING = "รอคนขับรับ";
export const STATUS_SHIPPING = ["กำลังส่ง", "กำลังจัดส่ง"];
export const STATUS_PROBLEM = "ติดปัญหา";

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

export function hasAny(text, words = []) {
  const normalized = normalizeText(text);
  const compact = compactText(text);
  return words.some((word) => {
    const w = normalizeText(word);
    if (!w) return false;
    return normalized.includes(w) || compact.includes(compactText(w));
  });
}

export function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

export function orderServiceDate(order) {
  return String(order?.serviceDate || "").slice(0, 10);
}

export function orderDriverName(order, drivers = []) {
  const driver = drivers.find((d) => {
    const ids = [d.driverId, d.id, d.phone].filter(Boolean).map(String);
    return ids.includes(String(order?.driverId || ""));
  });
  return order?.driverName || driver?.name || driver?.firstName || order?.driverId || "";
}

export function isAssignedToDriver(order) {
  return Boolean(order?.driverId || order?.driverName);
}

export function statusStats(orders = []) {
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

export function formatOrderLine(order, drivers = []) {
  const customer = order.customerName || order.customer || "ไม่ระบุลูกค้า";
  const zone = order.zone || order.area || "-";
  const driver = orderDriverName(order, drivers) || "ยังไม่ระบุคนส่ง";
  const deliveredAt = order.deliveredAt ? ` | เสร็จ ${order.deliveredAt}` : "";
  return `- ${order.id || "-"} | ${customer} | ${zone} | ${order.status || "-"} | คนส่ง: ${driver} | COD ฿${money(order.cod || 0)}${deliveredAt}`;
}

function topEntries(record, limit = 6) {
  return Object.entries(record || {}).sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0)).slice(0, limit);
}

function scoreIntent(question, intent) {
  const q = normalizeText(question);
  let score = 0;
  for (const phrase of intent.phrases || []) {
    if (hasAny(q, [phrase])) score += 10;
  }
  for (const group of intent.required || []) {
    if (hasAny(q, group)) score += 6;
    else score -= 6;
  }
  if (score > 0) score += Number(intent.priority || 0) / 100;
  return score;
}

export function detectIntent(question) {
  let best = { id: "unknown", score: 0 };
  for (const intent of CHATBOT_TRAINING.intents) {
    const score = scoreIntent(question, intent);
    if (score > best.score) best = { id: intent.id, score };
  }
  return best.score >= 6 ? best.id : "unknown";
}

function todayOrders(context, todayKey) {
  return (context.orders || []).filter((order) => orderServiceDate(order) === todayKey);
}

function scopeOrders(question, context, todayKey) {
  const todayOnly = hasAny(question, ["วันนี้", "ประจำวัน", "today"]);
  return todayOnly ? todayOrders(context, todayKey) : (context.orders || []);
}

function answerBasic(id) {
  const item = CHATBOT_TRAINING.conversationBasics.find((entry) => entry.id === id);
  return item?.response || null;
}

function answerGreeting(context, todayKey) {
  const todayStats = statusStats(todayOrders(context, todayKey));
  return [
    answerBasic("greeting"),
    `วันนี้มีออเดอร์ ${todayStats.total} งาน สำเร็จ ${todayStats.done} งาน กำลังส่ง ${todayStats.shipping} งาน และมีปัญหา ${todayStats.problem} งาน`,
    "ถามต่อได้เลยครับ เช่น วันนี้มีคนส่งของกี่คน, งานไหนยังไม่เสร็จ, COD วันนี้เท่าไหร่ หรือโซนไหนงานเยอะ",
  ].join("\n");
}

function answerOverview(context, todayKey) {
  const orders = todayOrders(context, todayKey);
  const stats = statusStats(orders);
  const drivers = new Set(orders.filter(isAssignedToDriver).map((order) => orderDriverName(order, context.drivers) || order.driverId || "ไม่ระบุ"));
  return [
    `สรุปงานส่งวันนี้ครับ (${todayKey})`,
    "",
    `- ออเดอร์ทั้งหมด: ${stats.total} งาน`,
    `- รอคนขับรับ: ${stats.waiting} งาน`,
    `- กำลังส่ง: ${stats.shipping} งาน`,
    `- ส่งสำเร็จ: ${stats.done} งาน`,
    `- ติดปัญหา/ร้องเรียน: ${stats.problem} งาน`,
    `- ยกเลิก: ${stats.canceled} งาน`,
    `- คนส่งของวันนี้: ${drivers.size} คน`,
    `- COD รวม: ฿${money(stats.cod)}`,
    `- COD งานสำเร็จ: ฿${money(stats.codDone)}`,
    "",
    stats.problem || stats.waiting ? `งานที่ควรตามก่อนคือ งานติดปัญหา ${stats.problem} งาน และงานรอคนขับรับ ${stats.waiting} งานครับ` : "ภาพรวมตอนนี้ยังไม่เห็นจุดน่าห่วงเป็นพิเศษครับ",
  ].join("\n");
}

function answerDeliveryDriversToday(context, todayKey) {
  const assigned = todayOrders(context, todayKey).filter(isAssignedToDriver);
  const byDriver = new Map();
  assigned.forEach((order) => {
    const name = orderDriverName(order, context.drivers) || "ไม่ระบุชื่อ";
    if (!byDriver.has(name)) byDriver.set(name, []);
    byDriver.get(name).push(order);
  });
  const lines = [`วันนี้มีคนส่งของ ${byDriver.size} คน จากออเดอร์ที่รับ/มอบหมายงานแล้ว ${assigned.length} งาน`, ""];
  if (!byDriver.size) return `${lines.join("\n")}ตอนนี้ยังไม่เห็นออเดอร์ที่มีคนส่งรับงานครับ`;
  Array.from(byDriver.entries()).forEach(([name, orders], index) => {
    const done = orders.filter((order) => order.status === STATUS_DONE).length;
    const shipping = orders.filter((order) => STATUS_SHIPPING.includes(order.status)).length;
    const problem = orders.filter((order) => order.status === STATUS_PROBLEM || order.complaint).length;
    lines.push(`${index + 1}. ${name}: ${orders.length} งาน | สำเร็จ ${done} | กำลังส่ง ${shipping} | ปัญหา ${problem}`);
    orders.slice(0, 10).forEach((order) => lines.push(`   - ${order.id || "-"} | ${order.customerName || "-"} | ${order.status || "-"}`));
  });
  lines.push("", CHATBOT_TRAINING.responseTemplates.closingQuestions.drivers);
  return lines.join("\n");
}

function findDriverNameInQuestion(question, context) {
  const q = compactText(question);
  const names = new Set();
  (context.drivers || []).forEach((driver) => {
    [driver.name, driver.firstName, driver.driverName].filter(Boolean).forEach((name) => names.add(String(name)));
  });
  (context.orders || []).forEach((order) => {
    if (order.driverName) names.add(String(order.driverName));
  });
  return Array.from(names).find((name) => compactText(name).length >= 2 && q.includes(compactText(name))) || "";
}

function answerDriverSpecificOrders(question, context, todayKey) {
  const driverName = findDriverNameInQuestion(question, context);
  if (!driverName) return "ต้องการดูงานของคนขับคนไหนครับ พิมพ์ชื่อคนขับมาได้เลย เช่น งานของสมชาย";
  const orders = todayOrders(context, todayKey).filter((order) => compactText(orderDriverName(order, context.drivers)).includes(compactText(driverName)));
  if (!orders.length) return `วันนี้ยังไม่พบงานของ ${driverName} ครับ`;
  const done = orders.filter((order) => order.status === STATUS_DONE);
  const active = orders.filter((order) => STATUS_SHIPPING.includes(order.status));
  const problem = orders.filter((order) => order.status === STATUS_PROBLEM || order.complaint);
  return [
    `งานของ ${driverName} วันนี้มี ${orders.length} งานครับ`,
    `- ส่งสำเร็จ: ${done.length}`,
    `- กำลังส่ง: ${active.length}`,
    `- ติดปัญหา/ร้องเรียน: ${problem.length}`,
    "",
    ...orders.map((order) => formatOrderLine(order, context.drivers)),
  ].join("\n");
}

function answerOrders(question, context, todayKey) {
  const orders = scopeOrders(question, context, todayKey);
  const stats = statusStats(orders);
  return [
    `สรุปออเดอร์${hasAny(question, ["วันนี้", "ประจำวัน", "today"]) ? `วันนี้ (${todayKey})` : "ล่าสุด"}`,
    `- งานทั้งหมด: ${stats.total}`,
    `- รอคนขับรับ: ${stats.waiting}`,
    `- กำลังส่ง: ${stats.shipping}`,
    `- ส่งสำเร็จ: ${stats.done}`,
    `- ติดปัญหา/ร้องเรียน: ${stats.problem}`,
    `- ยกเลิก: ${stats.canceled}`,
    `- COD รวม: ฿${money(stats.cod)}`,
    "",
    CHATBOT_TRAINING.responseTemplates.closingQuestions.orders,
  ].join("\n");
}

function answerCod(question, context, todayKey) {
  const orders = scopeOrders(question, context, todayKey);
  const stats = statusStats(orders);
  const byDriver = {};
  orders.filter(isAssignedToDriver).forEach((order) => {
    const name = orderDriverName(order, context.drivers) || "ไม่ระบุชื่อ";
    byDriver[name] = (byDriver[name] || 0) + Number(order.cod || 0);
  });
  const driverLines = topEntries(byDriver, 8).map(([name, cod]) => `- ${name}: ฿${money(cod)}`);
  return [
    `สรุป COD${hasAny(question, ["วันนี้"]) ? "วันนี้" : "ล่าสุด"}ครับ`,
    "",
    `- COD รวมทั้งหมด: ฿${money(stats.cod)}`,
    `- COD จากงานส่งสำเร็จ: ฿${money(stats.codDone)}`,
    `- COD ที่ยังไม่ปิดงาน: ฿${money(stats.cod - stats.codDone)}`,
    "",
    driverLines.length ? "แยกตามคนส่ง:" : "",
    ...driverLines,
  ].filter(Boolean).join("\n");
}

function answerZone(question, context, todayKey) {
  const stats = statusStats(scopeOrders(question, context, todayKey));
  const lines = topEntries(stats.zones).map(([zone, count], index) => `${index + 1}. ${zone}: ${count} งาน`);
  return [
    `โซนที่มีงานเยอะ${hasAny(question, ["วันนี้"]) ? "วันนี้" : "ล่าสุด"}ครับ`,
    "",
    lines.join("\n") || CHATBOT_TRAINING.responseTemplates.noData,
  ].join("\n");
}

function answerFilteredOrders(title, orders, context) {
  if (!orders.length) return `${title}\n\n${CHATBOT_TRAINING.responseTemplates.noData}`;
  return [title, "", ...orders.slice(0, 12).map((order) => formatOrderLine(order, context.drivers))].join("\n");
}

function answerProblemOrders(context, todayKey) {
  const orders = todayOrders(context, todayKey).filter((order) => order.status === STATUS_PROBLEM || order.complaint);
  const lines = orders.map((order) => {
    const complaint = order.complaint ? `\n  ปัญหา: ${order.complaint}` : "";
    return `${formatOrderLine(order, context.drivers)}${complaint}`;
  });
  return orders.length ? [`วันนี้มีงานติดปัญหา/ร้องเรียน ${orders.length} งานครับ`, "", ...lines, "", "แนะนำให้ติดต่อคนส่งก่อน แล้วค่อยโทรหาลูกค้าหากต้องยืนยันข้อมูลครับ"].join("\n") : "วันนี้ยังไม่พบงานติดปัญหาหรือร้องเรียนครับ";
}

function answerFollowUp(context, todayKey) {
  const orders = todayOrders(context, todayKey);
  const problem = orders.filter((order) => order.status === STATUS_PROBLEM || order.complaint);
  const waiting = orders.filter((order) => order.status === STATUS_WAITING);
  const active = orders.filter((order) => STATUS_SHIPPING.includes(order.status));
  const highCod = orders.filter((order) => order.status !== STATUS_DONE && Number(order.cod || 0) > 0).sort((a, b) => Number(b.cod || 0) - Number(a.cod || 0)).slice(0, 5);
  const lines = ["ผมแนะนำให้ตามงานตามลำดับนี้ครับ", ""];
  let n = 1;
  if (problem.length) lines.push(`${n++}. งานติดปัญหา/ร้องเรียน\n${problem.slice(0, 8).map((order) => formatOrderLine(order, context.drivers)).join("\n")}`, "");
  if (waiting.length) lines.push(`${n++}. งานรอคนขับรับ\n${waiting.slice(0, 8).map((order) => formatOrderLine(order, context.drivers)).join("\n")}`, "");
  if (active.length) lines.push(`${n++}. งานกำลังส่งที่ยังไม่ปิด\n${active.slice(0, 8).map((order) => formatOrderLine(order, context.drivers)).join("\n")}`, "");
  if (highCod.length) lines.push(`${n++}. งาน COD สูงที่ยังไม่สำเร็จ\n${highCod.map((order) => formatOrderLine(order, context.drivers)).join("\n")}`);
  if (n === 1) lines.push("ตอนนี้ยังไม่เห็นงานที่ต้องรีบตามเป็นพิเศษครับ");
  return lines.join("\n");
}

function answerCustomers(question, context) {
  const ignored = new Set(["ลูกค้า", "ร้าน", "ค้นหา", "หา", "เบอร์", "ที่อยู่", "ติดต่อ"]);
  const words = normalizeText(question).split(" ").filter((w) => w.length >= 2 && !ignored.has(w));
  const matches = (context.customers || []).filter((customer) => {
    const haystack = normalizeText(`${customer.name || ""} ${customer.contact || ""} ${customer.phone || ""} ${customer.zone || ""} ${customer.address || ""}`);
    return words.some((word) => haystack.includes(word));
  }).slice(0, 8);
  if (!matches.length) return `มีข้อมูลลูกค้าล่าสุด ${context.customers?.length || 0} รายการครับ พิมพ์ชื่อร้าน เบอร์โทร หรือโซนบางส่วนมาได้เลย`;
  return [`พบลูกค้าที่ใกล้เคียง ${matches.length} รายการครับ`, "", ...matches.map((c, i) => `${i + 1}. ${c.name || c.id}\n   เบอร์: ${c.phone || "-"}\n   โซน: ${c.zone || "-"}\n   ที่อยู่: ${c.address || "-"}`), "", CHATBOT_TRAINING.responseTemplates.closingQuestions.customers].join("\n");
}

function answerAssessments(context, todayKey) {
  const drivers = (context.drivers || []).filter((u) => String(u.role || "") === "driver");
  const doneIds = new Set((context.assessments || []).map((a) => String(a.driverId || a.id || "").split("_")[0]));
  const done = drivers.filter((d) => doneIds.has(String(d.driverId || d.id || d.phone || "")));
  const missing = drivers.filter((d) => !doneIds.has(String(d.driverId || d.id || d.phone || "")));
  return [
    `รายงานตรวจรถประจำวันที่ ${todayKey}`,
    "",
    `- คนขับทั้งหมด: ${drivers.length} คน`,
    `- ทำแบบประเมินแล้ว: ${done.length} คน`,
    `- ยังไม่ได้ทำ: ${missing.length} คน`,
    "",
    missing.length ? `ยังไม่ได้ทำ:\n${missing.slice(0, 20).map((d) => `- ${d.name || d.firstName || d.phone || d.id}`).join("\n")}` : "ครบทุกคนแล้วครับ",
  ].join("\n");
}

function answerReport() {
  return [
    "รายงานประจำวันควรมีข้อมูลหลักดังนี้ครับ",
    "",
    "- ออเดอร์ทั้งหมด",
    "- สถานะแต่ละประเภท",
    "- COD รวม และ COD งานสำเร็จ",
    "- งานแยกตามคนส่ง",
    "- งานติดปัญหา/ร้องเรียน",
    "- งานที่ยังไม่เสร็จ",
    "- เวลาเสร็จของงานที่ส่งสำเร็จ",
  ].join("\n");
}

export function buildAnswer(question, todayKey, context = {}) {
  const intent = detectIntent(question);
  if (intent === "greeting") return answerGreeting(context, todayKey);
  if (intent === "thanks") return answerBasic("thanks");
  if (intent === "help") return answerBasic("help");
  if (intent === "deliveryDriversToday") return answerDeliveryDriversToday(context, todayKey);
  if (intent === "driverSpecificOrders") return answerDriverSpecificOrders(question, context, todayKey);
  if (intent === "followUpSuggestion") return answerFollowUp(context, todayKey);
  if (intent === "problemOrders") return answerProblemOrders(context, todayKey);
  if (intent === "pendingOrders") return answerFilteredOrders("งานรอคนขับรับวันนี้ครับ", todayOrders(context, todayKey).filter((order) => order.status === STATUS_WAITING), context);
  if (intent === "inProgressOrders") return answerFilteredOrders("งานกำลังส่ง/ยังไม่ปิดวันนี้ครับ", todayOrders(context, todayKey).filter((order) => STATUS_SHIPPING.includes(order.status)), context);
  if (intent === "completedOrders") return answerFilteredOrders("งานส่งสำเร็จวันนี้ครับ", todayOrders(context, todayKey).filter((order) => order.status === STATUS_DONE), context);
  if (intent === "codToday") return answerCod(question, context, todayKey);
  if (intent === "zoneSummary") return answerZone(question, context, todayKey);
  if (intent === "customerSearch") return answerCustomers(question, context);
  if (intent === "driverAssessment") return answerAssessments(context, todayKey);
  if (intent === "overviewToday") return answerOverview(context, todayKey);
  if (intent === "report") return answerReport();

  return [
    CHATBOT_TRAINING.persona.fallback,
    "",
    answerOverview(context, todayKey),
    "",
    "ลองถามแบบนี้ได้ครับ: วันนี้มีคนส่งของกี่คน, COD วันนี้เท่าไหร่, งานไหนควรตามก่อน, โซนไหนงานเยอะ",
  ].join("\n");
}

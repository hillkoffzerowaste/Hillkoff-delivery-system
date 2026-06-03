import { buildAnswer, detectIntent } from "../lib/chatbotEngine.js";
import { CHATBOT_TRAINING } from "../lib/chatbotTraining.js";

const todayKey = "2026-06-03";
const context = {
  drivers: [
    { id: "D1", driverId: "D1", name: "สมชาย", role: "driver", phone: "0811111111" },
    { id: "D2", driverId: "D2", name: "วิชัย", role: "driver", phone: "0822222222" },
    { id: "D3", driverId: "D3", name: "นพดล", role: "driver", phone: "0833333333" },
  ],
  orders: [
    { id: "DO-001", serviceDate: todayKey, customerName: "ร้าน A", zone: "เมืองเชียงใหม่", driverId: "D1", driverName: "สมชาย", status: "ส่งสำเร็จ", cod: 1200, deliveredAt: "10:30" },
    { id: "DO-002", serviceDate: todayKey, customerName: "ร้าน B", zone: "แม่ริม", driverId: "D1", driverName: "สมชาย", status: "กำลังส่ง", cod: 800 },
    { id: "DO-003", serviceDate: todayKey, customerName: "ร้าน C", zone: "แม่ริม", driverId: "D2", driverName: "วิชัย", status: "ติดปัญหา", cod: 500, complaint: "ลูกค้าไม่อยู่" },
    { id: "DO-004", serviceDate: todayKey, customerName: "ร้าน D", zone: "หางดง", driverId: "", driverName: "", status: "รอคนขับรับ", cod: 3500 },
    { id: "DO-005", serviceDate: "2026-06-02", customerName: "ร้านเก่า", zone: "ลำพูน", driverId: "D3", driverName: "นพดล", status: "ส่งสำเร็จ", cod: 900 },
  ],
  customers: [
    { id: "C1", name: "ร้านกาแฟ A", phone: "053-111111", zone: "เมืองเชียงใหม่", address: "ถนนตัวอย่าง" },
  ],
  assessments: [{ driverId: "D1" }],
  sessions: [],
};

const cases = [
  { q: "สวัสดี", intent: "greeting", includes: ["สวัสดีครับ"] },
  { q: "วันนี้มีคนส่งของกี่คน", intent: "deliveryDriversToday", includes: ["วันนี้มีคนส่งของ 2 คน", "สมชาย", "วิชัย"] },
  { q: "งานของสมชายมีอะไรบ้าง", intent: "driverSpecificOrders", includes: ["งานของ สมชาย", "DO-001", "DO-002"] },
  { q: "งานไหนควรตามก่อน", intent: "followUpSuggestion", includes: ["งานติดปัญหา", "DO-003", "งานรอคนขับรับ"] },
  { q: "COD วันนี้เท่าไหร่", intent: "codToday", includes: ["COD รวม", "฿6,000"] },
  { q: "โซนไหนงานเยอะ", intent: "zoneSummary", includes: ["แม่ริม"] },
  { q: "ใครยังไม่ตรวจรถ", intent: "driverAssessment", includes: ["ยังไม่ได้ทำ", "วิชัย"] },
  { q: "ค้นหาร้านกาแฟ", intent: "customerSearch", includes: ["ร้านกาแฟ A"] },
];

let failed = 0;
for (const item of cases) {
  const intent = detectIntent(item.q);
  const answer = buildAnswer(item.q, todayKey, context);
  const okIntent = intent === item.intent;
  const missing = item.includes.filter((part) => !answer.includes(part));
  if (!okIntent || missing.length) {
    failed += 1;
    console.error(`FAIL: ${item.q}`);
    console.error(`  intent: expected ${item.intent}, got ${intent}`);
    if (missing.length) console.error(`  missing: ${missing.join(", ")}`);
    console.error(answer);
  }
}

const trainingIntents = new Set(CHATBOT_TRAINING.intents.map((intent) => intent.id));
for (const example of CHATBOT_TRAINING.trainingExamples || []) {
  if (!trainingIntents.has(example.intent)) {
    failed += 1;
    console.error(`FAIL: training example references missing intent ${example.intent}`);
  }
}

if (failed) {
  console.error(`chatbot self-test failed: ${failed}`);
  process.exit(1);
}

console.log("chatbot self-test passed");

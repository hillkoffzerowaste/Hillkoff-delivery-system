import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_CONTEXT_DAYS = 3;
const AGGREGATE_CACHE_TTL_MS = 2 * 60 * 1000;
const aggregateCache = globalThis.__hillkoffGeminiAggregateCache || (globalThis.__hillkoffGeminiAggregateCache = new Map());

function toServiceDateKeyBangkok(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function sse(writer, text) {
  writer.enqueue(`data: ${text}\n\n`);
}

function logGeminiAuth(label, data) {
  try {
    console.log(`[Gemini chat] ${label}`, data);
  } catch {}
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function emptyDailyStats(date) {
  return {
    date,
    totalOrders: 0,
    done: 0,
    waiting: 0,
    shipping: 0,
    problem: 0,
    canceled: 0,
    codTotal: 0,
    codDone: 0,
    areas: {},
    statuses: {},
  };
}

function addOrderToStats(stats, order) {
  const status = String(order.status || "ไม่ระบุ");
  const area = String(order.zone || order.area || "ไม่ระบุพื้นที่");
  const cod = Number(order.cod ?? order.codAmount ?? 0);

  stats.totalOrders += 1;
  stats.codTotal += cod;
  stats.areas[area] = (stats.areas[area] || 0) + 1;
  stats.statuses[status] = (stats.statuses[status] || 0) + 1;

  if (status === "ส่งสำเร็จ") {
    stats.done += 1;
    stats.codDone += cod;
    return;
  }
  if (status === "รอคนขับรับ") {
    stats.waiting += 1;
    return;
  }
  if (status === "กำลังส่ง" || status === "กำลังจัดส่ง") {
    stats.shipping += 1;
    return;
  }
  if (status === "ติดปัญหา") {
    stats.problem += 1;
    return;
  }
  if (status === "ยกเลิก") {
    stats.canceled += 1;
    return;
  }

  if (status === "ส่งสำเร็จ") {
    stats.done += 1;
    stats.codDone += cod;
  } else if (status === "รอคนขับรับ") {
    stats.waiting += 1;
  } else if (status === "กำลังส่ง" || status === "กำลังจัดส่ง") {
    stats.shipping += 1;
  } else if (status === "ติดปัญหา") {
    stats.problem += 1;
  } else if (status === "ยกเลิก") {
    stats.canceled += 1;
  }
}

function summarizeOrdersByDate(orders, dateKeys) {
  const byDate = Object.fromEntries(dateKeys.map((date) => [date, emptyDailyStats(date)]));

  const statusCounts = {};
  for (const order of orders) {
    const date = String(order.serviceDate || "ไม่ระบุวันที่");
    if (!byDate[date]) byDate[date] = emptyDailyStats(date);
    addOrderToStats(byDate[date], order);

    const status = String(order.status || "ไม่ระบุ");
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const dailyStats = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  return {
    total: orders.length,
    statusCounts,
    cod_total: orders.reduce((sum, o) => sum + Number(o.cod || 0), 0),
    dailyStats,
  };
}

function sanitizeCountRecord(record, limit = 20) {
  return Object.fromEntries(
    Object.entries(record || {})
      .slice(0, limit)
      .map(([key, value]) => [String(key).slice(0, 80), Number(value || 0)])
      .filter(([key, value]) => key && Number.isFinite(value))
  );
}

function sanitizeClientSummary(value, fallbackContextDays) {
  if (!value || typeof value !== "object") return null;

  const dailyStats = Array.isArray(value.dailyStats)
    ? value.dailyStats.slice(0, 14).map((day) => ({
        date: String(day?.date || ""),
        totalOrders: Number(day?.totalOrders || 0),
        done: Number(day?.done || 0),
        waiting: Number(day?.waiting || 0),
        shipping: Number(day?.shipping || 0),
        problem: Number(day?.problem || 0),
        canceled: Number(day?.canceled || 0),
        codTotal: Number(day?.codTotal || 0),
        codDone: Number(day?.codDone || 0),
        areas: sanitizeCountRecord(day?.areas),
        statuses: sanitizeCountRecord(day?.statuses),
      })).filter((day) => day.date)
    : [];

  if (!dailyStats.length) return null;

  const statusCounts = {};
  dailyStats.forEach((day) => {
    Object.entries(day.statuses || {}).forEach(([status, count]) => {
      statusCounts[status] = (statusCounts[status] || 0) + Number(count || 0);
    });
  });

  return {
    dateRange: {
      start: String(value?.dateRange?.start || dailyStats[dailyStats.length - 1]?.date || ""),
      end: String(value?.dateRange?.end || dailyStats[0]?.date || ""),
      timezone: "Asia/Bangkok",
      contextDays: Math.min(Number(value?.dateRange?.contextDays || fallbackContextDays || dailyStats.length), 14),
    },
    total: dailyStats.reduce((sum, day) => sum + Number(day.totalOrders || 0), 0),
    statusCounts,
    codTotal: dailyStats.reduce((sum, day) => sum + Number(day.codTotal || 0), 0),
    dailyStats,
    firestoreReads: 0,
    selectedFields: ["serviceDate", "status", "zone", "cod"],
    source: "client_summary",
  };
}

async function getFirestoreAggregateSummary(db, dateKeys, startKey, todayKey, contextDays) {
  const cacheKey = `${startKey}:${todayKey}:${contextDays}`;
  const cached = aggregateCache.get(cacheKey);
  if (cached && Date.now() - cached.at < AGGREGATE_CACHE_TTL_MS) {
    return { ...cached.summary, firestoreReads: 0, source: "server_cache" };
  }

  const ordersSnap = await db
    .collection("orders")
    .where("serviceDate", ">=", startKey)
    .where("serviceDate", "<=", todayKey)
    .select("serviceDate", "status", "zone", "area", "cod", "codAmount")
    .get();

  const orders = ordersSnap.docs.map((d) => d.data() || {});
  const aggregate = summarizeOrdersByDate(orders, dateKeys);
  const summary = {
    dateRange: { start: startKey, end: todayKey, timezone: "Asia/Bangkok", contextDays },
    total: aggregate.total,
    statusCounts: aggregate.statusCounts,
    codTotal: aggregate.cod_total,
    dailyStats: aggregate.dailyStats,
    firestoreReads: ordersSnap.size,
    selectedFields: ["serviceDate", "status", "zone", "area", "cod", "codAmount"],
    source: "firestore_query",
  };

  aggregateCache.set(cacheKey, { at: Date.now(), summary });
  return summary;
}

function isQuotaError(error) {
  const text = [
    error?.message,
    error?.status,
    error?.code,
    error?.details,
    JSON.stringify(error || {}),
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    text.includes("429") ||
    text.includes("quota") ||
    text.includes("resource_exhausted") ||
    text.includes("rate limit") ||
    text.includes("exceeded")
  );
}

function topEntries(record, limit = 5) {
  return Object.entries(record || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit);
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function buildBasicChatbotAnswer(question, summary) {
  const q = String(question || "").toLowerCase();
  const dailyStats = Array.isArray(summary?.dailyStats) ? summary.dailyStats : [];
  const today = dailyStats[0] || emptyDailyStats(summary?.dateRange?.end || "วันนี้");
  const monthStats = dailyStats;
  const monthTotal = monthStats.reduce((sum, day) => sum + Number(day.totalOrders || 0), 0);
  const monthDone = monthStats.reduce((sum, day) => sum + Number(day.done || 0), 0);
  const monthCod = monthStats.reduce((sum, day) => sum + Number(day.codTotal || 0), 0);
  const statusLines = Object.entries(today.statuses || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .map(([status, count]) => `- ${status}: ${count} งาน`)
    .join("\n");
  const areaLines = topEntries(today.areas, 5)
    .map(([area, count]) => `- ${area}: ${count} งาน`)
    .join("\n");

  if (q.includes("เดือน") || q.includes("รายเดือน") || q.includes("month")) {
    const bestDay = monthStats.slice().sort((a, b) => Number(b.totalOrders || 0) - Number(a.totalOrders || 0))[0];
    return [
      "🤖 โหมดแชทบอท: สรุปรายเดือนจากข้อมูลล่าสุดที่ระบบโหลดได้",
      "",
      `- งานรวม: ${monthTotal} งาน`,
      `- ส่งสำเร็จ: ${monthDone} งาน`,
      `- COD รวม: ฿${money(monthCod)}`,
      bestDay ? `- วันที่งานเยอะสุด: ${bestDay.date} (${bestDay.totalOrders} งาน)` : "- ยังไม่มีข้อมูลรายวัน",
      "",
      "หมายเหตุ: แชทบอทตอบจากสถิติรวม จึงยังวิเคราะห์เชิงลึกแบบ Gemini ไม่ได้ครับ"
    ].join("\n");
  }

  if (q.includes("โซน") || q.includes("พื้นที่") || q.includes("หนาแน่น")) {
    return [
      "🤖 โหมดแชทบอท: โซนงานวันนี้",
      "",
      areaLines || "- ยังไม่มีข้อมูลโซนวันนี้",
      "",
      `งานวันนี้รวม ${today.totalOrders} งาน · COD ฿${money(today.codTotal)}`
    ].join("\n");
  }

  if (q.includes("ค้าง") || q.includes("ปัญหา") || q.includes("รอ") || q.includes("สถานะ")) {
    return [
      "🤖 โหมดแชทบอท: สถานะงานวันนี้",
      "",
      statusLines || "- ยังไม่มีสถานะงานวันนี้",
      "",
      `รอรับ ${today.waiting} · กำลังส่ง ${today.shipping} · สำเร็จ ${today.done} · ปัญหา ${today.problem} · ยกเลิก ${today.canceled}`
    ].join("\n");
  }

  return [
    "🤖 โหมดแชทบอท: สรุปพื้นฐานจากข้อมูลในแอพ",
    "",
    `วันนี้ (${today.date})`,
    `- งานทั้งหมด: ${today.totalOrders} งาน`,
    `- รอคนขับรับ: ${today.waiting} งาน`,
    `- กำลังส่ง: ${today.shipping} งาน`,
    `- ส่งสำเร็จ: ${today.done} งาน`,
    `- ติดปัญหา: ${today.problem} งาน`,
    `- COD รวม: ฿${money(today.codTotal)}`,
    "",
    "ถามต่อได้ เช่น “โซนไหนงานเยอะ”, “งานค้างมีเท่าไหร่”, “สรุปรายเดือน”"
  ].join("\n");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const phoneDigits = String(payload?.phoneDigits || "").replace(/\D/g, "");
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!phoneDigits) return Response.json({ ok: false, error: "Missing phoneDigits" }, { status: 400 });

  // Server-side RBAC: only sales can use this endpoint.
  let decoded;
  let db;
  let user = null;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true);
    db = getAdminDb();

    const userSnap = await db.collection("users_by_phone").doc(phoneDigits).get();
    user = userSnap.exists ? userSnap.data() : null;

    console.log(user);
    logGeminiAuth("auth context", {
      phoneDigits,
      decodedUid: decoded?.uid || null,
      userDocExists: userSnap.exists,
      user,
    });

    const role = String(user?.role || "");
    const uid = String(user?.uid || user?.uidLast || "");

    if (!user || role !== "sales" || !uid || uid !== decoded.uid) {
      logGeminiAuth("forbidden", {
        phoneDigits,
        decodedUid: decoded?.uid || null,
        userRole: role || null,
        userUid: uid || null,
        hasUser: Boolean(user),
      });

      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  } catch (e) {
    logGeminiAuth("authorization error", {
      phoneDigits,
      error: e?.message || String(e),
      stack: e?.stack || null,
    });
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ ok: false, error: "Missing GEMINI_API_KEY" }, { status: 500 });
  const geminiModel = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const contextDays = Math.min(readPositiveInt(process.env.GEMINI_CONTEXT_DAYS, DEFAULT_CONTEXT_DAYS), 7);
  const clientSummary = sanitizeClientSummary(payload?.clientSummary, contextDays);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start: async (controller) => {
      const writer = {
        enqueue: (s) => controller.enqueue(encoder.encode(s)),
      };
      let fallbackSummary = null;
      let fallbackQuestion = String(messages[messages.length - 1]?.text || "");

      try {
        // Gather Firestore context for recent service dates in Bangkok time.
        const dateKeys = Array.from({ length: contextDays }, (_, index) =>
          toServiceDateKeyBangkok(new Date(Date.now() - index * 24 * 60 * 60 * 1000))
        );
        const todayKey = dateKeys[0];
        const startKey = dateKeys[dateKeys.length - 1];
        const summary = clientSummary || await getFirestoreAggregateSummary(db, dateKeys, startKey, todayKey, contextDays);
        fallbackSummary = summary;

        const systemInstruction =
          "คุณคือผู้ช่วย AI วิเคราะห์ข้อมูลโลจิสติกส์ระดับสูงของระบบ Hillkoff Delivery System หน้าที่ของคุณคือการวิเคราะห์คิวงาน สถานะออเดอร์ และยอดจัดเก็บเงินปลายทาง (COD) คอยให้คำแนะนำเชิงลึก สรุปผล และช่วยฝ่ายขายตรวจจับปัญหาคอขวดในระบบ จงตอบกลับด้วยภาษาไทยที่เป็นทางการ กระชับ เข้าใจง่าย และใช้ Markdown Format (เช่น ตาราง หรือ Bullet points) ในการสรุปข้อมูลตัวเลขเสมอ";

        const contextText =
          "System delivery context is aggregated for the recent Bangkok service-date range. Raw orders are intentionally omitted to reduce Firestore payload and Gemini tokens. Use dailyStats when answering about yesterday, today, or this week.\n" +
          "บริบทข้อมูลระบบ (ช่วงวันที่ล่าสุด):\n" +
          JSON.stringify({ summary }, null, 2);

        const promptMessages = [
          { role: "user", parts: [{ text: contextText }] },
          ...messages.map((m) => ({
            role: m?.role === "model" ? "model" : "user",
            parts: [{ text: String(m?.text || "") }],
          })),
        ];

        sse(writer, JSON.stringify({ type: "meta", summary }));

        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
          model: geminiModel,
          systemInstruction,
        });

        const result = await model.generateContentStream({
          contents: promptMessages,
          generationConfig: {
            temperature: 0.4,
          },
        });

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (!text) continue;
          sse(writer, JSON.stringify({ type: "delta", text }));
        }

        sse(writer, JSON.stringify({ type: "done" }));
      } catch (e) {
        if (fallbackSummary && isQuotaError(e)) {
          sse(writer, JSON.stringify({
            type: "delta",
            text: "⚠️ วันนี้ถึงขีดจำกัด AI แล้ว กำลังเปลี่ยนไปใช้แชทบอทแทนครับ\n\n"
          }));
          sse(writer, JSON.stringify({
            type: "delta",
            text: buildBasicChatbotAnswer(fallbackQuestion, fallbackSummary)
          }));
          sse(writer, JSON.stringify({ type: "done", fallback: "basic_chatbot" }));
          return;
        }
        sse(writer, JSON.stringify({ type: "error", error: e?.message || String(e) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

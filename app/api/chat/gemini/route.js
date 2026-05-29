import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

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

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start: async (controller) => {
      const writer = {
        enqueue: (s) => controller.enqueue(encoder.encode(s)),
      };

      try {
        // Gather Firestore context (today only) - keep payload small.
        const todayKey = toServiceDateKeyBangkok(new Date());
        const limit = 200;
        const ordersSnap = await db
          .collection("orders")
          .where("serviceDate", "==", todayKey)
          .get();

        const orders = ordersSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
          .slice(0, limit);
        const queue = orders.map((o) => ({
          id: String(o.id || ""),
          customer: String(o.customerName || ""),
          zone: String(o.zone || ""),
          status: String(o.status || ""),
          cod_amount: Number(o.cod || 0),
          driver: String(o.driverName || o.driverId || ""),
        }));

        const summary = {
          serviceDate: todayKey,
          total: orders.length,
          waiting: orders.filter((o) => o.status === "รอคนขับรับ").length,
          shipping: orders.filter((o) => o.status === "กำลังส่ง" || o.status === "กำลังจัดส่ง").length,
          done: orders.filter((o) => o.status === "ส่งสำเร็จ").length,
          cod_total: orders.reduce((sum, o) => sum + Number(o.cod || 0), 0),
          cod_done: orders.filter((o) => o.status === "ส่งสำเร็จ").reduce((sum, o) => sum + Number(o.cod || 0), 0),
        };

        const systemInstruction =
          "คุณคือผู้ช่วย AI วิเคราะห์ข้อมูลโลจิสติกส์ระดับสูงของระบบ Hillkoff Delivery System หน้าที่ของคุณคือการวิเคราะห์คิวงาน สถานะออเดอร์ และยอดจัดเก็บเงินปลายทาง (COD) คอยให้คำแนะนำเชิงลึก สรุปผล และช่วยฝ่ายขายตรวจจับปัญหาคอขวดในระบบ จงตอบกลับด้วยภาษาไทยที่เป็นทางการ กระชับ เข้าใจง่าย และใช้ Markdown Format (เช่น ตาราง หรือ Bullet points) ในการสรุปข้อมูลตัวเลขเสมอ";

        const contextText =
          "บริบทข้อมูลระบบ (วันนี้):\n" +
          JSON.stringify({ summary, queue }, null, 2);

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
          model: "gemini-1.5-flash",
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

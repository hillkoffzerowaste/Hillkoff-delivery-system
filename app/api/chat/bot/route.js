import { buildAnswer } from "../../../../lib/chatbotEngine";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_ORDERS = 500;
const MAX_CUSTOMERS = 250;
const MAX_SESSIONS = 40;

function toServiceDateKeyBangkok(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
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

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const question = String(payload?.question || "").trim().slice(0, 1000);
  if (!question) return Response.json({ ok: false, error: "Missing question" }, { status: 400 });

  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const todayKey = toServiceDateKeyBangkok();
    const context = await loadContext(db, todayKey);
    context.history = Array.isArray(payload?.history)
      ? payload.history.slice(-8).map((item) => ({
          role: ["user", "model"].includes(item?.role) ? item.role : "user",
          text: String(item?.text || "").slice(0, 1000)
        }))
      : [];
    const answer = buildAnswer(question, todayKey, context);

    await db.collection("chatbot_sessions").add({
      ownerUid: profile.uid,
      phoneDigits: String(profile.phoneDigits || profile.phone || "").replace(/\D/g, ""),
      question,
      answer,
      source: "code_trained_bot",
      createdAt: new Date().toISOString(),
    }).catch((error) => console.warn("Could not save chatbot session", error?.message || error));

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
  } catch (error) {
    return errorResponse(error);
  }
}

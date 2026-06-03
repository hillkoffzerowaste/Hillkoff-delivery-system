import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { buildAnswer } from "../../../../lib/chatbotEngine";

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
  context.history = Array.isArray(payload?.history) ? payload.history.slice(-8) : [];
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

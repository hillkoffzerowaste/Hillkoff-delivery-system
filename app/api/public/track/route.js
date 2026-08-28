import { getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

const TRACK_WINDOW_MS = 10 * 60 * 1000;
const TRACK_MAX_REQUESTS = 20;
const trackAttempts = globalThis.__hillkoffTrackAttempts || new Map();
globalThis.__hillkoffTrackAttempts = trackAttempts;

function requestClientKey(request) {
  return String(request.headers.get("x-real-ip") || "unknown").trim();
}

function isRateLimited(request) {
  const key = requestClientKey(request);
  const now = Date.now();
  const recent = (trackAttempts.get(key) || []).filter((at) => now - at < TRACK_WINDOW_MS);
  recent.push(now);
  trackAttempts.set(key, recent);
  if (trackAttempts.size > 2000) {
    for (const [entryKey, attempts] of trackAttempts) {
      if (!attempts.some((at) => now - at < TRACK_WINDOW_MS)) trackAttempts.delete(entryKey);
    }
  }
  return recent.length > TRACK_MAX_REQUESTS;
}

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function isDelivered(status) {
  return ["ส่งสำเร็จ", "ส่งแล้ว", "delivered"].includes(String(status || "").trim());
}

function publicStatus(status) {
  return isDelivered(status) ? "ส่งแล้ว" : "กำลังส่ง";
}

function maskCustomerName(name) {
  const clean = String(name || "").trim();
  if (!clean) return "ลูกค้า";
  const first = clean.split(/\s+/)[0] || clean;
  const visible = first.length <= 2 ? first : first.slice(0, Math.min(4, first.length));
  return `คุณ ${visible} ******`;
}

function summarizeItems(order) {
  const boxes = Number(order?.boxes || 0);
  return boxes ? [`สินค้า ${boxes} กล่อง`] : ["รายการสินค้าตามออเดอร์"];
}

async function findDriver(db, order) {
  const driverId = String(order?.driverId || "").trim();
  if (!driverId) return null;

  const snap = await db.collection("users_by_phone").where("driverId", "==", driverId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() || null;
}

function serializeOrder(order, driver) {
  const profile = driver?.driverProfile || {};
  const driverName = String(
    order.driverName ||
    driver?.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    ""
  ).trim();

  return {
    orderId: String(order.id || ""),
    status: publicStatus(order.status),
    customerName: maskCustomerName(order.customerName),
    customerAddress: String(order.zone || "").trim().slice(0, 80),
    driverName: driverName ? driverName.split(/\s+/)[0] : "กำลังจัดคนขับ",
    driverPhone: "",
    items: summarizeItems(order),
    updatedAt: String(order.updatedAt || order.deliveredAt || order.checkInAt || order.createdAt || ""),
    deliveredAt: String(order.deliveredAt || ""),
    serviceDate: String(order.serviceDate || "")
  };
}

export async function GET(request) {
  if (isRateLimited(request)) {
    return Response.json(
      { ok: false, error: "ค้นหาถี่เกินไป กรุณารอสักครู่แล้วลองใหม่" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } }
    );
  }
  const { searchParams } = new URL(request.url);
  const phoneDigits = normalizePhoneDigits(searchParams.get("phone"));
  const orderId = String(searchParams.get("orderId") || "").trim();

  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    return Response.json({ ok: false, error: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(orderId)) {
    return Response.json({ ok: false, error: "กรุณากรอกเลขออเดอร์ให้ถูกต้อง" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("orders").doc(orderId).get();
    if (!snap.exists) {
      return Response.json({ ok: true, data: null }, { headers: { "Cache-Control": "no-store" } });
    }
    const order = { id: snap.id, ...(snap.data() || {}) };
    if (String(order.customerPhoneDigits || "") !== phoneDigits) {
      return Response.json({ ok: true, data: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const driver = await findDriver(db, order);
    return Response.json({ ok: true, data: serializeOrder(order, driver) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("Public tracking lookup failed", { code: e?.code, message: e?.message });
    return Response.json({ ok: false, error: "ระบบติดตามขัดข้องชั่วคราว" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

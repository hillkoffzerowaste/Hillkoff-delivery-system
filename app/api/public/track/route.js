import { getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

const TRACK_WINDOW_MS = 10 * 60 * 1000;
const TRACK_MAX_REQUESTS = 20;
const trackAttempts = globalThis.__hillkoffTrackAttempts || new Map();
globalThis.__hillkoffTrackAttempts = trackAttempts;

function requestClientKey(request) {
  const forwarded = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || String(request.headers.get("x-real-ip") || "unknown").trim();
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

function maskAddress(address, zone) {
  const clean = String(address || zone || "").trim();
  if (!clean) return "";
  const compact = clean.replace(/\s+/g, " ");
  const houseMatch = compact.match(/(\d+)\s*\/\s*([0-9A-Za-zก-๙]+)/);
  if (houseMatch) {
    return compact.replace(houseMatch[0], `${houseMatch[1]}/x`).slice(0, 42) + (compact.length > 42 ? "..." : "");
  }
  return compact.slice(0, 42) + (compact.length > 42 ? "..." : "");
}

function summarizeItems(order) {
  const note = String(order?.salesNote || "").trim();
  if (note) {
    const items = note
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (items.length) return items;
  }
  const boxes = Number(order?.boxes || 0);
  return boxes ? [`สินค้า ${boxes} ชิ้น`] : ["รายการสินค้าตามออเดอร์"];
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
    rawStatus: String(order.status || ""),
    customerName: maskCustomerName(order.customerName),
    customerAddress: maskAddress(order.address, order.zone),
    driverName: driverName || "กำลังจัดคนขับ",
    driverPhone: String(driver?.phone || driver?.phoneDigits || ""),
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

  if (phoneDigits.length < 8) {
    return Response.json({ ok: false, error: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const db = getAdminDb();
    let candidates = [];

    const phoneSnap = await db
      .collection("orders")
      .where("customerPhoneDigits", "==", phoneDigits)
      .limit(20)
      .get();

    candidates = phoneSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    candidates.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

    const order = candidates[0];
    if (!order) {
      return Response.json({ ok: true, data: null }, { headers: { "Cache-Control": "no-store" } });
    }

    const driver = await findDriver(db, order);
    return Response.json({ ok: true, data: serializeOrder(order, driver) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

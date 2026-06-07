import { getAdminDb, getAdminAuth } from "../../../../lib/firebaseAdmin";
import { pushLineText } from "../../../../lib/lineOa";

export const runtime = "nodejs";

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  // YYYY-MM-DD in Asia/Bangkok
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function buildLineMessage(orderId, order) {
  const lines = [
    "มีออเดอร์ใหม่เข้าคิวคนขับ",
    `งาน: ${orderId}`,
    `ลูกค้า: ${order.customerName || "-"}`,
    `พื้นที่: ${order.zone || "-"}`,
    `ที่อยู่: ${order.address || "-"}`,
    `เวลา: ${order.window || "-"}`,
    `จำนวน: ${order.boxes || 0} กล่อง`,
    `COD: ฿${Number(order.cod || 0).toLocaleString("th-TH")}`
  ];
  if (order.salesNote) lines.push(`หมายเหตุ: ${order.salesNote}`);
  lines.push("กรุณาเปิดแอพเพื่อรับงาน");
  return lines.join("\n");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const order = payload?.order && typeof payload.order === "object" ? payload.order : null;

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!order?.id) return Response.json({ ok: false, error: "Missing order" }, { status: 400 });

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const db = getAdminDb();

    // Minimal validation
    const next = {
      customerId: String(order.customerId || ""),
      customerName: String(order.customerName || ""),
      customerPhone: String(order.customerPhone || ""),
      zone: String(order.zone || ""),
      address: String(order.address || ""),
      mapUrl: String(order.mapUrl || ""),
      window: String(order.window || ""),
      boxes: Number(order.boxes || 0),
      cod: Number(order.cod || 0),
      driverId: String(order.driverId || ""),
      driverName: String(order.driverName || ""),
      salesName: String(order.salesName || ""),
      salesPhone: String(order.salesPhone || ""),
      status: String(order.status || "รอคนขับรับ"),
      checkInAt: String(order.checkInAt || ""),
      deliveredAt: String(order.deliveredAt || ""),
      complaint: String(order.complaint || ""),
      salesNote: String(order.salesNote || ""),
      driverNote: String(order.driverNote || ""),
      // Used for day-based separation (today vs history)
      serviceDate: String(order.serviceDate || toServiceDateKey(order.createdAt)),
      createdAt: String(order.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      createdByUid: decoded.uid,
    };

    await db.collection("orders").doc(String(order.id)).set(next, { merge: true });

    // Push notify drivers (best-effort). The service worker renders the
    // notification so it also works when the app is in the background.
    try {
      const snap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
      const tokens = snap.docs.map((d) => d.id).filter(Boolean);
      if (tokens.length) {
        const msgTitle = "📦 มีออเดอร์ใหม่";
        const msgBody = `${next.customerName || "ลูกค้า"} · ${next.zone || ""}`.trim();
        const admin = await import("firebase-admin");
        const messaging = admin.messaging();
        const response = await messaging.sendEachForMulticast({
          tokens,
          data: {
            type: "new_order",
            title: msgTitle,
            body: msgBody,
            orderId: String(order.id),
            customerName: String(next.customerName || ""),
            zone: String(next.zone || ""),
          },
          webpush: {
            headers: { Urgency: "high" },
            fcmOptions: { link: "/" },
          },
        });

        const staleTokenDeletes = [];
        response.responses.forEach((result, index) => {
          const code = result.error?.code || "";
          if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
            staleTokenDeletes.push(db.collection("push_tokens").doc(tokens[index]).delete());
          }
        });
        if (staleTokenDeletes.length) await Promise.allSettled(staleTokenDeletes);
      }
    } catch (e) {
      console.warn("Push notification failed", e?.message || e);
    }

    try {
      const lineResult = await pushLineText({
        text: buildLineMessage(String(order.id), next),
        metadata: { orderId: String(order.id), source: "orders.create" }
      });
      await db.collection("notifications").add({
        channel: "line",
        type: "new_order",
        orderId: String(order.id),
        text: buildLineMessage(String(order.id), next),
        result: lineResult,
        createdByUid: decoded.uid,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("LINE OA notification failed", e?.message || e);
    }

    return Response.json({ ok: true, data: { id: String(order.id) } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

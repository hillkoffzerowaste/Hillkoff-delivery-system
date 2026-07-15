import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "store", "admin"]);
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim().slice(0, 200);
    if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    if (orderId.includes("/")) return Response.json({ ok: false, error: "Invalid orderId" }, { status: 400 });

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: true, data: { id: orderId, alreadyDeleted: true } });
    const order = snap.data() || {};
    if (profile.role === "store") {
      const driverStarted = Boolean(order.driverId) || ["queued", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(order.queueStatus) || ["กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(order.status);
      if (!order.workflowType || driverStarted) {
        return Response.json({ ok: false, error: "สโตร์ลบได้เฉพาะงานเตรียมที่ยังไม่เข้าคิวคนขับ" }, { status: 403 });
      }
    }

    const activity = await ref.collection("activity").limit(400).get();
    const batch = db.batch();
    activity.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ref);
    const auditRef = db.collection("audit_logs").doc();
    batch.set(auditRef, {
      action: "order_deleted",
      orderId,
      orderSnapshot: order,
      byUid: profile.uid,
      byRole: profile.role,
      byName: profile.name,
      createdAt: new Date().toISOString()
    });
    await batch.commit();
    return Response.json({ ok: true, data: { id: orderId } });
  } catch (error) {
    return errorResponse(error);
  }
}

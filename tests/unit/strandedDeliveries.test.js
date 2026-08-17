import { describe, expect, it } from "vitest";
import {
  buildStrandedClosurePatch,
  isStrandedDeliveryOrder,
  orderServiceDateKey,
  strandedDeliveryReason
} from "../../lib/strandedDeliveries.js";

const TODAY = "2026-08-17";

describe("stranded delivery detection", () => {
  it("treats a driver-held job from an earlier day as stranded", () => {
    expect(isStrandedDeliveryOrder({ status: "กำลังจัดส่ง", queueStatus: "queued", serviceDate: "2026-08-13" }, TODAY)).toBe(true);
    expect(isStrandedDeliveryOrder({ status: "กำลังส่ง", queueStatus: "queued", serviceDate: "2026-08-06" }, TODAY)).toBe(true);
  });

  it("leaves today's work alone so live jobs are never closed by mistake", () => {
    expect(isStrandedDeliveryOrder({ status: "กำลังจัดส่ง", queueStatus: "queued", serviceDate: TODAY }, TODAY)).toBe(false);
  });

  it("ignores jobs that already reached a terminal state", () => {
    expect(isStrandedDeliveryOrder({ status: "ส่งสำเร็จ", queueStatus: "completed", serviceDate: "2026-08-13" }, TODAY)).toBe(false);
    expect(isStrandedDeliveryOrder({ status: "กำลังจัดส่ง", queueStatus: "completed", serviceDate: "2026-08-13" }, TODAY)).toBe(false);
  });

  it("never offers to close a job that was never dispatched to a driver", () => {
    // "รอคนขับรับ" ไม่เคยออกวิ่ง ปิดเป็นส่งสำเร็จย้อนหลังจะเป็นการบันทึกเท็จ
    expect(isStrandedDeliveryOrder({ status: "รอคนขับรับ", queueStatus: "queued", serviceDate: "2026-08-06" }, TODAY)).toBe(false);
  });

  it("falls back to createdAt when serviceDate is missing", () => {
    expect(orderServiceDateKey({ createdAt: "2026-08-13T01:17:52.041Z" })).toBe("2026-08-13");
    expect(orderServiceDateKey({ serviceDate: "2026-08-11" })).toBe("2026-08-11");
  });

  it("names the step the job died on", () => {
    expect(strandedDeliveryReason({ status: "กำลังส่ง" })).toBe("no_check_in");
    expect(strandedDeliveryReason({ status: "กำลังจัดส่ง", podPhotoCount: 0 })).toBe("no_pod_photo");
    expect(strandedDeliveryReason({ status: "กำลังจัดส่ง", podPhotoCount: 2 })).toBe("line_share_incomplete");
    expect(strandedDeliveryReason({ status: "กำลังจัดส่ง", podPhotoCount: 2, sharedToLine: true })).toBe("not_confirmed");
  });
});

describe("stranded closure patch", () => {
  const order = { status: "กำลังจัดส่ง", queueStatus: "queued", serviceDate: "2026-08-13", workflowHistory: [{ action: "created" }] };
  const actor = { uid: "u1", role: "sales", name: "ฝ่ายขาย ก" };
  const now = "2026-08-17T09:00:00.000Z";

  it("closes the job and keeps the audit trail", () => {
    const { patch, history } = buildStrandedClosurePatch(order, actor, now, { reason: "ยืนยันกับคนขับแล้ว", batchId: "b1" });
    expect(patch.status).toBe("ส่งสำเร็จ");
    expect(patch.queueStatus).toBe("completed");
    expect(patch.deliveredAt).toBe(now);
    expect(patch.strandedClosureReason).toBe("ยืนยันกับคนขับแล้ว");
    expect(patch.strandedPreviousStatus).toBe("กำลังจัดส่ง");
    expect(patch.workflowHistory).toHaveLength(2);
    expect(history).toMatchObject({ action: "stranded_closed", result: "completed_by_ops", uid: "u1" });
  });

  it("marks the delivery as not driver-confirmed so KPI can tell them apart", () => {
    const { patch } = buildStrandedClosurePatch(order, actor, now, { reason: "ปิดย้อนหลัง" });
    expect(patch.driverConfirmed).toBe(false);
  });

  it("keeps a real delivery timestamp when the driver had already recorded one", () => {
    const { patch } = buildStrandedClosurePatch({ ...order, deliveredAt: "13/8/2569 10:30" }, actor, now, { reason: "ปิดย้อนหลัง" });
    expect(patch.deliveredAt).toBe("13/8/2569 10:30");
  });

  it("caps workflow history so the document cannot grow without bound", () => {
    const long = { ...order, workflowHistory: Array.from({ length: 140 }, (_, index) => ({ action: `event-${index}` })) };
    const { patch } = buildStrandedClosurePatch(long, actor, now, { reason: "ปิดย้อนหลัง" });
    expect(patch.workflowHistory).toHaveLength(100);
  });
});

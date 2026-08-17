import { describe, expect, it } from "vitest";
import {
  allowedStrandedActions,
  buildStrandedActionPatch,
  canApplyStrandedAction,
  isExpiredQueueOrder,
  strandedCategory,
  strandedDeliveryReason
} from "../../lib/strandedDeliveries.js";
import { DRIVER_QUEUE_POLICY_VERSION, isDriverQueueVisibleToDriver } from "../../lib/driverQueuePolicy.js";

const TODAY = "2026-08-17";
const ACTOR = { uid: "u9", role: "sales", name: "ฝ่ายขาย ข" };
const NOW = "2026-08-17T10:00:00.000Z";

const expiredQueueOrder = {
  status: "รอคนขับรับ",
  queueStatus: "queued",
  driverId: "",
  driverQueuePolicyVersion: DRIVER_QUEUE_POLICY_VERSION,
  driverQueueDate: "2026-08-10",
  serviceDate: "2026-08-10"
};

const inFlightOrder = { status: "กำลังจัดส่ง", queueStatus: "queued", serviceDate: "2026-08-13", driverId: "driver_1" };

describe("stranded categories", () => {
  it("separates a job a driver holds from a queue nobody picked up", () => {
    expect(strandedCategory(inFlightOrder, TODAY)).toBe("in_flight");
    expect(strandedCategory(expiredQueueOrder, TODAY)).toBe("expired_queue");
    expect(strandedCategory({ status: "ส่งสำเร็จ", queueStatus: "completed" }, TODAY)).toBe("");
  });

  it("only calls a queue expired once its queue date has passed", () => {
    expect(isExpiredQueueOrder({ ...expiredQueueOrder, driverQueueDate: TODAY }, TODAY)).toBe(false);
    expect(isExpiredQueueOrder(expiredQueueOrder, TODAY)).toBe(true);
  });

  it("confirms the expired queue really is hidden from drivers, which is why ops must act", () => {
    expect(isDriverQueueVisibleToDriver(expiredQueueOrder, TODAY)).toBe(false);
  });

  it("offers requeue only where no driver is holding the job", () => {
    expect(allowedStrandedActions("expired_queue")).toEqual(["complete", "requeue", "cancel"]);
    expect(allowedStrandedActions("in_flight")).toEqual(["complete", "cancel"]);
    expect(canApplyStrandedAction(inFlightOrder, "requeue", TODAY)).toBe(false);
    expect(canApplyStrandedAction(expiredQueueOrder, "requeue", TODAY)).toBe(true);
  });

  it("refuses any action on a job that is not stranded", () => {
    const live = { status: "กำลังจัดส่ง", queueStatus: "queued", serviceDate: TODAY };
    for (const action of ["complete", "requeue", "cancel"]) {
      expect(canApplyStrandedAction(live, action, TODAY)).toBe(false);
    }
  });

  it("names an unaccepted queue for what it is", () => {
    expect(strandedDeliveryReason(expiredQueueOrder)).toBe("never_accepted");
  });
});

describe("stranded action patches", () => {
  it("requeue puts the job back in front of drivers today", () => {
    const { patch, history } = buildStrandedActionPatch(expiredQueueOrder, "requeue", ACTOR, NOW, { reason: "ลูกค้ายังรอของ", batchId: "b2" });
    expect(patch.driverQueueDate).toBe(TODAY);
    expect(patch.status).toBe("รอคนขับรับ");
    expect(patch.queueStatus).toBe("queued");
    expect(history.action).toBe("stranded_requeued");
    // ต้องกลับมามองเห็นได้จริง ไม่ใช่แค่เปลี่ยนวันที่
    expect(isDriverQueueVisibleToDriver({ ...expiredQueueOrder, ...patch }, TODAY)).toBe(true);
  });

  it("cancel lands on a queue status the reports already treat as terminal", () => {
    const { patch, history } = buildStrandedActionPatch(expiredQueueOrder, "cancel", ACTOR, NOW, { reason: "ออเดอร์ซ้ำ" });
    expect(patch.status).toBe("ยกเลิก");
    expect(patch.queueStatus).toBe("cancelled");
    expect(patch.driverId).toBe("");
    expect(history.result).toBe("cancelled_by_ops");
  });

  it("complete still marks the delivery as not driver-confirmed", () => {
    const { patch } = buildStrandedActionPatch(inFlightOrder, "complete", ACTOR, NOW, { reason: "ยืนยันแล้ว" });
    expect(patch.status).toBe("ส่งสำเร็จ");
    expect(patch.driverConfirmed).toBe(false);
  });

  it("every action appends exactly one history entry and keeps the reason", () => {
    for (const action of ["complete", "requeue", "cancel"]) {
      const { patch, history } = buildStrandedActionPatch(
        { ...expiredQueueOrder, workflowHistory: [{ action: "created" }] },
        action, ACTOR, NOW, { reason: "เหตุผลทดสอบ" }
      );
      expect(patch.workflowHistory).toHaveLength(2);
      expect(history.reason).toBe("เหตุผลทดสอบ");
      expect(history.name).toBe("ฝ่ายขาย ข");
    }
  });

  it("rejects an unknown action instead of writing something unintended", () => {
    expect(() => buildStrandedActionPatch(inFlightOrder, "archive", ACTOR, NOW, {})).toThrow(/Unknown stranded action/);
  });
});

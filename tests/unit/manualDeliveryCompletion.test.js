import { describe, expect, it } from "vitest";
import { buildSalesManualDeliveryCompletionPatch } from "../../lib/manualDeliveryCompletion.js";

describe("sales manual delivery completion", () => {
  it("records the selected actual driver instead of the previously assigned driver", () => {
    const { patch, history } = buildSalesManualDeliveryCompletionPatch(
      {
        status: "กำลังส่ง",
        queueStatus: "queued",
        driverId: "driver-assigned",
        driverName: "คนขับที่รับงาน",
        workflowHistory: [{ action: "driver_accepted" }]
      },
      { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง" },
      { id: "driver-actual", name: "คนขับที่ส่งจริง" },
      "2026-08-23T10:00:00.000Z",
      { reason: "ยืนยันกับคนขับแล้วว่าส่งถึงลูกค้า" }
    );

    expect(patch).toMatchObject({
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      driverId: "driver-actual",
      driverName: "คนขับที่ส่งจริง",
      previousDriverId: "driver-assigned",
      previousDriverName: "คนขับที่รับงาน",
      driverConfirmed: false,
      manualDeliveryCompletedBy: "ฝ่ายขายหนึ่ง",
      manualDeliveryCompletionReason: "ยืนยันกับคนขับแล้วว่าส่งถึงลูกค้า"
    });
    expect(patch.workflowHistory).toHaveLength(2);
    expect(history).toMatchObject({
      action: "sales_completed_delivery",
      result: "completed_by_sales",
      actualDriverId: "driver-actual",
      previousDriverId: "driver-assigned",
      reason: "ยืนยันกับคนขับแล้วว่าส่งถึงลูกค้า"
    });
  });

  it("preserves an existing delivery timestamp when sales closes a missed confirmation", () => {
    const { patch } = buildSalesManualDeliveryCompletionPatch(
      { status: "กำลังจัดส่ง", queueStatus: "queued", deliveredAt: "2026-08-23T08:30:00.000Z" },
      { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง" },
      { id: "driver-actual", name: "คนขับที่ส่งจริง" },
      "2026-08-23T10:00:00.000Z",
      { reason: "คนขับลืมกดยืนยัน" }
    );

    expect(patch.deliveredAt).toBe("2026-08-23T08:30:00.000Z");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildPackAssistExistingOrderPatch,
  canPackAssistShareBooking,
  classifyPackAssistDuplicate,
  isBlockingPackAssistOrder,
  packAssistDuplicateMessage,
  validatePackAssistOrder
} from "../../lib/packAssistOrder";

describe("Pack urgent order policy", () => {
  it("allows only a direct Pack route with a company driver", () => {
    expect(() => validatePackAssistOrder({ deliveryMethod: "company_driver", workflowType: "direct_pack" })).not.toThrow();
    expect(() => validatePackAssistOrder({ deliveryMethod: "company_driver", workflowType: "store_route" })).toThrow(/ส่งตรงห้องแพ็ค/);
    expect(() => validatePackAssistOrder({ deliveryMethod: "grab_pickup", workflowType: "direct_pack" })).toThrow(/คนขับบริษัท/);
  });

  it("blocks an unfinished order for the selected customer but ignores finished orders", () => {
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "preparing", status: "รอจัดเตรียมสินค้า" }, "customer-1")).toBe(true);
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "queued", status: "รอคนขับรับ" }, "customer-1")).toBe(true);
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "completed", status: "ส่งสำเร็จ" }, "customer-1")).toBe(false);
    expect(isBlockingPackAssistOrder({ customerId: "customer-2", queueStatus: "preparing" }, "customer-1")).toBe(false);
  });

  it("reuses a booking number the Store already keyed, but never one owned by another order", () => {
    expect(canPackAssistShareBooking({ source: "store_reports", sourceId: "report-1" })).toBe(true);
    expect(canPackAssistShareBooking({ source: "orders", sourceId: "order-1" })).toBe(false);
    expect(canPackAssistShareBooking({})).toBe(false);
  });

  it("tells Pack to wait for an order still being checked by Store", () => {
    expect(packAssistDuplicateMessage({ workflowType: "store_route", storeStatus: "pending" })).toMatch(/สโตร์กำลังตรวจอยู่/);
    expect(packAssistDuplicateMessage({ workflowType: "direct_pack", packStatus: "working" })).toMatch(/ยังดำเนินการอยู่/);
  });

  it("allows Pack to update the latest same-day order that a driver has not accepted", () => {
    const result = classifyPackAssistDuplicate([
      { id: "eligible", customerId: "customer-1", serviceDate: "2026-10-09", queueStatus: "queued", status: "รอคนขับรับ", updatedAt: "2026-10-09T01:00:00.000Z" }
    ], { customerId: "customer-1", todayServiceDate: "2026-10-09" });

    expect(result).toEqual({ type: "updatable", order: expect.objectContaining({ id: "eligible" }) });
  });

  it("rejects a same-day order once a driver has accepted it", () => {
    const result = classifyPackAssistDuplicate([
      { id: "accepted", customerId: "customer-1", serviceDate: "2026-10-09", queueStatus: "queued", status: "กำลังส่ง", driverId: "driver-1", acceptedAt: "2026-10-09T02:00:00.000Z" }
    ], { customerId: "customer-1", todayServiceDate: "2026-10-09" });

    expect(result).toEqual({ type: "driver_accepted", order: expect.objectContaining({ id: "accepted" }) });
  });

  it("does not treat another service date as a duplicate", () => {
    const result = classifyPackAssistDuplicate([
      { id: "yesterday", customerId: "customer-1", serviceDate: "2026-10-08", queueStatus: "queued", status: "รอคนขับรับ" }
    ], { customerId: "customer-1", todayServiceDate: "2026-10-09" });

    expect(result).toEqual({ type: "none", order: null });
  });

  it("lets an accepted order win over an eligible duplicate", () => {
    const result = classifyPackAssistDuplicate([
      { id: "eligible", customerId: "customer-1", serviceDate: "2026-10-09", queueStatus: "queued", status: "รอคนขับรับ", updatedAt: "2026-10-09T04:00:00.000Z" },
      { id: "accepted", customerId: "customer-1", serviceDate: "2026-10-09", queueStatus: "queued", status: "กำลังจัดส่ง", driverId: "driver-1", updatedAt: "2026-10-09T02:00:00.000Z" }
    ], { customerId: "customer-1", todayServiceDate: "2026-10-09" });

    expect(result).toEqual({ type: "driver_accepted", order: expect.objectContaining({ id: "accepted" }) });
  });

  it("selects the latest eligible duplicate and builds a queue re-entry audit patch", () => {
    const existing = { id: "latest", customerId: "customer-1", serviceDate: "2026-10-09", createdAt: "2026-10-09T00:00:00.000Z", workflowHistory: [{ action: "created" }], createdBy: "sales-1" };
    const latest = {
      customerId: "customer-1",
      customerName: "ร้านใหม่",
      customerPhone: "0812345678",
      zone: "เมืองเชียงใหม่",
      address: "ถนนใหม่",
      mapUrl: "https://maps.example/new",
      window: "รอจัดเตรียม 10 นาที",
      boxes: 4,
      packageUnit: "box",
      paymentType: "COD",
      cod: 900,
      deliveryMethod: "company_driver",
      workflowType: "direct_pack",
      bookingNumber: "CSP-1234",
      bookingNumbers: ["CSP-1234"],
      bookingMonthKey: "2026-10",
      bookingNumberMissing: false,
      bookingNumberNotice: "",
      salesNote: "ช่วยส่งรอบบ่าย",
      serviceDate: "2026-10-09",
      id: "new-client-id",
      driverId: "should-not-copy"
    };
    const actor = { uid: "pack-1", role: "pack", name: "ห้องแพ็ค" };
    const now = "2026-10-09T03:00:00.000Z";
    const result = classifyPackAssistDuplicate([
      { ...existing, id: "older", updatedAt: "2026-10-09T01:00:00.000Z" },
      { ...existing, updatedAt: "2026-10-09T02:00:00.000Z" }
    ], { customerId: "customer-1", todayServiceDate: "2026-10-09" });
    const built = buildPackAssistExistingOrderPatch(result.order, latest, actor, now);

    expect(result.order.id).toBe("latest");
    expect(built.patch).toMatchObject({
      customerId: "customer-1",
      customerName: "ร้านใหม่",
      customerPhone: "0812345678",
      address: "ถนนใหม่",
      boxes: 4,
      bookingNumber: "CSP-1234",
      packStatus: "checked",
      driverQueueDate: "2026-10-09",
      queuedAt: now,
      queueStatus: "queued",
      status: "รอคนขับรับ",
      queuedBy: "pack-1"
    });
    expect(built.patch).not.toHaveProperty("id");
    expect(built.patch).not.toHaveProperty("createdAt");
    expect(built.patch).not.toHaveProperty("driverId");
    expect(built.history).toMatchObject({ action: "pack_assist_duplicate_requeue", uid: "pack-1", role: "pack", name: "ห้องแพ็ค", orderId: "latest", result: "updated_existing_and_requeued", at: now });
    expect(built.patch.workflowHistory).toEqual([...existing.workflowHistory, built.history]);
  });
});

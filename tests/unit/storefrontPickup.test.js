import { describe, expect, it } from "vitest";
import { isStorefrontPickupOrder, isStorefrontPickupReady, storefrontPickupTimeline, toStorefrontPickupOrder } from "../../lib/storefrontPickup.js";

describe("storefront pickup policy", () => {
  const readyGrab = {
    id: "GRAB-1",
    deliveryMethod: "grab_pickup",
    queueStatus: "grab_ready",
    packStatus: "checked",
    storeStatus: "checked",
    customerName: "ลูกค้าทดสอบ",
    internalNote: "must not be exposed"
  };

  it("recognizes ready Grab work and removes non-handover fields from its DTO", () => {
    expect(isStorefrontPickupOrder(readyGrab)).toBe(true);
    expect(isStorefrontPickupReady(readyGrab)).toBe(true);
    expect(toStorefrontPickupOrder(readyGrab)).toEqual(expect.objectContaining({
      id: "GRAB-1",
      deliveryMethod: "grab_pickup",
      queueStatus: "grab_ready",
      packStatus: "checked",
      storeStatus: "checked",
      customerName: "ลูกค้าทดสอบ"
    }));
    expect(toStorefrontPickupOrder(readyGrab)).not.toHaveProperty("internalNote");
  });

  it("keeps handover disabled until pack finishes and rejects other delivery methods", () => {
    expect(isStorefrontPickupReady({ ...readyGrab, packStatus: "working" })).toBe(false);
    expect(isStorefrontPickupOrder({ ...readyGrab, deliveryMethod: "company_driver" })).toBe(false);
  });

  it("describes the store, pack, readiness, and completed handover checkpoints", () => {
    expect(storefrontPickupTimeline({
      ...readyGrab,
      grabReadyAt: "2026-09-08T09:00:00.000Z",
      grabPickedUpAt: "2026-09-08T09:05:00.000Z",
      grabPickedUpBy: "หน้าร้านหนึ่ง"
    })).toEqual([
      { id: "store", label: "สโตร์ตรวจแล้ว", complete: true },
      { id: "pack", label: "ห้องแพ็คตรวจแล้ว", complete: true },
      { id: "ready", label: "พร้อมให้ Grab รับสินค้า", complete: true },
      { id: "handover", label: "มอบสินค้าแล้ว · หน้าร้านหนึ่ง", complete: true }
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { initialPreparationStatuses } from "../../lib/preparationWorkflow.js";
import {
  STORE_ROUTE_MIGRATION_ACTION,
  buildStoreRouteToPackPatch,
  classifyStoreRouteOrderForMigration,
  diffPatch
} from "../../lib/storeRouteMigration.js";

const NOW = "2026-10-28T03:00:00.000Z";
const base = {
  workflowType: "store_route",
  deliveryMethod: "company_driver",
  storeStatus: "pending",
  packStatus: "blocked",
  queueStatus: "preparing",
  status: "รอจัดเตรียมสินค้า",
  workflowHistory: []
};

describe("classifyStoreRouteOrderForMigration", () => {
  it.each(["pending", "working", "waiting", "returned"])("accepts store status %s for every delivery method", (storeStatus) => {
    for (const deliveryMethod of ["company_driver", "grab_pickup", "customer_pickup", "outstation"]) {
      expect(classifyStoreRouteOrderForMigration({ ...base, deliveryMethod, storeStatus })).toEqual({ eligible: true, reason: "ok" });
    }
  });

  it("treats a missing store status and queue status as pending/preparing", () => {
    expect(classifyStoreRouteOrderForMigration({ workflowType: "store_route" }).eligible).toBe(true);
  });

  it.each([
    ["direct_pack", { workflowType: "direct_pack" }, "not_store_route"],
    ["direct_driver", { workflowType: "direct_driver" }, "not_store_route"],
    ["store checked", { storeStatus: "checked" }, "store_finished:checked"],
    ["store partial", { storeStatus: "partial" }, "store_finished:partial"],
    ["store skipped", { storeStatus: "skipped" }, "store_finished:skipped"],
    ["completed", { queueStatus: "completed" }, "queue_not_preparing:completed"],
    ["queued", { queueStatus: "queued" }, "queue_not_preparing:queued"],
    ["grab_ready", { queueStatus: "grab_ready" }, "queue_not_preparing:grab_ready"],
    ["pack_archived", { queueStatus: "pack_archived" }, "queue_not_preparing:pack_archived"],
    ["driver_archived", { queueStatus: "driver_archived" }, "queue_not_preparing:driver_archived"],
    ["driver assigned", { driverId: "d1" }, "driver_assigned"],
    ["accepted", { acceptedAt: "2026-10-28T01:00:00.000Z" }, "driver_assigned"],
    ["on the road", { status: "กำลังส่ง" }, "driver_assigned"],
    ["pack checked", { packStatus: "checked" }, "pack_already_finished"],
    ["pack partial", { packStatus: "partial" }, "pack_already_finished"]
  ])("rejects %s", (_label, patch, reason) => {
    expect(classifyStoreRouteOrderForMigration({ ...base, ...patch })).toEqual({ eligible: false, reason });
  });
});

describe("buildStoreRouteToPackPatch", () => {
  it.each(["company_driver", "grab_pickup", "customer_pickup", "outstation"])("matches direct_pack initial statuses for %s", (deliveryMethod) => {
    const initial = initialPreparationStatuses(deliveryMethod, "direct_pack");
    const { patch } = buildStoreRouteToPackPatch({ ...base, deliveryMethod }, { now: NOW });
    expect(patch).toMatchObject({
      workflowType: "direct_pack",
      storeStatus: initial.storeStatus,
      packStatus: initial.packStatus,
      queueStatus: initial.queueStatus,
      status: initial.status,
      updatedAt: NOW
    });
  });

  it("keeps working and waiting pack statuses and the current status text", () => {
    for (const packStatus of ["working", "waiting"]) {
      const { patch } = buildStoreRouteToPackPatch({ ...base, packStatus, status: "กำลังแพ็ค" }, { now: NOW });
      expect(patch).toMatchObject({ packStatus, status: "กำลังแพ็ค" });
    }
  });

  it("resets a returned order back to pending so the packing tabs show it", () => {
    const { patch } = buildStoreRouteToPackPatch({ ...base, storeStatus: "returned", packStatus: "returned", status: "ส่งกลับสโตร์ตรวจสอบ" }, { now: NOW });
    expect(patch).toMatchObject({ storeStatus: "skipped", packStatus: "pending", status: "รอจัดเตรียมสินค้า" });
  });

  it("moves a store rework to the packing room like driverReworkPatch", () => {
    const { patch } = buildStoreRouteToPackPatch({
      ...base,
      storeStatus: "returned",
      packStatus: "blocked",
      status: "ติดปัญหา",
      reworkRequired: true,
      reworkRoute: "store_route",
      reworkStatus: "waiting_store"
    }, { now: NOW });
    expect(patch).toMatchObject({ reworkRoute: "direct_pack", reworkStatus: "waiting_pack", packStatus: "waiting", status: "ติดปัญหา", storeStatus: "skipped" });
  });

  it("does not touch store results, driver, booking or Chiang Mai round fields", () => {
    const order = {
      ...base,
      missingItems: ["กาแฟ"],
      storeWorkDetails: { detail: "x" },
      storePackerName: "a",
      storeCheckerName: "b",
      driverId: "",
      bookingNumber: "CSP-1111",
      chiangmaiRoundCode: "tuesday",
      serviceDate: "2026-10-28"
    };
    const { patch } = buildStoreRouteToPackPatch(order, { now: NOW });
    for (const field of ["missingItems", "storeWorkDetails", "storePackerName", "storeCheckerName", "driverId", "bookingNumber", "chiangmaiRoundCode", "serviceDate", "deliveryMethod", "createdAt", "queuedAt"]) {
      expect(patch).not.toHaveProperty(field);
    }
    expect(patch).toMatchObject({ storeRouteMigratedAt: NOW, storeRouteMigratedFrom: "store_route", storeRouteMigratedPriorStoreStatus: "pending", storeRouteMigratedPriorPackStatus: "blocked" });
  });

  it("builds the history entry and appends it to at most 100 workflowHistory items", () => {
    const old = Array.from({ length: 150 }, (_, index) => ({ action: `a${index}` }));
    const { patch, history } = buildStoreRouteToPackPatch({ ...base, storeStatus: "working", workflowHistory: old }, { now: NOW });
    expect(history).toEqual({
      action: STORE_ROUTE_MIGRATION_ACTION,
      role: "system",
      name: "migrate-store-route-to-pack",
      uid: "script",
      at: NOW,
      note: "ยกเลิกเส้นทางสโตร์ ย้ายเข้าห้องแพ็คโดยตรง",
      result: "moved_to_pack",
      fromWorkflowType: "store_route",
      toWorkflowType: "direct_pack",
      fromStoreStatus: "working",
      toStoreStatus: "skipped",
      fromPackStatus: "blocked",
      toPackStatus: "pending",
      fromQueueStatus: "preparing",
      toQueueStatus: "preparing"
    });
    expect(patch.workflowHistory).toHaveLength(100);
    expect(patch.workflowHistory.at(-1)).toBe(history);
    expect(patch.workflowHistory[0]).toEqual({ action: "a51" });
  });

  it("throws for an ineligible order and never mutates its input", () => {
    expect(() => buildStoreRouteToPackPatch({ ...base, storeStatus: "checked" }, { now: NOW })).toThrow("store_finished:checked");
    const order = { ...base, workflowHistory: [{ action: "created" }] };
    const snapshot = structuredClone(order);
    buildStoreRouteToPackPatch(order, { now: NOW });
    expect(order).toEqual(snapshot);
  });

  it("is idempotent: a migrated order is no longer eligible", () => {
    const { patch } = buildStoreRouteToPackPatch(base, { now: NOW });
    expect(classifyStoreRouteOrderForMigration({ ...base, ...patch })).toEqual({ eligible: false, reason: "not_store_route" });
  });
});

describe("diffPatch", () => {
  it("returns only changed fields and ignores history/updatedAt", () => {
    const { patch } = buildStoreRouteToPackPatch({ ...base, storeStatus: "working", packStatus: "pending" }, { now: NOW });
    const changes = diffPatch({ ...base, storeStatus: "working", packStatus: "pending" }, patch);
    const fields = changes.map((change) => change.field);
    expect(fields).toContain("workflowType");
    expect(fields).toContain("storeStatus");
    expect(fields).not.toContain("packStatus");
    expect(fields).not.toContain("queueStatus");
    expect(fields).not.toContain("workflowHistory");
    expect(fields).not.toContain("updatedAt");
    expect(changes.find((change) => change.field === "workflowType")).toEqual({ field: "workflowType", from: "store_route", to: "direct_pack" });
  });
});

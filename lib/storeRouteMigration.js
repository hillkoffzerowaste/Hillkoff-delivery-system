import { initialPreparationStatuses } from "./preparationWorkflow.js";

export const STORE_ROUTE_MIGRATION_ACTION = "store_route_migration";

// ค้างที่สโตร์ = ตรงกับ STORE_CHECKING_STATUSES ใน lib/packStoreChecking.js (checked/partial/skipped ถือว่าสโตร์จบแล้ว)
const STORE_OPEN_STATUSES = new Set(["pending", "working", "waiting", "returned"]);
const PREPARING_QUEUE_STATUSES = new Set(["", "preparing"]);
const IN_DELIVERY_STATUSES = new Set(["กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"]);
const PACK_FINISHED_STATUSES = new Set(["checked", "partial"]);
const DIFF_IGNORED_FIELDS = new Set(["workflowHistory", "updatedAt"]);

export function classifyStoreRouteOrderForMigration(order = {}) {
  if (order?.workflowType !== "store_route") return { eligible: false, reason: "not_store_route" };
  const storeStatus = String(order.storeStatus || "pending");
  if (!STORE_OPEN_STATUSES.has(storeStatus)) return { eligible: false, reason: `store_finished:${storeStatus}` };
  const queueStatus = String(order.queueStatus || "");
  if (!PREPARING_QUEUE_STATUSES.has(queueStatus)) return { eligible: false, reason: `queue_not_preparing:${queueStatus}` };
  if (order.driverId || order.acceptedAt || IN_DELIVERY_STATUSES.has(String(order.status || ""))) {
    return { eligible: false, reason: "driver_assigned" };
  }
  if (PACK_FINISHED_STATUSES.has(String(order.packStatus || ""))) return { eligible: false, reason: "pack_already_finished" };
  return { eligible: true, reason: "ok" };
}

export function buildStoreRouteToPackPatch(order = {}, { now = new Date().toISOString(), actor = {} } = {}) {
  const classification = classifyStoreRouteOrderForMigration(order);
  if (!classification.eligible) throw new Error(`Order is not eligible for store route migration: ${classification.reason}`);

  const base = initialPreparationStatuses(order.deliveryMethod, "direct_pack");
  const priorStoreStatus = String(order.storeStatus || "pending");
  const priorPackStatus = String(order.packStatus || "");
  const priorQueueStatus = String(order.queueStatus || "");
  const keepPackStatus = ["working", "waiting"].includes(priorPackStatus);
  const reworking = order.reworkRequired === true;

  // returned/blocked/pending ต้องรีเซ็ตเป็น pending เพราะแท็บห้องแพ็คไม่แสดง blocked/returned
  const packStatus = reworking ? "waiting" : keepPackStatus ? priorPackStatus : base.packStatus;
  const patch = {
    workflowType: "direct_pack",
    storeStatus: base.storeStatus,
    packStatus,
    queueStatus: base.queueStatus,
    status: packStatus === "pending" ? base.status : order.status,
    ...(reworking ? { reworkRoute: "direct_pack", reworkStatus: "waiting_pack" } : {}),
    storeRouteMigratedAt: now,
    storeRouteMigratedFrom: "store_route",
    storeRouteMigratedPriorStoreStatus: priorStoreStatus,
    storeRouteMigratedPriorPackStatus: priorPackStatus,
    updatedAt: now
  };
  if (patch.status === undefined) delete patch.status;

  const history = {
    action: STORE_ROUTE_MIGRATION_ACTION,
    role: String(actor?.role || "system").slice(0, 40),
    name: String(actor?.name || "migrate-store-route-to-pack").slice(0, 160),
    uid: String(actor?.uid || "script").slice(0, 160),
    at: now,
    note: "ยกเลิกเส้นทางสโตร์ ย้ายเข้าห้องแพ็คโดยตรง",
    result: "moved_to_pack",
    fromWorkflowType: "store_route",
    toWorkflowType: "direct_pack",
    fromStoreStatus: priorStoreStatus,
    toStoreStatus: patch.storeStatus,
    fromPackStatus: priorPackStatus,
    toPackStatus: patch.packStatus,
    fromQueueStatus: priorQueueStatus,
    toQueueStatus: patch.queueStatus
  };
  patch.workflowHistory = [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-99), history];
  return { patch, history };
}

export function diffPatch(order = {}, patch = {}) {
  return Object.entries(patch)
    .filter(([field, to]) => !DIFF_IGNORED_FIELDS.has(field) && JSON.stringify(order?.[field]) !== JSON.stringify(to))
    .map(([field, to]) => ({ field, from: order?.[field], to }));
}

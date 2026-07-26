import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminDb } = vi.hoisted(() => ({ getAdminDb: vi.fn() }));
vi.mock("../../lib/firebaseAdmin.js", () => ({ getAdminDb }));

import { GET, POST } from "../../app/api/public/order-review/route.js";

function setupDb(order = {}) {
  const state = { order: { id: "DO-1", ...order } };
  const writes = [];
  const orderRef = {
    get: async () => ({ exists: true, id: state.order.id, data: () => ({ ...state.order }) }),
    collection: () => ({ doc: () => ({ id: "review-1" }) })
  };
  const db = {
    state,
    writes,
    collection: () => ({ doc: () => orderRef }),
    runTransaction: async (callback) => callback({
      get: async () => ({ exists: true, id: state.order.id, data: () => ({ ...state.order }) }),
      create: (_ref, value) => writes.push({ type: "create", value }),
      set: (_ref, value) => {
        writes.push({ type: "set", value });
        state.order = { ...state.order, ...value };
      }
    })
  };
  getAdminDb.mockReturnValue(db);
  return db;
}

const completeOrder = {
  customerName: "ร้านกาแฟ",
  status: "ส่งสำเร็จ",
  deliveryCompleteness: "complete",
  driverId: "driver-1",
  driverName: "คนขับหนึ่ง",
  deliveredAt: "2026-07-26T10:00:00.000Z",
  deliveryAttemptNumber: 1
};

describe("public order review route", () => {
  beforeEach(() => getAdminDb.mockReset());

  it("loads an eligible order without exposing private customer fields", async () => {
    setupDb({ ...completeOrder, customerPhone: "0812345678", address: "secret" });
    const response = await GET(new Request("https://delivery.example/api/public/order-review?t=HKO2%7CDO-1"));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ orderId: "DO-1", customerName: "ร้านกาแฟ", driverName: "คนขับหนึ่ง" });
    expect(json.data).not.toHaveProperty("customerPhone");
    expect(json.data).not.toHaveProperty("address");
  });

  it("rejects an order before delivery", async () => {
    setupDb({ status: "กำลังส่ง", driverId: "driver-1", driverName: "คนขับหนึ่ง" });
    const response = await GET(new Request("https://delivery.example/api/public/order-review?t=HKO2%7CDO-1"));
    expect(response.status).toBe(409);
  });

  it("accepts an incomplete delivery review and mirrors the latest review", async () => {
    const db = setupDb({
      status: "ติดปัญหา",
      deliveryCompleteness: "incomplete",
      lastDeliveryDriverId: "driver-1",
      lastDeliveryDriverName: "คนขับหนึ่ง",
      lastDeliveryAt: "2026-07-26T10:00:00.000Z",
      deliveryAttemptNumber: 1
    });
    const response = await POST(new Request("https://delivery.example/api/public/order-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "HKO2|DO-1", rating: 2, feedback: "ของไม่ครบ" })
    }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.latestReview).toMatchObject({ rating: 2, driverName: "คนขับหนึ่ง", attempt: 1 });
    expect(db.writes.filter((item) => item.type === "create")).toHaveLength(1);
    expect(db.state.order.latestDeliveryReview.feedback).toBe("ของไม่ครบ");
  });

  it("lets a later corrected-delivery review replace the effective review", async () => {
    const db = setupDb({
      ...completeOrder,
      deliveryAttemptNumber: 2,
      deliveryReviewCount: 1,
      latestDeliveryReview: { rating: 2, driverId: "driver-1", driverName: "คนขับหนึ่ง", attempt: 1, submittedAt: "2026-07-26T10:00:00.000Z" }
    });
    const response = await POST(new Request("https://delivery.example/api/public/order-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "HKO2|DO-1", rating: 5, feedback: "ส่งแก้ไขครบแล้ว" })
    }));
    expect(response.status).toBe(200);
    expect(db.state.order.latestDeliveryReview).toMatchObject({ rating: 5, attempt: 2 });
    expect(db.state.order.deliveryReviewCount).toBe(2);
  });
});

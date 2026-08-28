import { describe, expect, it } from "vitest";
import {
  aggregateLatestDriverReviews,
  canReviewOrder,
  createOrderReviewPayload,
  createOrderReviewUrl,
  normalizeOrderReviewInput,
  parseOrderReviewPayload
} from "../../lib/orderReview.js";

describe("order review QR contract", () => {
  it("creates and parses a versioned per-order payload and URL", () => {
    const token = "a".repeat(32);
    const payload = createOrderReviewPayload("DO-20260726-001", token);
    expect(payload).toBe(`HKO3|DO-20260726-001|${token}`);
    expect(parseOrderReviewPayload(payload)).toEqual({ orderId: "DO-20260726-001", token });
    const url = createOrderReviewUrl("https://delivery.example", "DO-20260726-001", token);
    expect(url).toContain(`/order-review?t=HKO3%7CDO-20260726-001%7C${token}`);
    expect(parseOrderReviewPayload(url)).toEqual({ orderId: "DO-20260726-001", token });
  });

  it("rejects malformed payloads and order IDs", () => {
    expect(() => createOrderReviewPayload("bad/order", "a".repeat(32))).toThrow("Invalid order ID");
    expect(() => createOrderReviewPayload("DO-1", "short")).toThrow("Invalid order review token");
    expect(() => parseOrderReviewPayload("HKO2|DO-1")).toThrow("Invalid order review QR payload");
    expect(() => parseOrderReviewPayload("HKO1|DO-1")).toThrow("Invalid order review QR payload");
    expect(() => parseOrderReviewPayload("HKO2|bad/order")).toThrow("Invalid order review QR payload");
  });
});

describe("order review eligibility and input", () => {
  it("allows complete and incomplete delivery attempts", () => {
    expect(canReviewOrder({ status: "ส่งสำเร็จ", driverId: "driver-1", driverName: "หนึ่ง", deliveredAt: "2026-07-26T10:00:00Z" })).toBe(true);
    expect(canReviewOrder({ status: "ติดปัญหา", deliveryCompleteness: "incomplete", lastDeliveryDriverId: "driver-1", lastDeliveryAt: "2026-07-26T10:00:00Z" })).toBe(true);
    expect(canReviewOrder({ status: "กำลังส่ง", driverId: "driver-1" })).toBe(false);
  });

  it("normalizes a 1-5 rating and bounds feedback", () => {
    expect(normalizeOrderReviewInput({ rating: "5", feedback: "  ดีมาก  " })).toEqual({ rating: 5, feedback: "ดีมาก" });
    expect(() => normalizeOrderReviewInput({ rating: 0 })).toThrow("Rating must be an integer from 1 to 5");
    expect(() => normalizeOrderReviewInput({ rating: 6 })).toThrow("Rating must be an integer from 1 to 5");
  });
});

describe("latest review aggregation", () => {
  it("counts only the latest mirrored review per order", () => {
    const rows = aggregateLatestDriverReviews([
      {
        id: "O-1",
        latestDeliveryReview: { rating: 5, driverId: "driver-1", driverName: "หนึ่ง", feedback: "ครบ", submittedAt: "2026-07-26T11:00:00Z" }
      },
      {
        id: "O-2",
        latestDeliveryReview: { rating: 3, driverId: "driver-1", driverName: "หนึ่ง", feedback: "รอบแรก", submittedAt: "2026-07-26T10:00:00Z" }
      },
      {
        id: "O-3",
        latestDeliveryReview: { rating: 4, driverId: "driver-2", driverName: "สอง", feedback: "ดี", submittedAt: "2026-07-26T10:00:00Z" }
      }
    ]);
    expect(rows).toMatchObject([
      { id: "driver-1", count: 2, average: 4, latestFeedback: "ครบ" },
      { id: "driver-2", count: 1, average: 4, latestFeedback: "ดี" }
    ]);
  });
});

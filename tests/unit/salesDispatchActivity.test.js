import { describe, expect, it } from "vitest";
import { isSalesDispatchActivityOnDate } from "../../lib/salesDispatchActivity.js";

const TODAY = "2026-08-21";

describe("Sales dispatch activity date", () => {
  it("shows an older order in the Sales queue on the date it was queued", () => {
    expect(isSalesDispatchActivityOnDate({
      createdAt: "2026-08-19T01:00:00.000Z",
      status: "รอคนขับรับ",
      queueStatus: "queued",
      driverQueueDate: TODAY,
      queuedAt: "2026-08-21T02:06:06.572Z"
    }, TODAY)).toBe(true);
  });

  it("shows accepted and delivered work on the date of the delivery event", () => {
    expect(isSalesDispatchActivityOnDate({
      createdAt: "2026-08-19T01:00:00.000Z",
      status: "กำลังส่ง",
      acceptedAt: "2026-08-21T01:23:58.689Z"
    }, TODAY)).toBe(true);
    expect(isSalesDispatchActivityOnDate({
      createdAt: "2026-08-19T01:00:00.000Z",
      status: "ส่งสำเร็จ",
      deliveredAt: "2026-08-21T02:05:08.012Z"
    }, TODAY)).toBe(true);
  });

  it("does not show delivery activity from another date", () => {
    expect(isSalesDispatchActivityOnDate({
      status: "รอคนขับรับ",
      queueStatus: "queued",
      driverQueueDate: "2026-08-20"
    }, TODAY)).toBe(false);
  });
});

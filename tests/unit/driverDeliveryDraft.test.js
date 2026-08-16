import { describe, expect, it } from "vitest";
import { removeDriverPodPhoto, shouldShowDriverOrderReviewQr } from "../../lib/driverDeliveryDraft";

describe("driver delivery draft", () => {
  it("removes only the selected POD photo so the driver can retake a mistaken shot", () => {
    expect(removeDriverPodPhoto(
      ["wrong-shop.jpg", "correct-shop.jpg"],
      ["blob:wrong-shop", "blob:correct-shop"],
      0
    )).toEqual({
      files: ["correct-shop.jpg"],
      previews: ["blob:correct-shop"]
    });
  });

  it("shows the review QR only while the order is still active", () => {
    expect(shouldShowDriverOrderReviewQr({ status: "กำลังจัดส่ง", queueStatus: "queued" })).toBe(true);
    expect(shouldShowDriverOrderReviewQr({ status: "ส่งสำเร็จ", queueStatus: "completed" })).toBe(false);
  });
});

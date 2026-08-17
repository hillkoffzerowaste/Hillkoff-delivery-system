import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { removeDriverPodPhoto, shouldShowDriverOrderReviewQr } from "../../lib/driverDeliveryDraft";

const pageSource = await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8");

describe("driver delivery completion has no dead end", () => {
  it("counts POD photos from saved order data, not only this session's previews", () => {
    // preview หายเมื่อรีโหลด ถ้าปุ่มจบงานดูแค่ preview ออเดอร์จะปิดไม่ได้หลังสลับแอป
    expect(pageSource).toContain("const driverPodPhotoCount = (order) =>");
    expect(pageSource).toContain("Number(order.podPhotoCount) || 0");
    expect(pageSource).toContain("driverPodPhotoCount(order) > 0 && !order.sharedToLine");
    expect(pageSource).not.toContain('(podPreviewsByOrder[order.id] || []).length > 0 && !order.sharedToLine');
  });

  it("always leaves a way to close a job that has no POD photo", () => {
    expect(pageSource).toContain("driverPodPhotoCount(order) === 0 && !order.sharedToLine");
    expect(pageSource).toContain("จบงานโดยไม่มีรูป POD");
  });

  it("records the delivery even when the LINE share is cancelled", () => {
    // เดิม catch ของ navigator.share จะ return ออกไปโดยไม่บันทึกอะไรเลย
    expect(pageSource).toContain('shareOutcome = "failed"');
    expect(pageSource).toContain("ยังไม่ได้ส่ง LINE");
    expect(pageSource).not.toContain("ยังไม่ได้บันทึกจบงาน");
  });
});

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

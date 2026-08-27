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

  it("holds the job with its photos when the LINE share never went out", () => {
    // เดิมบันทึกจบงานทุกกรณี ประวัติจึงขึ้นส่งสำเร็จทั้งที่รูปไม่ถึงกลุ่ม แล้วรูปก็ถูกล้างจนส่งซ้ำไม่ได้
    expect(pageSource).toContain('shareOutcome = "failed"');
    expect(pageSource).toContain('if (shareOutcome === "failed") {');
    expect(pageSource).toContain("setLineShareHoldByOrder((holds) => ({ ...holds, [order.id]: shareError }))");
    expect(pageSource).toContain("ยังไม่บันทึกจบงาน");
  });

  it("keeps the photos when saving the completion fails", () => {
    // clearPodPhotos อยู่ใน finally ทำให้รูปหายแม้บันทึกไม่สำเร็จ กดส่งซ้ำก็ไม่มีรูปเหลือ
    expect(pageSource).not.toContain("} finally {\n        clearPodPhotos(order.id);");
  });

  it("still leaves an explicit way out when LINE keeps failing", () => {
    expect(pageSource).toContain("บันทึกจบงานโดยยังไม่ส่ง LINE");
    expect(pageSource).toContain("{ skipLineShare: true }");
    expect(pageSource).toContain('shareOutcome = "skipped"');
  });
});

describe("delivered history never rewrites the delivery record", () => {
  it("shares the summary without calling the completion workflow again", () => {
    // driver_complete รับสถานะ "ส่งสำเร็จ" ด้วย กดแชร์จากประวัติจึงเพิ่ม deliveryAttemptNumber
    // และคำนวณ snapshot รถใหม่จากวันที่กด ทับรถที่ใช้ส่งจริงของวันนั้น
    expect(pageSource).toContain("const shareCompletedOrderSummary = (order) => {");
    expect(pageSource).toContain("onClick={() => shareCompletedOrderSummary(order)}");
    expect(pageSource).not.toContain("onClick={() => shareOrderToLine(order)}");
  });

  it("keeps one derived delivered list instead of recomputing it per render block", () => {
    expect(pageSource).toContain("const driverDeliveredOrders = (orders || []).filter(");
    expect(pageSource).not.toContain('const deliveredAll = orders.filter(o => o.driverId === driverId');
  });
});

describe("pending-order buttons reflect the in-flight save", () => {
  it("drives disabled state from state, not from the ref that never re-renders", () => {
    expect(pageSource).toContain("const [pendingOrderUpdateIds, setPendingOrderUpdateIds] = useState([]);");
    expect(pageSource).toContain("disabled={isOrderUpdatePending(order.id)}");
    expect(pageSource).not.toContain("disabled={pendingOrderUpdatesRef.current.has(order.id)}");
  });
});

describe("driver new-order inbox stays out of the way", () => {
  it("collapses the inbox by default only when the driver already has jobs in hand", () => {
    expect(pageSource).toContain("const driverInboxExpanded = driverInboxOpen ?? driverDeliveryOrders.length === 0;");
  });

  it("keeps the delivered-history panel collapsed until the driver opens it", () => {
    expect(pageSource).toContain("const [driverHistoryOpen, setDriverHistoryOpen] = useState(false);");
    expect(pageSource).toContain("{driverHistoryOpen && (<>");
  });

  it("shows the pending count as a red badge on both the tab and the collapsed header", () => {
    expect(pageSource).toContain("มีออเดอร์ใหม่รอรับ ${driverInboxOrders.length} งาน");
    expect(pageSource).toContain("มีออเดอร์ใหม่รอรับ ${pending.length} งาน");
    expect(pageSource).toContain("ในนั้นเป็นงานเร่งด่วนส่งตรงคนขับ ${driverInboxUrgentCount} งาน");
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

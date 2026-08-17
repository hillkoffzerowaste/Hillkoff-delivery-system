import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OrderReviewQrCode from "../../app/components/OrderReviewQrCode.jsx";

describe("order review QR", () => {
  it("renders a QR payload bound to one order", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-001" />);
    expect(html).toContain("data-review-qr-payload=\"HKO2|DO-20260726-001\"");
    expect(html).toContain("ลูกค้าสแกนเพื่อให้คะแนนคนขับ");
  });

  it("stays folded until the driver opens it, so the order card stays short", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-003" />);
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).toContain("กดเพื่อแสดง");
    // แผงถูกซ่อนไว้ และยังไม่สร้างภาพ QR จนกว่าจะกดเปิด
    expect(html).toContain("hidden=\"\"");
    expect(html).not.toContain("<img");
  });

  it("ties the toggle to the panel it controls", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-004" />);
    const controls = html.match(/aria-controls="([^"]+)"/);
    expect(controls).not.toBeNull();
    expect(html).toContain(`id="${controls[1]}"`);
  });

  it("does not render the review QR after delivery is completed", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-002" delivered />);
    expect(html).toBe("");
  });
});

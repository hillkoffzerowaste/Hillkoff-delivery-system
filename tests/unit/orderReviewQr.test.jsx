import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OrderReviewQrCode from "../../app/components/OrderReviewQrCode.jsx";

describe("order review QR", () => {
  it("renders a QR payload bound to one order", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-001" />);
    expect(html).toContain("data-review-qr-payload=\"HKO2|DO-20260726-001\"");
    expect(html).toContain("ลูกค้าสแกนเพื่อให้คะแนนคนขับ");
  });

  it("does not render the review QR after delivery is completed", () => {
    const html = renderToStaticMarkup(<OrderReviewQrCode orderId="DO-20260726-002" delivered />);
    expect(html).toBe("");
  });
});

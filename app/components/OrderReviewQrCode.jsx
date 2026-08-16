"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createOrderReviewPayload, createOrderReviewUrl } from "../../lib/orderReview";

const qrOptions = { errorCorrectionLevel: "H", margin: 3, width: 220 };

export default function OrderReviewQrCode({ orderId, className = "", delivered = false }) {
  const [imageSrc, setImageSrc] = useState("");
  const payload = createOrderReviewPayload(orderId);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(createOrderReviewUrl(window.location.origin, orderId), qrOptions)
      .then((value) => { if (active) setImageSrc(value); })
      .catch(() => { if (active) setImageSrc(""); });
    return () => { active = false; };
  }, [orderId]);

  if (delivered) return null;

  return (
    <div className={["order-review-qr", className].filter(Boolean).join(" ")} data-review-qr-payload={payload}>
      {imageSrc ? <img src={imageSrc} alt={`QR รีวิวออเดอร์ ${orderId}`} /> : <span>QR: {payload}</span>}
      <small>ลูกค้าสแกนเพื่อให้คะแนนคนขับ</small>
    </div>
  );
}

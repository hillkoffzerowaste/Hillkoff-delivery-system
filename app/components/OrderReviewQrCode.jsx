"use client";

import { useEffect, useId, useState } from "react";
import QRCode from "qrcode";
import { QrCode } from "lucide-react";
import { createOrderReviewPayload, createOrderReviewUrl } from "../../lib/orderReview";

const qrOptions = { errorCorrectionLevel: "H", margin: 3, width: 220 };

export default function OrderReviewQrCode({ orderId, className = "", delivered = false }) {
  const [imageSrc, setImageSrc] = useState("");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const payload = createOrderReviewPayload(orderId);

  // สร้างภาพ QR ตอนคนขับกดเปิดเท่านั้น การ์ดหนึ่งรอบมีหลายสิบออเดอร์
  // ถ้าสร้างล่วงหน้าทุกใบจะเสียแรงเครื่องไปกับ QR ที่ไม่มีใครดู
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    QRCode.toDataURL(createOrderReviewUrl(window.location.origin, orderId), qrOptions)
      .then((value) => { if (active) setImageSrc(value); })
      .catch(() => { if (active) setImageSrc(""); });
    return () => { active = false; };
  }, [orderId, open]);

  if (delivered) return null;

  return (
    <div className={["order-review-qr-box", className].filter(Boolean).join(" ")} data-review-qr-payload={payload}>
      <button
        type="button"
        className="secondary order-review-qr-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <QrCode size={15} className="i-inline" aria-hidden="true" />
        <span>QR รีวิวออเดอร์นี้</span>
        <span className="order-review-qr-hint">{open ? "ซ่อน" : "กดเพื่อแสดง"}</span>
      </button>
      <div className="order-review-qr-panel" id={panelId} hidden={!open}>
        <div className="order-review-qr">
          {imageSrc ? <img src={imageSrc} alt={`QR รีวิวออเดอร์ ${orderId}`} /> : <span>QR: {payload}</span>}
          <small>ลูกค้าสแกนเพื่อให้คะแนนคนขับ</small>
        </div>
        <small className="order-review-qr-note">ลูกค้าสแกนหลังรับสินค้า · กรณีของไม่ครบก็รีวิวได้</small>
      </div>
    </div>
  );
}

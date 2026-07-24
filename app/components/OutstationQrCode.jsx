"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function OutstationQrCode({ payload }) {
  const [imageSrc, setImageSrc] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 132 })
      .then(value => { if (active) setImageSrc(value); })
      .catch(() => { if (active) setImageSrc(""); });
    return () => { active = false; };
  }, [payload]);

  return (
    <div className="outstation-label-qr" data-qr-payload={payload}>
      {imageSrc ? <img src={imageSrc} alt={`QR ${payload}`} /> : <span>QR: {payload}</span>}
    </div>
  );
}

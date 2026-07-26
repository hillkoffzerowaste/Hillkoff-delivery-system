"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createOutstationQrUrl, outstationQrRenderOptions } from "../../lib/outstationQr";

export default function OutstationQrCode({ payload, className = "", caption = "" }) {
  const [imageSrc, setImageSrc] = useState("");

  useEffect(() => {
    let active = true;
    let qrValue = payload;
    try {
      qrValue = createOutstationQrUrl(window.location.origin, payload);
    } catch {}
    QRCode.toDataURL(qrValue, outstationQrRenderOptions)
      .then(value => { if (active) setImageSrc(value); })
      .catch(() => { if (active) setImageSrc(""); });
    return () => { active = false; };
  }, [payload]);

  return (
    <div className={["outstation-label-qr", className].filter(Boolean).join(" ")} data-qr-payload={payload}>
      {imageSrc ? <img src={imageSrc} alt={`QR ${payload}`} /> : <span>QR: {payload}</span>}
      {caption && <small className="outstation-label-qr-caption">{caption}</small>}
    </div>
  );
}

// The qrcode package adds its default color object to the supplied options.
export const HILLKOFF_LINE_URL = "https://page.line.me/769svedb?oat_content=url&openQrModal=true";

export const outstationQrRenderOptions = {
  errorCorrectionLevel: "H",
  margin: 4,
  width: 240
};

export function createOutstationQrUrl(origin, payload) {
  const url = new URL("/outstation-qr", String(origin));
  url.searchParams.set("t", String(payload || ""));
  return url.toString();
}

export function createOutstationCameraScanConfig(qrCodeFormat) {
  return {
    fps: 10,
    qrbox: { width: 280, height: 280 },
    formatsToSupport: [qrCodeFormat]
  };
}

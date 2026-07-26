// The qrcode package adds its default color object to the supplied options.
export const outstationQrRenderOptions = {
  errorCorrectionLevel: "H",
  margin: 4,
  width: 240
};

export function createOutstationCameraScanConfig(qrCodeFormat) {
  return {
    fps: 10,
    qrbox: { width: 280, height: 280 },
    formatsToSupport: [qrCodeFormat]
  };
}

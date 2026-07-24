import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import {
  applyOutstationBoxScan,
  createOutstationQrPayload,
  parseOutstationQrPayload,
  validateOutstationDispatchOrder
} from "../../lib/outstationDispatch.js";
import {
  createOutstationCameraScanConfig,
  outstationQrRenderOptions
} from "../../lib/outstationQr.js";

const actor = { role: "pack", name: "ผู้แพ็ค", uid: "pack-1" };
const now = "2026-07-24T04:00:00.000Z";

describe("outstation QR dispatch", () => {
  it("uses a print-safe QR image and scans only the QR format", () => {
    expect(outstationQrRenderOptions).toEqual({
      errorCorrectionLevel: "H",
      margin: 4,
      width: 240
    });
    expect(createOutstationCameraScanConfig("QR_CODE")).toEqual({
      fps: 10,
      qrbox: { width: 280, height: 280 },
      formatsToSupport: ["QR_CODE"]
    });
  });

  it("creates a QR PNG from the print-safe options", async () => {
    await expect(
      QRCode.toDataURL("HKO1|DO-260724-093803260-B81E54A1|1|1", outstationQrRenderOptions)
    ).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("creates and parses a versioned order-and-box QR payload", () => {
    const payload = createOutstationQrPayload({ orderId: "DO-260724-093803260-B81E54A1", boxIndex: 1, boxTotal: 3 });

    expect(payload).toBe("HKO1|DO-260724-093803260-B81E54A1|1|3");
    expect(parseOutstationQrPayload(payload)).toEqual({ orderId: "DO-260724-093803260-B81E54A1", boxIndex: 1, boxTotal: 3 });
    expect(() => parseOutstationQrPayload("HKO1|bad/order|1|3")).toThrow("Invalid outstation QR payload");
  });

  it("uses the first scan total, records unique boxes, and completes only on the final box", () => {
    const order = { id: "DO-260724-093803260-B81E54A1", deliveryMethod: "outstation", boxes: 1, queueStatus: "outstation_ready", status: "พร้อมส่งขนส่ง" };
    const first = applyOutstationBoxScan(order, { orderId: order.id, boxIndex: 1, boxTotal: 3 }, actor, now);
    const second = applyOutstationBoxScan({ ...order, ...first.patch }, { orderId: order.id, boxIndex: 2, boxTotal: 3 }, actor, now);
    const final = applyOutstationBoxScan({ ...order, ...second.patch }, { orderId: order.id, boxIndex: 3, boxTotal: 3 }, actor, now);

    expect(first).toMatchObject({ duplicate: false, complete: false, scannedCount: 1, expectedCount: 3 });
    expect(first.patch.outstationDispatchBoxTotal).toBe(3);
    expect(second).toMatchObject({ complete: false, scannedCount: 2 });
    expect(final).toMatchObject({ complete: true, scannedCount: 3 });
    expect(final.patch).toMatchObject({ status: "ส่งสำเร็จ", queueStatus: "completed" });
  });

  it("does not count a duplicate scan and rejects a different box total", () => {
    const order = {
      id: "DO-260724-093803260-B81E54A1",
      deliveryMethod: "outstation",
      outstationDispatchBoxTotal: 3,
      outstationDispatchScans: [{ boxIndex: 1, scannedAt: now, scannedBy: "ผู้แพ็ค", scannedByUid: "pack-1", scannedRole: "pack" }]
    };
    const duplicate = applyOutstationBoxScan(order, { orderId: order.id, boxIndex: 1, boxTotal: 3 }, actor, now);

    expect(duplicate).toMatchObject({ duplicate: true, complete: false, scannedCount: 1, expectedCount: 3 });
    expect(duplicate.patch.outstationDispatchScans).toHaveLength(1);
    expect(() => applyOutstationBoxScan(order, { orderId: order.id, boxIndex: 2, boxTotal: 2 }, actor, now)).toThrow("box total does not match");
  });

  it("accepts only outstation orders that are ready for carrier handoff", () => {
    expect(validateOutstationDispatchOrder({ deliveryMethod: "outstation", queueStatus: "outstation_ready" })).toBe(true);
    expect(validateOutstationDispatchOrder({ deliveryMethod: "company_driver", queueStatus: "ready" })).toBe(false);
  });
});

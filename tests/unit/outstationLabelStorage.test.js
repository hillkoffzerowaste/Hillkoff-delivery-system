import { describe, expect, it } from "vitest";
import {
  normalizeIdempotencyKey,
  sanitizePrintJob,
  sanitizePrintStatusPatch,
  sanitizeRecipientRecord,
  sanitizeSenderProfile
} from "../../lib/outstationLabelStorage.js";

const validItem = {
  orderId: "BU003931",
  customerId: "customer-1",
  senderName: "บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)",
  senderAddressLines: ["66 ณช้างเผือก ต.ศรีภูมิ", "อ.เมือง จ.เชียงใหม่ 50200", "โทร.053-213078"],
  recipientName: "คุณวชรี พรหมทอง",
  recipientAddressLines: ["213 หมู่ที่ 5", "ต.น้ำปั้ว อ.เวียงสา", "จ.น่าน 55110"],
  recipientPhone: "081-2957098",
  carrier: "เมล์เขียว",
  trackingCode: "",
  codEnabled: true,
  codAmount: 1250,
  codDetail: "เก็บเงินปลายทาง",
  boxIndex: 1,
  boxTotal: 3,
  boxLabel: "1/3"
};

describe("outstation label persistence validation", () => {
  it("normalizes a sender profile to three aligned lines", () => {
    expect(sanitizeSenderProfile({
      name: " บ.ฮิลล์คอฟฟ์ จำกัด ",
      addressLines: [" บรรทัด 1 ", "บรรทัด 2", "บรรทัด 3", "บรรทัด 4"]
    })).toEqual({ name: "บ.ฮิลล์คอฟฟ์ จำกัด", addressLines: ["บรรทัด 1", "บรรทัด 2", "บรรทัด 3"] });
  });

  it("requires a safe customer key and preserves a recipient address snapshot", () => {
    expect(sanitizeRecipientRecord({
      customerId: "customer-1",
      recipientName: " คุณวชรี ",
      recipientAddressLines: ["บรรทัด 1", "บรรทัด 2"],
      recipientPhone: "081-295-7098"
    })).toMatchObject({
      customerId: "customer-1",
      recipientName: "คุณวชรี",
      recipientAddressLines: ["บรรทัด 1", "บรรทัด 2"],
      recipientPhone: "081-295-7098",
      phoneDigits: "0812957098"
    });
    expect(() => sanitizeRecipientRecord({ customerId: "bad/id", recipientName: "A", recipientAddressLines: ["B"] })).toThrow(/customer/i);
  });

  it("rejects print jobs with inconsistent box labels", () => {
    expect(() => sanitizePrintJob({ idempotencyKey: "print-request-0001", items: [{ ...validItem, boxLabel: "2/3" }] })).toThrow(/box/i);
  });

  it("rejects printable snapshots without sender details", () => {
    expect(() => sanitizePrintJob({ idempotencyKey: "print-request-0001", items: [{ ...validItem, senderName: "" }] })).toThrow(/sender/i);
    expect(() => sanitizePrintJob({ idempotencyKey: "print-request-0001", items: [{ ...validItem, senderAddressLines: [] }] })).toThrow(/sender/i);
  });

  it("creates a safe print job without mutating order workflow fields", () => {
    const job = sanitizePrintJob({
      idempotencyKey: " print-request-0001 ",
      items: [validItem],
      deliveryMethod: "company_driver",
      queueStatus: "completed"
    });

    expect(job.idempotencyKey).toBe("print-request-0001");
    expect(job.items).toHaveLength(1);
    expect(job).not.toHaveProperty("deliveryMethod");
    expect(job).not.toHaveProperty("queueStatus");
  });

  it("accepts only printed, reprinted, or cancelled status patches", () => {
    expect(sanitizePrintStatusPatch({ status: "printed", reason: "" })).toEqual({ status: "printed", reason: "" });
    expect(() => sanitizePrintStatusPatch({ status: "ready" })).toThrow(/status/i);
  });

  it("normalizes idempotency keys into deterministic safe document ids", () => {
    expect(normalizeIdempotencyKey(" Print Request / 001 ")).toBe("print-request-001");
    expect(() => normalizeIdempotencyKey("x")).toThrow(/idempotency/i);
  });
});

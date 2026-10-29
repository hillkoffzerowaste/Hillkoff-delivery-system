import { describe, expect, it } from "vitest";
import { REQUEST_REF_PATTERN } from "../../lib/storeTransfers.js";
import { documentBranchCode, formatDocumentNumber, normalizeStoreSettings, parseDocumentSequence, validateDocumentNumber } from "../../lib/storeSettings.js";

const cfg = { prefix: "STK-TRF", pattern: "yymm", digits: 4, reset: "month" };

describe("STK-TRF + year-month + running number", () => {
  it("formats, validates and parses transfer numbers with a hyphenated prefix", () => {
    expect(formatDocumentNumber({ ...cfg, sequence: 1, serviceDate: "2026-10-29" })).toBe("STK-TRF6910-0001");
    expect(formatDocumentNumber({ ...cfg, sequence: 12, serviceDate: "2027-01-03" })).toBe("STK-TRF7001-0012");
    expect(validateDocumentNumber("stk-trf6910-0007", cfg)).toEqual({ ok: true, number: "STK-TRF6910-0007" });
    expect(validateDocumentNumber("STK-TRF6913-0007", cfg).ok).toBe(false);
    expect(validateDocumentNumber("TR-0007", cfg).ok).toBe(false);
    expect(parseDocumentSequence("STK-TRF6910-0042", cfg)).toBe(42);
  });

  it("keeps a hyphenated prefix in saved settings and still rejects bad ones", () => {
    expect(normalizeStoreSettings({ documents: { transfer: { prefix: "STK-TRF", pattern: "yymm", reset: "month", digits: 4 } } }).documents.transfer).toMatchObject({ prefix: "STK-TRF", pattern: "yymm", reset: "month" });
    expect(normalizeStoreSettings({ documents: { transfer: { prefix: "STK--TRF" } } }).documents.transfer.prefix).toBe("TR");
    expect(normalizeStoreSettings({ documents: { transfer: { prefix: "STK-TRF-" } } }).documents.transfer.prefix).toBe("TR");
  });

  it("reads the branch from branch-pattern numbers even when the prefix has a hyphen", () => {
    expect(documentBranchCode("STK-AU-WH-0003", { prefix: "STK-AU", pattern: "branch", digits: 4 })).toBe("WH");
    expect(documentBranchCode("STK-AU6910-0003", { prefix: "STK-AU", pattern: "yymm", digits: 4 })).toBe("");
  });

  it("accepts transfer request references in the same company format", () => {
    expect(REQUEST_REF_PATTERN.test("STK-TRF6910-0001")).toBe(true);
    expect(REQUEST_REF_PATTERN.test("RQ-0395")).toBe(true);
    expect(REQUEST_REF_PATTERN.test("STK-TRF6913-0001")).toBe(false);
    expect(REQUEST_REF_PATTERN.test("STK-TRF-0001")).toBe(false);
  });
});

describe("free-form prefixes", () => {
  it("accepts letters, digits and several hyphen parts up to 15 characters", () => {
    const keep = (prefix) => normalizeStoreSettings({ documents: { audit: { prefix } } }).documents.audit.prefix;
    expect(keep("STK-AUD")).toBe("STK-AUD");
    expect(keep("WH1-STK-AU")).toBe("WH1-STK-AU");
    expect(keep("1AU")).toBe("AU");
    expect(keep("STK_AU")).toBe("AU");
    expect(keep("ABCDEFGHIJKLMNOP")).toBe("AU");
    expect(formatDocumentNumber({ prefix: "WH1-AU", pattern: "yymm", digits: 4, sequence: 3, serviceDate: "2026-10-29" })).toBe("WH1-AU6910-0003");
    expect(parseDocumentSequence("WH1-AU6910-0003", { prefix: "WH1-AU", pattern: "yymm", digits: 4 })).toBe(3);
  });
});

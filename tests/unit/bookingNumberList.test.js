import { describe, expect, it } from "vitest";
import { normalizeBookingNumberList, parseBookingNumberList } from "../../lib/bookingRegistry.js";

describe("normalizeBookingNumberList", () => {
  it("normalizes entries to uppercase and trims whitespace", () => {
    expect(normalizeBookingNumberList(["csp-1234", "  CSR-5678  "])).toEqual(["CSP-1234", "CSR-5678"]);
  });

  it("deduplicates stably — first occurrence wins, later duplicates dropped", () => {
    expect(normalizeBookingNumberList(["CSP-1234", "CSR-5678", "CSP-1234"])).toEqual(["CSP-1234", "CSR-5678"]);
  });

  it("treats case-normalized duplicates as identical", () => {
    expect(normalizeBookingNumberList(["csp-1234", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("preserves insertion order of first appearances", () => {
    expect(normalizeBookingNumberList(["CSR-9999", "CSP-1234", "TSR-0001"])).toEqual(["CSR-9999", "CSP-1234", "TSR-0001"]);
  });

  it("rejects entries with fewer than 4 digits", () => {
    expect(normalizeBookingNumberList(["CSP-123", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("rejects entries with more than 4 digits", () => {
    expect(normalizeBookingNumberList(["CSP-12345", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("rejects empty strings", () => {
    expect(normalizeBookingNumberList(["", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("rejects entries missing a prefix (dash-only prefix)", () => {
    expect(normalizeBookingNumberList(["-1234", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("rejects entries with no separator", () => {
    expect(normalizeBookingNumberList(["CSP1234", "CSP-1234"])).toEqual(["CSP-1234"]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeBookingNumberList([])).toEqual([]);
  });

  it("add semantics — appends a new number after existing list", () => {
    const existing = ["CSP-1234"];
    expect(normalizeBookingNumberList([...existing, "CSR-5678"])).toEqual(["CSP-1234", "CSR-5678"]);
  });

  it("allows same 4-digit suffix with different prefix — no false dedup", () => {
    expect(normalizeBookingNumberList(["CSP-1234", "CSR-1234"])).toEqual(["CSP-1234", "CSR-1234"]);
  });

  it("add semantics — does not add already-present number (idempotent)", () => {
    const existing = ["CSP-1234", "CSR-5678"];
    expect(normalizeBookingNumberList([...existing, "CSP-1234"])).toEqual(["CSP-1234", "CSR-5678"]);
  });

  it("remove semantics — filtering drops exactly that entry, order preserved", () => {
    const list = ["CSP-1234", "CSR-5678", "TSR-0001"];
    expect(normalizeBookingNumberList(list.filter((v) => v !== "CSR-5678"))).toEqual(["CSP-1234", "TSR-0001"]);
  });
});

describe("parseBookingNumberList", () => {
  it("returns ok:true with normalized items for all-valid input", () => {
    expect(parseBookingNumberList(["CSP-1234", "CSR-5678"])).toEqual({ ok: true, error: null, items: ["CSP-1234", "CSR-5678"] });
  });

  it("rejects an array mixing a valid entry with a malformed one — entire request fails", () => {
    const result = parseBookingNumberList(["CSP-1234", "INVALID"]);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.items).toBeNull();
  });

  it("rejects an empty string entry even alongside a valid entry", () => {
    const result = parseBookingNumberList(["CSP-1234", ""]);
    expect(result.ok).toBe(false);
    expect(result.items).toBeNull();
  });

  it("allows duplicate entries — silently deduplicates, does not error", () => {
    const result = parseBookingNumberList(["CSP-1234", "CSP-1234"]);
    expect(result.ok).toBe(true);
    expect(result.items).toEqual(["CSP-1234"]);
  });

  it("allows case-normalized duplicates — deduplicates, does not error", () => {
    const result = parseBookingNumberList(["csp-1234", "CSP-1234"]);
    expect(result.ok).toBe(true);
    expect(result.items).toEqual(["CSP-1234"]);
  });

  it("rejects lists longer than 20 entries", () => {
    const over = Array.from({ length: 21 }, (_, i) => `CSP-${String(i + 1).padStart(4, "0")}`);
    const result = parseBookingNumberList(over);
    expect(result.ok).toBe(false);
    expect(result.items).toBeNull();
  });

  it("accepts exactly 20 distinct valid entries", () => {
    const exactly20 = Array.from({ length: 20 }, (_, i) => `CSP-${String(i + 1).padStart(4, "0")}`);
    const result = parseBookingNumberList(exactly20);
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(20);
  });

  it("normalizes lowercase input to uppercase", () => {
    const result = parseBookingNumberList(["csp-1234"]);
    expect(result.ok).toBe(true);
    expect(result.items).toEqual(["CSP-1234"]);
  });

  it("returns ok:true with empty items for empty input", () => {
    expect(parseBookingNumberList([])).toEqual({ ok: true, error: null, items: [] });
  });
});

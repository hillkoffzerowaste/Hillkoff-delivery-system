import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactCustomerSearch,
  customerSearchKeys,
  customerSearchRecord,
  customerSearchTerms,
  normalizeCustomerSearch
} from "../../lib/customerSearchIndex.js";
import { driverIdentityPatch, resolveVerifiedDriver } from "../../lib/driverIdentity.js";
import { createOtpCode, hashOtp, isOtpExpired, otpHashesEqual } from "../../lib/otp.js";
import { getDeliverySheetUrl, postToGoogleAppsScript } from "../../lib/googleAppsScript.js";
import { findVehicleById, vehicleDisplayName } from "../../lib/vehicleMaster.js";
import { BOOKING_NUMBER_PATTERN, bookingRegistryId, normalizeBookingNumber } from "../../lib/bookingRegistry.js";

describe("monthly booking registry", () => {
  it("normalizes booking numbers and scopes uniqueness by month", () => {
    expect(normalizeBookingNumber(" csp - 1234 ")).toBe("CSP-1234");
    expect(BOOKING_NUMBER_PATTERN.test("CSP-1234")).toBe(true);
    expect(bookingRegistryId("2026-07-15", "csp-1234")).toBe("2026-07__CSP-1234");
    expect(bookingRegistryId("2026-07-15", "CSR-1234")).toBe("2026-07__CSR-1234");
    expect(bookingRegistryId("2026-07-15", "TSR-1234")).toBe("2026-07__TSR-1234");
    expect(bookingRegistryId("2026-07-15", "CSP-1234")).not.toBe(bookingRegistryId("2026-07-15", "CSR-1234"));
    expect(bookingRegistryId("2026-08-01", "CSP-1234")).toBe("2026-08__CSP-1234");
  });
});

describe("customer search indexing", () => {
  it("normalizes Thai customer data and builds useful prefix/trigram keys", () => {
    const customer = { name: " ร้าน กาแฟ ", phone: "081-234-5678", zone: "เมืองเชียงใหม่" };
    expect(normalizeCustomerSearch(customer.name)).toBe("ร้านกาแฟ");
    expect(compactCustomerSearch("081-234-5678")).toBe("0812345678");
    expect(customerSearchTerms(customer)).toContain("081");
    expect(customerSearchKeys(customer)).toContain("234");
    expect(customerSearchRecord(customer)).toMatchObject({ name: "ร้าน กาแฟ", phoneDigits: "0812345678" });
  });
});

describe("OTP primitives", () => {
  beforeEach(() => { process.env.OTP_SECRET = "test-secret-that-is-longer-than-thirty-two-characters"; });
  afterEach(() => { delete process.env.OTP_SECRET; });

  it("creates six-digit codes and compares keyed hashes safely", () => {
    expect(createOtpCode()).toMatch(/^\d{6}$/);
    const hash = hashOtp("123456", "salt");
    expect(otpHashesEqual(hash, hashOtp("123456", "salt"))).toBe(true);
    expect(otpHashesEqual(hash, hashOtp("654321", "salt"))).toBe(false);
  });

  it("rejects a weak server secret", () => {
    process.env.OTP_SECRET = "short";
    expect(() => hashOtp("123456", "salt")).toThrow(/at least 32/);
    expect(isOtpExpired({ expiresAtMs: Date.now() - 1 })).toBe(true);
  });
});

describe("driver identity", () => {
  it("moves the current UID to the canonical slot and resolves it", async () => {
    const patch = driverIdentityPatch({ uid: "old", legacyUids: ["older", "old"] }, "current");
    expect(patch.uidLast).toBe("current");
    expect(patch.legacyUids).toEqual(["older", "old", "current"]);

    const get = vi.fn().mockResolvedValue({ docs: [{ id: "081", data: () => ({ role: "driver", uidLast: "current" }) }] });
    const db = {
      collection: () => ({
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false }) }),
        where: () => ({ limit: () => ({ get }) })
      })
    };
    expect((await resolveVerifiedDriver(db, { uid: "current" }))?.user?.role).toBe("driver");
    expect(await resolveVerifiedDriver(db, {})).toBeNull();
  });

  it("resolves a fresh login through its deterministic UID and phone documents", async () => {
    const usersByPhoneDoc = { id: "0812345678", exists: true, data: () => ({ role: "driver", uidLast: "fresh", phoneDigits: "0812345678" }) };
    const db = {
      collection: (name) => ({
        doc: (id) => ({
          get: vi.fn().mockResolvedValue(name === "users"
            ? { exists: true, data: () => ({ role: "driver", phoneDigits: "0812345678" }) }
            : usersByPhoneDoc)
        }),
        where: () => ({ limit: () => ({ get: vi.fn() }) })
      })
    };
    expect((await resolveVerifiedDriver(db, { uid: "fresh" }))?.doc?.id).toBe("0812345678");
  });

  it("accepts only a previously verified driver UID from the canonical account", async () => {
    const db = {
      collection: (name) => ({
        doc: () => ({
          get: vi.fn().mockResolvedValue(name === "users"
            ? { exists: true, data: () => ({ role: "driver", phoneDigits: "0812345678", active: true }) }
            : { exists: true, id: "0812345678", data: () => ({ role: "driver", active: true, uidLast: "new", legacyUids: ["old", "new"] }) })
        }),
        where: () => ({ limit: () => ({ get: vi.fn() }) })
      })
    };
    expect((await resolveVerifiedDriver(db, { uid: "old" }))?.user?.uidLast).toBe("new");
  });
});

describe("external adapters", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DAILY_DELIVERY_WEB_APP_URL;
    delete process.env.GOOGLE_SHEETS_WEB_APP_URL;
    delete process.env.GOOGLE_SHEETS_SHARED_SECRET;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("skips an unconfigured Apps Script URL and requires a shared secret", async () => {
    expect(getDeliverySheetUrl()).toBe("");
    await expect(postToGoogleAppsScript("", { action: "test" })).resolves.toMatchObject({ ok: true, skipped: true });
    await expect(postToGoogleAppsScript("https://example.invalid", { action: "test" })).resolves.toMatchObject({ ok: false, skipped: true });
  });

  it("sends the secret server-side and parses the Apps Script result", async () => {
    process.env.GOOGLE_SHEETS_SHARED_SECRET = "server-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { saved: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postToGoogleAppsScript("https://script.example/exec", { action: "test" })).resolves.toMatchObject({ ok: true });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ action: "test", sharedSecret: "server-secret" });
  });
});

describe("vehicle master", () => {
  it("resolves a known vehicle and formats its label", () => {
    const vehicle = findVehicleById("AS541-6101-0001");
    expect(vehicle?.brand).toBe("TOYOTA");
    expect(vehicleDisplayName(vehicle)).toContain("Hillux Revo");
  });
});

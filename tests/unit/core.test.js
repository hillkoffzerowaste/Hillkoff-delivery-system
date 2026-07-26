import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactCustomerSearch,
  customerSearchKeys,
  customerSearchRecord,
  customerSearchTerms,
  normalizeCustomerSearch,
  resolveCustomerRecord
} from "../../lib/customerSearchIndex.js";
import { driverIdentityPatch, resolveVerifiedDriver } from "../../lib/driverIdentity.js";
import { createOtpCode, hashOtp, isOtpExpired, otpHashesEqual } from "../../lib/otp.js";
import { getDeliverySheetUrl, postToGoogleAppsScript } from "../../lib/googleAppsScript.js";
import { findVehicleById, vehicleDisplayName } from "../../lib/vehicleMaster.js";
import { BOOKING_NUMBER_PATTERN, bookingRegistryId, normalizeBookingNumber } from "../../lib/bookingRegistry.js";
import {
  MAX_RECENT_ORDERS_LIMIT,
  REPORT_REFRESH_INTERVALS,
  nextOrdersLimit,
  recentOrdersLimit
} from "../../lib/firestoreReadPolicy.js";
import { authenticatedFetch } from "../../lib/authenticatedFetch.js";
import {
  initialPreparationStatuses,
  driverReworkPatch,
  isChiangmaiPreparationOrder,
  isDriverDeliveryOrder,
  isOutstationOrder,
  isReadyOrderWaitingForDispatch,
  isSalesWaitingAlert,
  isStoreReportVisibleToRole,
  resolvePreparationRoute
} from "../../lib/preparationWorkflow.js";

describe("sales order preparation workflow", () => {
  it("keeps a completed sales order visible while it waits for dispatch across multiple days", () => {
    expect(isReadyOrderWaitingForDispatch({ packStatus: "checked", queueStatus: "ready", driverId: "" })).toBe(true);
    expect(isReadyOrderWaitingForDispatch({ packStatus: "partial", queueStatus: "ready", driverId: "" })).toBe(true);
    expect(isReadyOrderWaitingForDispatch({ packStatus: "checked", queueStatus: "queued", driverId: "" })).toBe(false);
    expect(isReadyOrderWaitingForDispatch({ packStatus: "checked", queueStatus: "ready", driverId: "driver-1" })).toBe(false);
  });

  it("keeps every outstation route out of Chiang Mai preparation", () => {
    expect(isOutstationOrder({ deliveryMethod: "outstation" })).toBe(true);
    expect(isOutstationOrder({ workflowType: "direct_pack", shippingCarrier: "Flash" })).toBe(true);
    expect(isChiangmaiPreparationOrder({ deliveryMethod: "outstation", workflowType: "store_route", queueStatus: "preparing" })).toBe(false);
    expect(isReadyOrderWaitingForDispatch({ deliveryMethod: "outstation", packStatus: "checked", queueStatus: "ready", driverId: "" })).toBe(false);
  });

  it("shows active waiting and incomplete orders to sales but excludes terminal work", () => {
    expect(isSalesWaitingAlert({ workflowType: "store_route", deliveryMethod: "company_driver", storeStatus: "waiting", packStatus: "blocked", queueStatus: "preparing" })).toBe(true);
    expect(isSalesWaitingAlert({ workflowType: "store_route", deliveryMethod: "company_driver", storeStatus: "partial", packStatus: "pending", queueStatus: "preparing" })).toBe(true);
    expect(isSalesWaitingAlert({ workflowType: "store_route", storeStatus: "partial", queueStatus: "completed", status: "ส่งสำเร็จ" })).toBe(false);
  });

  it("defaults outstation to direct pack but preserves an explicit store route", () => {
    expect(resolvePreparationRoute("outstation", "")).toBe("direct_pack");
    expect(resolvePreparationRoute("outstation", "store_route")).toBe("store_route");
    expect(initialPreparationStatuses("outstation", "store_route")).toMatchObject({ workflowType: "store_route", storeStatus: "pending", packStatus: "blocked", queueStatus: "preparing" });
    expect(initialPreparationStatuses("outstation", "direct_pack")).toMatchObject({ workflowType: "direct_pack", storeStatus: "skipped", packStatus: "pending" });
  });

  it("routes incomplete store-route deliveries back through store before pack", () => {
    expect(driverReworkPatch(
      { workflowType: "store_route", deliveryMethod: "company_driver" },
      { name: "คนขับหนึ่ง", driverId: "driver-1" },
      "สินค้าไม่ครบ 1 รายการ",
      "2026-07-26T01:00:00.000Z"
    )).toMatchObject({
      reworkRequired: true,
      reworkRoute: "store_route",
      reworkStatus: "waiting_store",
      storeStatus: "returned",
      packStatus: "blocked",
      queueStatus: "preparing",
      driverId: "",
      reworkNote: "สินค้าไม่ครบ 1 รายการ"
    });
  });

  it("preserves the latest delivery driver when opening incomplete rework", () => {
    expect(driverReworkPatch(
      { workflowType: "store_route", deliveryAttemptNumber: 0 },
      { name: "Driver One", driverId: "driver-1" },
      "Missing one item",
      "2026-07-26T01:00:00.000Z"
    )).toMatchObject({
      deliveryAttemptNumber: 1,
      lastDeliveryDriverId: "driver-1",
      lastDeliveryDriverName: "Driver One",
      lastDeliveryAt: "2026-07-26T01:00:00.000Z"
    });
  });

  it("routes incomplete direct-pack deliveries to pack without store", () => {
    expect(driverReworkPatch(
      { workflowType: "direct_pack", deliveryMethod: "company_driver" },
      { name: "คนขับหนึ่ง", driverId: "driver-1" },
      "ขาดกาแฟ 2 ถุง",
      "2026-07-26T01:00:00.000Z"
    )).toMatchObject({
      reworkRequired: true,
      reworkRoute: "direct_pack",
      reworkStatus: "waiting_pack",
      storeStatus: "skipped",
      packStatus: "waiting",
      queueStatus: "preparing",
      driverId: "",
      reworkNote: "ขาดกาแฟ 2 ถุง"
    });
  });

  it("requires a clear driver note before creating incomplete rework", () => {
    expect(() => driverReworkPatch(
      { workflowType: "store_route" },
      { name: "คนขับหนึ่ง" },
      "   "
    )).toThrow(/note/i);
  });

  it("keeps rework orders visible in the sales waiting alert", () => {
    expect(isSalesWaitingAlert({
      workflowType: "store_route",
      status: "ติดปัญหา",
      queueStatus: "preparing",
      reworkRequired: true,
      storeStatus: "returned",
      packStatus: "blocked"
    })).toBe(true);
  });

  it("removes a delivered order from the driver's active delivery list", () => {
    expect(isDriverDeliveryOrder({ driverId: "driver-1", status: "กำลังส่ง", queueStatus: "queued" }, "driver-1")).toBe(true);
    expect(isDriverDeliveryOrder({ driverId: "driver-1", status: "กำลังจัดส่ง", queueStatus: "queued" }, "driver-1")).toBe(true);
    expect(isDriverDeliveryOrder({ driverId: "driver-1", status: "ส่งสำเร็จ", queueStatus: "completed" }, "driver-1")).toBe(false);
    expect(isDriverDeliveryOrder({ driverId: "driver-2", status: "กำลังส่ง", queueStatus: "queued" }, "driver-1")).toBe(false);
  });

  it("keeps a booking report visible to pack even when it is linked to a sales order", () => {
    const report = {
      type: "booking",
      bookingNumber: "CSP-1112",
      registryShared: true,
      linkedOrderId: "order-1112",
      confirmedAt: "2026-07-23T03:00:00.000Z",
      packStatus: "pending"
    };
    expect(isStoreReportVisibleToRole(report, "store")).toBe(true);
    expect(isStoreReportVisibleToRole(report, "pack")).toBe(true);
    expect(isStoreReportVisibleToRole({ ...report, deletedAt: "2026-07-23T04:00:00.000Z" }, "pack")).toBe(false);
  });
});

describe("authenticated API requests", () => {
  it("adds a fresh bearer token and retries once when the API reports missing authorization", async () => {
    const getToken = vi.fn()
      .mockResolvedValueOnce("first-token")
      .mockResolvedValueOnce("second-token");
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "Missing authorization token" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await authenticatedFetch("/api/store/reports", { method: "POST" }, { getToken, fetchImpl });

    expect(response.status).toBe(200);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer first-token");
    expect(fetchImpl.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer second-token");
  });
});

describe("Firestore read policy", () => {
  it("keeps realtime order windows bounded and gives drivers a smaller operational history", () => {
    expect(recentOrdersLimit(20, "sales")).toBe(100);
    expect(recentOrdersLimit(20, "driver")).toBe(200);
    expect(recentOrdersLimit(5000, "sales")).toBe(MAX_RECENT_ORDERS_LIMIT);
  });

  it("loads older orders in bounded steps", () => {
    expect(nextOrdersLimit(20)).toBe(200);
    expect(nextOrdersLimit(200)).toBe(400);
    expect(nextOrdersLimit(MAX_RECENT_ORDERS_LIMIT)).toBe(MAX_RECENT_ORDERS_LIMIT);
  });

  it("uses conservative visibility-aware report refresh intervals", () => {
    expect(REPORT_REFRESH_INTERVALS.issues).toBe(300_000);
    expect(REPORT_REFRESH_INTERVALS.kpi).toBe(900_000);
    expect(REPORT_REFRESH_INTERVALS.reports).toBe(600_000);
  });
});

describe("monthly booking registry", () => {
  it("normalizes booking numbers and scopes uniqueness by month", () => {
    expect(normalizeBookingNumber(" csp - 1234 ")).toBe("CSP-1234");
    expect(BOOKING_NUMBER_PATTERN.test("CSP-1234")).toBe(true);
    expect(bookingRegistryId("2026-07-15", "csp-1234")).toBe("2026-07__CSP-1234");
    expect(bookingRegistryId("2026-07-15", "CSR-1234")).toBe("2026-07__CSR-1234");
    expect(bookingRegistryId("2026-07-15", "TSR-1234")).toBe("2026-07__TSR-1234");
    expect(bookingRegistryId("2026-07-15", "AS2-1234")).toBe("2026-07__AS2-1234");
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

  it("uses a legacy search-index customer when the primary customer record is missing", () => {
    const indexedCustomer = { name: "Legacy Customer", phone: "0812345678" };
    expect(resolveCustomerRecord(null, indexedCustomer)).toBe(indexedCustomer);
    expect(resolveCustomerRecord({ name: "Primary Customer" }, indexedCustomer)).toEqual({ name: "Primary Customer" });
    expect(resolveCustomerRecord(null, { phone: "0812345678" })).toBeNull();
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

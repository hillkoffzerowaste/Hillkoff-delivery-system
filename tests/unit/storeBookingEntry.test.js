import { describe, expect, it } from "vitest";
import {
  isStoreBookingEntryOrder,
  prepareBookingNumberUpdate,
} from "../../lib/storeBookingEntry.js";

describe("prepareBookingNumberUpdate", () => {
  it("returns a normalized primary number and stable add/remove diff", () => {
    expect(prepareBookingNumberUpdate(
      ["csp-1234", "CSR-5678"],
      ["CSR-5678", "TSR-0001", "csp-1234"]
    )).toEqual({
      ok: true,
      error: null,
      current: ["CSP-1234", "CSR-5678"],
      items: ["CSR-5678", "TSR-0001", "CSP-1234"],
      primary: "CSR-5678",
      toAdd: ["TSR-0001"],
      toRemove: [],
    });
  });

  it("rejects malformed entries before any registry mutation", () => {
    const result = prepareBookingNumberUpdate(["CSP-1234"], ["CSP-1234", "INVALID"]);
    expect(result.ok).toBe(false);
    expect(result.items).toBeNull();
    expect(result.toAdd).toBeNull();
  });

  it("uses the legacy bookingNumber when bookingNumbers is absent", () => {
    expect(prepareBookingNumberUpdate("CSR-5678", ["CSR-5678", "TSR-0001"]).current).toEqual(["CSR-5678"]);
  });

  it("rejects clearing all booking numbers", () => {
    const result = prepareBookingNumberUpdate(["CSP-1234"], []);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/อย่างน้อย|valid booking/i);
  });
});

describe("isStoreBookingEntryOrder", () => {
  it("includes active Chiang Mai store-route orders", () => {
    expect(isStoreBookingEntryOrder({ workflowType: "store_route", deliveryMethod: "company_driver", queueStatus: "preparing" })).toBe(true);
  });

  it("excludes pickup, outstation, completed, and archived orders", () => {
    expect(isStoreBookingEntryOrder({ workflowType: "store_route", deliveryMethod: "grab_pickup", queueStatus: "preparing" })).toBe(false);
    expect(isStoreBookingEntryOrder({ workflowType: "direct_pack", deliveryMethod: "company_driver", queueStatus: "preparing" })).toBe(false);
    expect(isStoreBookingEntryOrder({ workflowType: "store_route", deliveryMethod: "company_driver", queueStatus: "completed" })).toBe(false);
    expect(isStoreBookingEntryOrder({ workflowType: "store_route", deliveryMethod: "company_driver", queueStatus: "pack_archived" })).toBe(false);
  });
});

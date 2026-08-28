import { describe, expect, it } from "vitest";
import { applyCustomerDeliveryDefault, customerDefaultAppliesToTab, customerDefaultDeliveryMethod, defaultDeliveryMethodFromLatestOrder } from "../../lib/customerDeliveryPreference.js";

describe("customer delivery preference", () => {
  it("uses an outstation customer's saved preference while preserving the carrier choice", () => {
    const next = applyCustomerDeliveryDefault({
      deliveryMethod: "company_driver",
      workflowType: "store_route",
      shippingCarrier: "Nim Express",
      shippingCarrierOther: ""
    }, { defaultDeliveryMethod: "outstation" });

    expect(next).toMatchObject({
      deliveryMethod: "outstation",
      workflowType: "direct_pack",
      shippingCarrier: "Nim Express"
    });
  });

  it("defaults older customer records to the company-driver queue", () => {
    expect(customerDefaultDeliveryMethod({})).toBe("company_driver");
  });

  it("does not erase a deliberate direct-pack route when a company-driver customer is selected", () => {
    const next = applyCustomerDeliveryDefault({
      deliveryMethod: "outstation",
      workflowType: "direct_pack",
      shippingCarrier: "Flash",
      shippingCarrierOther: ""
    }, { defaultDeliveryMethod: "company_driver" });

    expect(next).toMatchObject({
      deliveryMethod: "company_driver",
      workflowType: "direct_pack",
      shippingCarrier: "",
      shippingCarrierOther: ""
    });
  });

  it("marks a customer from the latest order rather than an older outstation order", () => {
    expect(defaultDeliveryMethodFromLatestOrder([
      { deliveryMethod: "outstation", updatedAt: "2026-08-01T10:00:00.000Z" },
      { deliveryMethod: "company_driver", createdAt: "2026-08-20T10:00:00.000Z" }
    ])).toBe("company_driver");
  });

  it("marks the customer as outstation when the latest order is outstation", () => {
    expect(defaultDeliveryMethodFromLatestOrder([
      { deliveryMethod: "company_driver", createdAt: "2026-08-01T10:00:00.000Z" },
      { deliveryMethod: "outstation", updatedAt: "2026-08-20T10:00:00.000Z" }
    ])).toBe("outstation");
  });

  it("applies the customer delivery default in the Sales order form only", () => {
    expect(customerDefaultAppliesToTab("sales")).toBe(true);
    expect(customerDefaultAppliesToTab("pack-work")).toBe(false);
  });
});

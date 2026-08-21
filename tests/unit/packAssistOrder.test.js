import { describe, expect, it } from "vitest";
import { isBlockingPackAssistOrder, packAssistDuplicateMessage, validatePackAssistOrder } from "../../lib/packAssistOrder";

describe("Pack urgent order policy", () => {
  it("allows only a direct Pack route with a company driver", () => {
    expect(() => validatePackAssistOrder({ deliveryMethod: "company_driver", workflowType: "direct_pack" })).not.toThrow();
    expect(() => validatePackAssistOrder({ deliveryMethod: "company_driver", workflowType: "store_route" })).toThrow(/ส่งตรงห้องแพ็ค/);
    expect(() => validatePackAssistOrder({ deliveryMethod: "grab_pickup", workflowType: "direct_pack" })).toThrow(/คนขับบริษัท/);
  });

  it("blocks an unfinished order for the selected customer but ignores finished orders", () => {
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "preparing", status: "รอจัดเตรียมสินค้า" }, "customer-1")).toBe(true);
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "queued", status: "รอคนขับรับ" }, "customer-1")).toBe(true);
    expect(isBlockingPackAssistOrder({ customerId: "customer-1", queueStatus: "completed", status: "ส่งสำเร็จ" }, "customer-1")).toBe(false);
    expect(isBlockingPackAssistOrder({ customerId: "customer-2", queueStatus: "preparing" }, "customer-1")).toBe(false);
  });

  it("tells Pack to wait for an order still being checked by Store", () => {
    expect(packAssistDuplicateMessage({ workflowType: "store_route", storeStatus: "pending" })).toMatch(/สโตร์กำลังตรวจอยู่/);
    expect(packAssistDuplicateMessage({ workflowType: "direct_pack", packStatus: "working" })).toMatch(/ยังดำเนินการอยู่/);
  });
});

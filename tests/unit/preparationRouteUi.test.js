import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = (await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");

describe("preparation route UI in app/page.jsx", () => {
  it("never offers the store route to sales or pack", () => {
    expect(pageSource).not.toContain('<option value="store_route">');
    expect(pageSource).not.toContain("ผ่านสโตร์ก่อน แล้วส่งห้องแพ็ค</option>");
    expect(pageSource).not.toContain("หรือให้สโตร์ตรวจสอบก่อน");
  });

  it("defaults new, reset and rerouted orders to direct_pack", () => {
    const defaults = pageSource.split('workflowType: "direct_pack", deliveryMethod: "company_driver", chiangmaiRoundCode: ""');
    expect(defaults.length - 1).toBe(2);
    expect(pageSource).not.toContain('workflowType: "store_route", deliveryMethod');
    expect(pageSource).not.toContain('workflowType: targetDeliveryMethod === "outstation" ? "direct_pack" : "store_route"');
    expect(pageSource).not.toContain('? "store_route" : order.workflowType');
    expect(pageSource).not.toMatch(/workflowType: "store_route" \}\)\)/);
  });

  it("offers only direct_pack and direct_driver in the confirm and reroute dialogs", () => {
    expect(pageSource).toContain('{rerouteForm.deliveryMethod === "company_driver" && <option value="direct_driver">ส่งตรงคนขับทันที</option>}');
    expect(pageSource).toContain('{pendingOrder.deliveryMethod === "company_driver" && <option value="direct_driver">');
  });

  it("labels legacy store_route orders as old orders", () => {
    expect(pageSource).toContain("ผ่านสโตร์ (ออเดอร์เก่า)");
    expect(pageSource).not.toContain('"ผ่านสโตร์ก่อน" : "ส่งตรงห้องแพ็ค');
  });

  it("hides the store part of the pack pickup chip for skipped store status", () => {
    expect(pageSource).toContain('{order.storeStatus !== "skipped" && <> · สโตร์:');
  });

  it("only renders the pack store-checking strip when there are orders and drops return-to-store", () => {
    expect(pageSource).toContain('displayTab === "pack-work" && packStoreCheckingOrders.length > 0 && <section aria-label="สโตร์กำลังตรวจ"');
    expect(pageSource).not.toContain("พบปัญหา · ส่งกลับสโตร์ตรวจสอบ");
  });

  it("sends the driver rework payload straight to the packing room", () => {
    expect(pageSource).toContain('reworkRoute: "direct_pack",');
    expect(pageSource).toContain('reworkStatus: deliveryCompleteness === "incomplete" ? "waiting_pack" : "",');
  });

  it("removes the dead store-work and store-pickup code but keeps store booking entry", () => {
    for (const dead of ["storeWorkSubtab", "isStoreBookingEntryView", "storeWorkOrders", "storePickupOrders", '"store-work"', '"store-pickup"']) {
      expect(pageSource, dead).not.toContain(dead);
    }
    expect(pageSource).toContain('["store-booking", "store-online"].includes(displayTab)');
    expect(pageSource).toContain("addStoreDraftRow(type)");
    expect(pageSource).toContain("+ เพิ่มรายการ");
  });
});

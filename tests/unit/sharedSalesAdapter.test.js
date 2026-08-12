import { describe, expect, it, vi } from "vitest";
import { createDeliverySalesAdapter } from "../../lib/sharedSalesAdapter.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("delivery host adapter for the shared sales workspace", () => {
  it("maps customer and order reads to the existing authenticated handlers", async () => {
    const apiFetch = vi.fn(async () => jsonResponse({ ok: true, data: [] }));
    const adapter = createDeliverySalesAdapter(apiFetch);

    await adapter.searchCustomers("ร้าน กาแฟ");
    await adapter.getOrder("O-1");

    expect(apiFetch.mock.calls[0][0]).toBe("/api/customers/search?q=%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%99+%E0%B8%81%E0%B8%B2%E0%B9%81%E0%B8%9F");
    expect(apiFetch.mock.calls[1][0]).toBe("/api/orders/search?id=O-1");
  });

  it("uses the same workflow and Chiang Mai completion handlers as the source app", async () => {
    const apiFetch = vi.fn(async () => jsonResponse({ ok: true, data: { count: 2 } }));
    const adapter = createDeliverySalesAdapter(apiFetch);

    await adapter.rerouteOrder("O-1", { deliveryMethod: "direct_pack", workflowType: "direct_pack" }, "แก้เส้นทาง");
    await adapter.completeChiangmaiOrders(["O-1", "O-2"]);

    expect(apiFetch.mock.calls[0]).toEqual(["/api/orders/workflow", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ orderId: "O-1", action: "reroute", target: { deliveryMethod: "direct_pack", workflowType: "direct_pack" }, reason: "แก้เส้นทาง" }) })]);
    expect(apiFetch.mock.calls[1]).toEqual(["/api/orders/chiangmai-complete", expect.objectContaining({ method: "POST", body: JSON.stringify({ selectedIds: ["O-1", "O-2"] }) })]);
  });

  it("surfaces the upstream business error instead of returning an empty result", async () => {
    const adapter = createDeliverySalesAdapter(async () => jsonResponse({ ok: false, error: "Order changed concurrently" }, 409));
    await expect(adapter.deleteOrder("O-1")).rejects.toThrow("Order changed concurrently");
  });
});

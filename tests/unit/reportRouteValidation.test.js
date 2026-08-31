import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "sales-1", role: "sales" }, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/vehicleRepository.js", () => ({ listVehicles: async () => [] }));

function queryWithRows(count) {
  const docs = Array.from({ length: count }, (_, index) => ({ id: `row-${index}`, data: () => ({}) }));
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({ docs, size: docs.length })
  };
  return query;
}

function request(path, body) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body
  });
}

describe("report route input and result bounds", () => {
  beforeEach(() => {
    state.db = { collection: () => queryWithRows(0) };
  });

  it("returns 400 for malformed JSON instead of reporting a server failure", async () => {
    const [{ POST: reportRange }, { POST: dispatch }, { POST: vehicleReport }] = await Promise.all([
      import("../../app/api/orders/report-range/route.js"),
      import("../../app/api/orders/dispatch-dashboard/route.js"),
      import("../../app/api/vehicle-report/query/route.js")
    ]);

    expect((await reportRange(request("/api/orders/report-range", "{"))).status).toBe(400);
    expect((await dispatch(request("/api/orders/dispatch-dashboard", "{"))).status).toBe(400);
    expect((await vehicleReport(request("/api/vehicle-report/query", "{"))).status).toBe(400);
  });

  it("returns 400 for invalid report dates", async () => {
    const { POST } = await import("../../app/api/orders/report-range/route.js");
    const response = await POST(request("/api/orders/report-range", JSON.stringify({ from: "2026-08-31", to: "2026-08-01" })));

    expect(response.status).toBe(400);
  });

  it("does not return a silently truncated order report", async () => {
    state.db = { collection: () => queryWithRows(5001) };
    const { POST } = await import("../../app/api/orders/report-range/route.js");
    const response = await POST(request("/api/orders/report-range", JSON.stringify({ from: "2026-08-01", to: "2026-08-31" })));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("5,000") });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildChiangmaiRoundGroups,
  isNormalChiangmaiOrder,
  resolveNextRoundDate,
  resolveOptionalChiangmaiRound,
  validateChiangmaiRound
} from "../../lib/preparationWorkflow.js";

describe("Chiang Mai sales rounds", () => {
  it("resolves the next Tuesday, Wednesday and Friday from the created date", () => {
    expect(resolveNextRoundDate("2026-07-26", "tuesday")).toBe("2026-07-28");
    expect(resolveNextRoundDate("2026-07-26", "wednesday")).toBe("2026-07-29");
    expect(resolveNextRoundDate("2026-07-26", "friday")).toBe("2026-07-31");
  });

  it("accepts only one valid round for an active Chiang Mai company-driver order", () => {
    expect(validateChiangmaiRound({ deliveryMethod: "company_driver", queueStatus: "preparing" }, "tuesday")).toBe("tuesday");
    expect(() => validateChiangmaiRound({ deliveryMethod: "outstation" }, "tuesday")).toThrow(/Chiang Mai/i);
    expect(() => validateChiangmaiRound({ deliveryMethod: "company_driver" }, "monday")).toThrow(/round/i);
  });

  it("keeps an empty round as a normal Chiang Mai order", () => {
    const order = { deliveryMethod: "company_driver", queueStatus: "preparing" };
    expect(resolveOptionalChiangmaiRound(order, "")).toBe("");
    expect(isNormalChiangmaiOrder(order)).toBe(true);
    expect(isNormalChiangmaiOrder({ ...order, chiangmaiRoundCode: "tuesday" })).toBe(false);
  });

  it("groups only scheduled orders and exposes selectable ready order ids", () => {
    const groups = buildChiangmaiRoundGroups([
      { id: "NORMAL", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked" },
      { id: "OUTSTATION", deliveryMethod: "outstation", queueStatus: "preparing", packStatus: "checked", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" },
      { id: "READY", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" },
      { id: "WAIT", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "waiting", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      roundCode: "tuesday",
      roundDate: "2026-07-28",
      total: 2,
      ready: 1,
      selectableIds: ["READY"]
    });
    expect(groups[0].orders.map((order) => order.id)).not.toContain("NORMAL");
    expect(groups[0].orders.map((order) => order.id)).not.toContain("OUTSTATION");
  });
});

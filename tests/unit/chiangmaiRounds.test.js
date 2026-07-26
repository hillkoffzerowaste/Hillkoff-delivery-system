import { describe, expect, it } from "vitest";
import { resolveNextRoundDate, validateChiangmaiRound } from "../../lib/preparationWorkflow.js";

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
});

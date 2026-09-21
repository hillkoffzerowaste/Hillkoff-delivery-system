import { describe, expect, it } from "vitest";
import { isAllowedAccountingEmail, isHillkoffEmail } from "../../lib/workflowAuth.js";

describe("accounting authentication policy", () => {
  it("allows any Hillkoff account and rejects other email domains", () => {
    expect(isHillkoffEmail("ACCOUNTING1@HILLKOFF.COM")).toBe(true);
    expect(isAllowedAccountingEmail("accounting1@hillkoff.com")).toBe(true);
    expect(isAllowedAccountingEmail("sales@hillkoff.com")).toBe(true);
    expect(isAllowedAccountingEmail("accounting1@gmail.com")).toBe(false);
  });
});

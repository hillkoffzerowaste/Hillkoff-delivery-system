import { afterEach, describe, expect, it } from "vitest";
import { isApprovedAccountingEmail, isHillkoffEmail } from "../../lib/workflowAuth.js";

describe("accounting authentication policy", () => {
  afterEach(() => { delete process.env.ACCOUNTING_EMAIL_ALLOWLIST; });

  it("requires both the Hillkoff domain and the explicit accounting allowlist", () => {
    process.env.ACCOUNTING_EMAIL_ALLOWLIST = "accounting1@hillkoff.com, finance@hillkoff.com";
    expect(isHillkoffEmail("ACCOUNTING1@HILLKOFF.COM")).toBe(true);
    expect(isApprovedAccountingEmail("accounting1@hillkoff.com")).toBe(true);
    expect(isApprovedAccountingEmail("sales@hillkoff.com")).toBe(false);
    expect(isApprovedAccountingEmail("accounting1@gmail.com")).toBe(false);
  });
});

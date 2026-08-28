import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("google-apps-script/Code.gs", "utf8");
const guide = readFileSync("google-apps-script/README.md", "utf8");

describe("Google Apps Script security boundaries", () => {
  it("requires an authorized dashboard user before exposing dashboard functions", () => {
    expect(source).toContain("requireDashboardAccess();");
    expect(source).toContain("function requireDashboardAccess()");
    expect(guide).not.toContain("**Who has access** to `Anyone with the link`");
  });

  it("neutralizes formula-leading spreadsheet text before writing rows", () => {
    expect(source).toContain("function safeCellText(value)");
    expect(source).toContain("return text(value).replace(/^(\\s*[=+\\-@])/,");
    expect(source).toContain("sheet.getRange(row, 1, 1, DELIVERY_HEADERS.length).setValues([safeSheetRow(rowValues[0])]);");
  });
});

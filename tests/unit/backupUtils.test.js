import { describe, expect, it } from "vitest";
import { generateReport, verifyChecksum } from "../../lib/utils/backupUtils.js";

describe("backup utilities", () => {
  it("reports metadata produced by the current Firebase backup service", () => {
    const report = generateReport({
      timestamp: "2026-08-31T03:00:00.000Z",
      reason: "manual",
      durationMs: 1234,
      collections: { orders: 12 },
      files: { orders: { rows: 12, size: 1024 } },
      totalSize: 1024
    });

    expect(report).toContain("Date: 2026-08-31");
    expect(report).toContain("Duration: 1234 ms");
    expect(report).toContain("orders: 12 rows");
    expect(report).toContain("orders.json: 12 rows, 1 KB");
  });

  it("verifies the SHA-256 checksum it produces", () => {
    expect(verifyChecksum("backup", "54d00d867758cef816bc4685f58e327b949712b07ebd17c3485f3ffc9e9f5133")).toBe(true);
  });
});

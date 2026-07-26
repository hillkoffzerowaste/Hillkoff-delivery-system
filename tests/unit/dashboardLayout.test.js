import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pageSource = await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8");

describe("dashboard layout", () => {
  it("does not render the retired five-card order summary on any page", () => {
    expect(pageSource).not.toContain('title="ออเดอร์วันนี้"');
    expect(pageSource).not.toContain('title="รอคนขับรับ"');
    expect(pageSource).not.toContain('title="กำลังส่ง"');
    expect(pageSource).not.toContain('title="ส่งสำเร็จ"');
    expect(pageSource).not.toContain('title="งานวิ่งวันนี้"');
  });
});

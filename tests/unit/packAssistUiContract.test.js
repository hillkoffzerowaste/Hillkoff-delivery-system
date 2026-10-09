import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.jsx"), "utf8");

describe("Pack native urgent-order UI contract", () => {
  it("keeps the existing customer form available to Pack", () => {
    expect(pageSource).not.toContain('auth.role !== "pack" && <><div className="form-grid two">');
    expect(pageSource).toContain('placeholder="เพิ่มลูกค้าใหม่: ชื่อร้าน/ลูกค้า"');
    expect(pageSource).toContain("onClick={saveCustomer}");
  });

  it("merges an updated existing order instead of adding a duplicate row", () => {
    expect(pageSource).toContain("updatedExisting");
    expect(pageSource).toContain("อัปเดตออเดอร์เดิม");
    expect(pageSource).toContain("ส่งกลับเข้าคิวคนขับ");
  });

  it("renders split Pack work as one group and confirms the group in one action", () => {
    expect(pageSource).toContain('import { groupPackOrders } from "../lib/packOrderGroups";');
    expect(pageSource).toContain("const packWorkOrderGroups = groupPackOrders(packWorkOrders);");
    expect(pageSource).toContain("const updatePreparationWorkflowBatch = async");
    expect(pageSource).toContain("orders: group.orders");
    expect(pageSource).toContain("อัปเดตชุด");
  });
});

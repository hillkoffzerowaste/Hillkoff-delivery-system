import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(process.cwd(), "app/page.jsx"), "utf8");

describe("Driver optional vehicle setup contract", () => {
  it("does not gate entry behind the daily vehicle modal", () => {
    expect(pageSource).not.toContain("const needsDailyVehicleStart");
    expect(pageSource).not.toContain("auth.role === \"driver\" && needsDailyVehicleStart");
    expect(pageSource).not.toContain("ก่อนใช้งานแอพประจำวัน");
  });

  it("keeps manual validation when a driver submits vehicle data or an assessment", () => {
    expect(pageSource).toContain("if (!selectedDriverVehicle?.id)");
    expect(pageSource).toContain("if (!odometerStart || odometerStart <= 0)");
    expect(pageSource).toContain("const submitDailyVehicleStart = async () =>");
    expect(pageSource).toContain("if (missing.length)");
  });

  it("tells drivers that the optional information can be completed later", () => {
    expect(pageSource).toContain("กรอกภายหลัง");
    expect(pageSource).toContain("ไม่บังคับ");
    expect(pageSource).not.toContain("คนขับต้องตรวจสภาพรถและบันทึกแบบประเมินให้ครบ");
  });
});

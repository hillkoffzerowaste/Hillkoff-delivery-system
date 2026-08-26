import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const routeSource = (await readFile(new URL("../../app/api/vehicle-usage/submit/route.js", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const indexes = JSON.parse(await readFile(new URL("../../firestore.indexes.json", import.meta.url), "utf8"));

function hasIndex(collectionGroup, fields) {
  return indexes.indexes.some((index) => index.collectionGroup === collectionGroup
    && index.fields.length === fields.length
    && index.fields.every((field, i) => field.fieldPath === fields[i].fieldPath && field.order === fields[i].order));
}

// query นี้ต้องมี composite index ถึงจะทำงาน ถ้า index หายแต่โค้ดยังอยู่ route จะ error ตอนรันจริง
// เทสต์นี้จึงมัดสองอย่างไว้ด้วยกัน ไม่ให้หลุดจากกัน
describe("vehicle usage previous-event lookup", () => {
  it("orders by serviceDate descending on the server instead of sorting a truncated page in memory", () => {
    expect(routeSource).toContain('.where("vehicleId", "==", vehicleId)');
    expect(routeSource).toContain('.where("serviceDate", "<", serviceDate)');
    expect(routeSource).toContain('.orderBy("serviceDate", "desc")');
    // รูปแบบเดิมที่ดึงมาแล้วเรียงในหน่วยความจำ ต้องไม่กลับมา
    expect(routeSource).not.toContain('.where("vehicleId", "==", vehicleId).limit(100)');
  });

  it("ships the composite index that query requires", () => {
    expect(hasIndex("vehicle_usage_events", [
      { fieldPath: "vehicleId", order: "ASCENDING" },
      { fieldPath: "serviceDate", order: "DESCENDING" }
    ])).toBe(true);
  });

  it("keeps the in-memory tiebreak that the server ordering cannot express", () => {
    // งานหลายรายการในวันเดียวกันยังต้องเลือกอันที่ createdAt ใหม่สุด
    expect(routeSource).toContain("timestampMillis(b.data.createdAt || b.data.updatedAt) - timestampMillis(a.data.createdAt || a.data.updatedAt)");
  });
});

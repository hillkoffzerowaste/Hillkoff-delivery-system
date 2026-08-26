import { describe, expect, it } from "vitest";
import { resolveDeliveryVehicleSnapshot } from "../../lib/operationsReporting.js";

// db ปลอมที่บันทึก where ทุกชั้น และบังคับ limit จริงเหมือน Firestore (ตัดตามลำดับ key ไม่ใช่ตามวันที่)
function createDb(events) {
  const calls = [];
  const makeQuery = (rows) => ({
    where(field, op, value) {
      calls.push({ field, op, value });
      return makeQuery(rows.filter((row) => String(row[field] ?? "") === String(value)));
    },
    limit(n) {
      const limited = rows.slice(0, n);
      return { get: async () => ({ docs: limited.map((row) => ({ id: row.id, data: () => row })) }) };
    }
  });
  return { calls, collection: () => makeQuery(events) };
}

const TODAY = "2026-08-26";

function historicalEvents(count, driverId) {
  // event เก่าของคนขับคนเดียวกัน เรียงมาก่อนงานของวันนี้ตามลำดับ key
  return Array.from({ length: count }, (_, i) => ({
    id: `old-${String(i).padStart(4, "0")}`,
    driverId,
    serviceDate: "2026-01-01",
    vehicleId: "veh-old",
    plate: "OLD-0001"
  }));
}

describe("resolveDeliveryVehicleSnapshot", () => {
  it("filters by serviceDate on the server so a long event history cannot crowd out today's event", async () => {
    const driverId = "driver_0861841717";
    const db = createDb([
      ...historicalEvents(400, driverId),
      { id: "z-today", driverId, serviceDate: TODAY, vehicleId: "veh-today", plate: "กข-1234", vehicleName: "กระบะคันที่ 1" }
    ]);

    const snapshot = await resolveDeliveryVehicleSnapshot(db, { driverId, deliveryServiceDate: TODAY });

    expect(snapshot).toMatchObject({
      deliveryServiceDate: TODAY,
      deliveryVehicleId: "veh-today",
      deliveryVehiclePlate: "กข-1234",
      deliveryVehicleSource: "driver-usage-exact"
    });
    // ต้องกรอง serviceDate ที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่หลังดึงมาแล้ว
    expect(db.calls).toEqual([
      { field: "driverId", op: "==", value: driverId },
      { field: "serviceDate", op: "==", value: TODAY }
    ]);
  });

  it("reports unresolved when the driver logged two different vehicles that day", async () => {
    const driverId = "driver_1";
    const db = createDb([
      { id: "a", driverId, serviceDate: TODAY, vehicleId: "veh-1", plate: "A" },
      { id: "b", driverId, serviceDate: TODAY, vehicleId: "veh-2", plate: "B" }
    ]);

    const snapshot = await resolveDeliveryVehicleSnapshot(db, { driverId, deliveryServiceDate: TODAY });

    expect(snapshot.deliveryVehicleSource).toBe("unresolved");
    expect(snapshot.deliveryVehicleId).toBe("");
  });

  it("reports unresolved when the driver logged nothing that day", async () => {
    const driverId = "driver_1";
    const db = createDb([{ id: "a", driverId, serviceDate: "2026-08-01", vehicleId: "veh-1", plate: "A" }]);

    const snapshot = await resolveDeliveryVehicleSnapshot(db, { driverId, deliveryServiceDate: TODAY });

    expect(snapshot).toMatchObject({ deliveryServiceDate: TODAY, deliveryVehicleSource: "unresolved" });
  });
});

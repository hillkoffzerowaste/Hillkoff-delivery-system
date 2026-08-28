import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, allowedRoles = []) => {
    if (allowedRoles.length && !allowedRoles.includes("driver")) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return { profile: { uid: "uid-1", role: "driver" }, db: state.db, decoded: { uid: "uid-1" } };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function docSnap(id, data) {
  return { id, exists: Boolean(data), data: () => data };
}

function createDb({ driver, vehicles = {} }) {
  return {
    collection(name) {
      if (name === "users") return { doc: (id) => ({ get: async () => docSnap(id, { role: "driver", phoneDigits: "0800000001" }) }) };
      if (name === "users_by_phone") {
        return {
          doc: (id) => ({ get: async () => docSnap(id, driver) }),
          where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) })
        };
      }
      if (name === "vehicle_master") return { doc: (id) => ({ get: async () => docSnap(id, vehicles[id]) }) };
      throw new Error(`unexpected collection ${name}`);
    }
  };
}

async function getLatest() {
  const { GET } = await import("../../app/api/vehicle-usage/latest/route.js");
  const response = await GET(new Request("http://localhost/api/vehicle-usage/latest", {
    headers: { Authorization: "Bearer test" }
  }));
  return { status: response.status, body: await response.json() };
}

const activeDriver = {
  role: "driver",
  active: true,
  uidLast: "uid-1",
  lastVehicleId: "AS541-6101-0001",
  lastVehicleUsedAt: "2026-08-27"
};

describe("รถคันล่าสุดของคนขับ", () => {
  beforeEach(() => {
    state.db = createDb({
      driver: activeDriver,
      vehicles: { "AS541-6101-0001": { assetCode: "AS541-6101-0001", plate: "ยข 6001 ชม", active: true } }
    });
  });

  it("คืนทะเบียนรถคันล่าสุดที่คนขับคนนั้นใช้", async () => {
    const { status, body } = await getLatest();
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, data: { vehicleId: "AS541-6101-0001", plate: "ยข 6001 ชม", usedAt: "2026-08-27" } });
  });

  it("คนขับที่ยังไม่เคยบันทึกเริ่มใช้รถได้ค่าว่าง ไม่ใช่ error", async () => {
    state.db = createDb({ driver: { ...activeDriver, lastVehicleId: "" } });
    const { status, body } = await getLatest();
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, data: null });
  });

  it("รถที่ถูกปิดใช้งานแล้วต้องไม่ถูกเลือกเป็นค่าเริ่มต้น", async () => {
    state.db = createDb({
      driver: activeDriver,
      vehicles: { "AS541-6101-0001": { assetCode: "AS541-6101-0001", plate: "ยข 6001 ชม", active: false } }
    });
    const { body } = await getLatest();
    expect(body.data).toBe(null);
  });
});

describe("จุดที่จำและใช้รถคันล่าสุด", () => {
  it("submit เขียนรถคันล่าสุดกลับไปที่โปรไฟล์คนขับ ไม่ได้เก็บแค่ในเครื่อง", async () => {
    const source = await readFile(new URL("../../app/api/vehicle-usage/submit/route.js", import.meta.url), "utf8");
    expect(source).toContain("lastVehicleId: vehicle.id");
    expect(source).toContain("lastVehicleUsedAt: serviceDate");
  });

  it("ฟอร์มเริ่มใช้รถหาทะเบียนล่าสุดจากรายชื่อรถจริง และไม่ทับค่าที่คนขับเลือกเอง", async () => {
    const source = await readFile(new URL("../../app/page.jsx", import.meta.url), "utf8");
    expect(source).toContain('authenticatedApiFetch("/api/vehicle-usage/latest")');
    expect(source).toContain("if (driverVehiclePickedRef.current) return;");
    expect(source).toContain("availableVehicles.find((vehicle) => vehicle.id === latestDriverVehicleId || vehicle.assetCode === latestDriverVehicleId)");
  });
});

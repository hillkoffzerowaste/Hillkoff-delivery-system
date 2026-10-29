import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDailyReport, personText, teamText } from "../../lib/storeDailyReport.js";
import { buildStoreOverview } from "../../lib/storeOverview.js";
import { resolveDuty, rolesById, validateDuty } from "../../lib/storeDuty.js";

const state = vi.hoisted(() => ({ role: "store", db: null }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: "shared", name: "store", role: state.role }, db: state.db };
  },
  errorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status || 500 })
}));

function makeDb() {
  const docs = new Map();
  const empty = { where: () => empty, limit: () => empty, get: async () => ({ docs: [] }) };
  return {
    docs,
    collection(name) {
      if (name === "users") return empty;
      if (name === "store_settings") return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ staff: [{ id: "staff_s", name: "สุภาพ", active: true }] }) }) }) };
      return { doc: (id) => ({ set: async (value, options) => docs.set(`${name}/${id}`, options?.merge ? { ...docs.get(`${name}/${id}`), ...value } : value) }) };
    }
  };
}

const call = async (method, body) => {
  const route = await import("../../app/api/store/duties/route.js");
  return route[method](new Request("http://localhost/api/store/duties", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
};

beforeEach(() => { state.role = "store"; state.db = makeDb(); });

describe("staff positions and daily duties", () => {
  it("validates a standing role and a single day's duty", () => {
    expect(validateDuty({ scope: "default", staffId: "staff_s", position: " หัวหน้าคลังสินค้า ", area: "" })).toEqual({ ok: true, value: { scope: "default", staffId: "staff_s", position: "หัวหน้าคลังสินค้า", area: "" } });
    expect(validateDuty({ scope: "day", staffId: "staff_s", date: "2026-10-29", area: "ตรวจรับสินค้า" }).ok).toBe(true);
    expect(validateDuty({ scope: "day", staffId: "staff_s", date: "2026-10-29" }).ok).toBe(false);
    expect(validateDuty({ scope: "day", staffId: "staff_s", date: "2026-02-30", position: "x" }).ok).toBe(false);
    expect(validateDuty({ scope: "default", staffId: "staff_s", position: "x".repeat(81) }).ok).toBe(false);
    expect(validateDuty({ scope: "week", staffId: "staff_s", position: "x" }).ok).toBe(false);
  });

  it("lets a day's duty override the standing role for that day only", () => {
    const roles = rolesById([{ id: "staff_s", position: "หัวหน้าคลังสินค้า", area: "" }, { id: "staff_x", position: "", area: "" }]);
    expect(roles).toEqual({ staff_s: { position: "หัวหน้าคลังสินค้า", area: "" } });
    expect(resolveDuty("staff_s", roles, [])).toMatchObject({ position: "หัวหน้าคลังสินค้า", today: false });
    expect(resolveDuty("staff_s", roles, [{ staffId: "staff_s", position: "", area: "นับสต็อกปลายเดือน" }])).toMatchObject({ position: "", area: "นับสต็อกปลายเดือน", today: true, standing: { position: "หัวหน้าคลังสินค้า" } });
    expect(resolveDuty("staff_s", roles, [{ staffId: "staff_s", position: "x", deletedAt: "t" }]).today).toBe(false);
  });

  it("shows the role in the daily report, LINE text and dashboard", () => {
    const roster = [{ uid: "staff_s", name: "สุภาพ" }, { uid: "staff_n", name: "ณัฐ" }];
    const staffRoles = { staff_s: { position: "หัวหน้าคลังสินค้า", area: "" } };
    const duties = [{ date: "2026-10-29", staffId: "staff_n", position: "", area: "ดูแลหน้าร้าน" }, { date: "2026-10-28", staffId: "staff_s", position: "ลา", area: "" }];
    const data = buildDailyReport({ date: "2026-10-29", today: "2026-10-29", roster, reports: [], transfersCreated: [], audits: [], staffRoles, duties });
    const text = teamText({ dateKey: "2026-10-29", rows: data.people, unattributed: data.unattributed });
    const supap = data.people.find((p) => p.uid === "staff_s");
    expect(supap.duty).toMatchObject({ position: "หัวหน้าคลังสินค้า", today: false });
    expect(personText({ dateKey: "2026-10-29", person: { ...supap, logCount: 1 } })).toContain("ตำแหน่ง หัวหน้าคลังสินค้า");
    const nat = data.people.find((p) => p.uid === "staff_n");
    expect(personText({ dateKey: "2026-10-29", person: { ...nat, logCount: 1 } })).toContain("หน้าที่วันนี้ ดูแลหน้าร้าน");
    expect(text).toBe("📋 รายงานการขับเคลื่อนประจำวัน · สโตร์ WH\nวันที่ พฤ. 29 ต.ค. 2569\n\nวันหยุด · ไม่มีการบันทึกงาน");
    const withWork = teamText({ dateKey: "2026-10-29", rows: data.people.map((p) => ({ ...p, booking: 1 })), unattributed: data.unattributed });
    expect(withWork).toContain("สุภาพ (หัวหน้าคลังสินค้า) · 1 งาน");
    expect(withWork).toContain("ณัฐ (ดูแลหน้าร้าน) · 1 งาน");
    const overview = buildStoreOverview({ period: "today", anchorDate: "2026-10-29", roster, staffRoles });
    expect(overview.staff.find((p) => p.uid === "staff_s")).toMatchObject({ position: "หัวหน้าคลังสินค้า" });
  });

  it("stores roles under the roster name and soft-clears a day's duty", async () => {
    expect((await call("PUT", { scope: "default", staffId: "staff_s", position: "หัวหน้าคลังสินค้า", staffName: "ปลอม" })).status).toBe(200);
    expect(state.db.docs.get("store_staff_roles/staff_s")).toMatchObject({ staffName: "สุภาพ", position: "หัวหน้าคลังสินค้า", updatedByUid: "shared" });
    expect((await call("PUT", { scope: "day", staffId: "staff_s", date: "2026-10-29", area: "ตรวจรับสินค้า" })).status).toBe(200);
    expect(state.db.docs.get("store_duties/2026-10-29_staff_s")).toMatchObject({ area: "ตรวจรับสินค้า", deletedAt: "" });
    expect((await call("DELETE", { staffId: "staff_s", date: "2026-10-29" })).status).toBe(200);
    expect(state.db.docs.get("store_duties/2026-10-29_staff_s").deletedAt).toBeTruthy();
    expect((await call("PUT", { scope: "default", staffId: "staff_x", position: "x" })).status).toBe(400);
    state.role = "admin";
    expect((await call("PUT", { scope: "default", staffId: "staff_s", position: "x" })).status).toBe(403);
  });
});

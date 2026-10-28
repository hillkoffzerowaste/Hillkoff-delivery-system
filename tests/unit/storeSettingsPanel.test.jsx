import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StoreSettingsPanel, { moveModule, saveStoreSettings, unlockStoreSettings, validateNewBranch } from "../../app/components/store/StoreSettingsPanel.jsx";
import { STORE_MODULE_IDS, getDefaultStoreSettings } from "../../lib/storeSettings.js";

const apiFetch = async () => new Response(JSON.stringify({ ok: true }));
const render = (props = {}) => renderToStaticMarkup(
  <StoreSettingsPanel apiFetch={apiFetch} settings={getDefaultStoreSettings()} updatedAt="" pin="" onPinChange={() => {}} onSaved={() => {}} {...props} />
);
const jsonResponse = (status, body) => async () => new Response(JSON.stringify(body), { status });

describe("StoreSettingsPanel lock screen", () => {
  it("shows only the PIN prompt while pin is empty", () => {
    const html = render();
    expect(html).toContain("ตั้งค่าสโตร์ · ใส่รหัส PIN เพื่อเข้าใช้งาน");
    expect(html).toContain("ปลดล็อก");
    expect(html).toContain('type="password"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="off"');
    expect(html).not.toContain("บันทึกการตั้งค่า");
    expect(html).not.toContain("ชื่อที่แสดงในเมนู");
    expect(html).not.toContain("หมวดการตั้งค่า");
  });
});

describe("StoreSettingsPanel unlocked", () => {
  const html = render({ pin: "2532" });

  it("renders the header, the three tabs and the save controls", () => {
    expect(html).toContain("ตั้งค่าสโตร์");
    expect(html).toContain("STORE SETTINGS");
    for (const label of ["โมดูล", "สาขา", "หัวเอกสารและรูปแบบ"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toContain("บันทึกการตั้งค่า");
    expect(html).toContain("ยกเลิกการเปลี่ยนแปลง");
    expect(html).not.toContain("ใส่รหัส PIN");
    expect(html).not.toContain("มีการเปลี่ยนแปลงที่ยังไม่บันทึก");
  });

  it("shows all six module names, the group titles and the descriptions", () => {
    expect(STORE_MODULE_IDS).toHaveLength(6);
    for (const name of ["ใบสั่งจอง", "ใบขายออนไลน์", "รายงานประจำวัน", "ใบโอนสินค้า", "Internal Audit", "รายงานแดชบอร์ด"]) {
      expect(html).toContain(`value="${name}"`);
    }
    for (const title of ["โมดูลหลัก", "โมดูลเสริม", "รายงาน"]) expect(html).toContain(`<h3>${title}</h3>`);
    expect(html).toContain("ตรวจนับสต็อก สินค้าตรง / ไม่ตรง และเฉลี่ยต่อวัน");
    expect(html.match(/ชื่อที่แสดงในเมนู/g)).toHaveLength(6);
  });

  it("locks the switches of booking and online only", () => {
    const switchTag = (name) => html.match(new RegExp(`<button[^>]*aria-label="เปิดใช้งาน ${name}"[^>]*>`))[0];
    expect(switchTag("ใบสั่งจอง")).toContain("disabled");
    expect(switchTag("ใบขายออนไลน์")).toContain("disabled");
    expect(switchTag("ใบโอนสินค้า")).not.toContain("disabled");
    expect(switchTag("Internal Audit")).not.toContain("disabled");
    expect(html.match(/ผูกกับห้องแพ็ค · ปิดไม่ได้/g)).toHaveLength(2);
    expect(html).toContain("เปิดเสมอ");
  });

  it("does not offer the phase 2 add-module section nor store-work/pickup modules", () => {
    expect(html).not.toContain("เพิ่มโมดูลใหม่");
    expect(html).not.toContain("เชียงใหม่/ใกล้เคียง");
    expect(html).not.toContain("Grab");
  });

  it("disables moving the first module up and the last module of a group down", () => {
    const tag = (label) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))[0];
    expect(tag("เลื่อน ใบสั่งจอง ขึ้น")).toContain("disabled");
    expect(tag("เลื่อน ใบขายออนไลน์ ลง")).toContain("disabled");
    expect(tag("เลื่อน ใบขายออนไลน์ ขึ้น")).not.toContain("disabled");
    expect(tag("เลื่อน รายงานแดชบอร์ด ลง")).toContain("disabled");
  });

  it("never renders the PIN into the markup", () => {
    expect(html).not.toContain("2532");
  });
});

describe("moveModule", () => {
  const ids = (modules) => modules.map((item) => item.id);

  it("swaps with the neighbour in the same group and renumbers order", () => {
    const moved = moveModule(getDefaultStoreSettings().modules, "store-audit", -1);
    expect(ids(moved)).toEqual(["store-booking", "store-online", "store-dashboard", "store-audit", "store-transfer", "store-overview"]);
    expect(moved.map((item) => item.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("does not move across groups", () => {
    const modules = getDefaultStoreSettings().modules;
    expect(moveModule(modules, "store-booking", -1)).toBe(modules);
    expect(moveModule(modules, "store-online", 1)).toBe(modules);
    expect(moveModule(modules, "store-overview", 1)).toBe(modules);
  });

  it("skips over a module of another group when the order is interleaved", () => {
    const modules = getDefaultStoreSettings().modules;
    const interleaved = ["store-booking", "store-transfer", "store-online", "store-audit", "store-dashboard", "store-overview"]
      .map((id, order) => ({ ...modules.find((item) => item.id === id), order }));
    expect(ids(moveModule(interleaved, "store-booking", 1))).toEqual(["store-online", "store-transfer", "store-booking", "store-audit", "store-dashboard", "store-overview"]);
  });

  it("returns the same list for an unknown id", () => {
    const modules = getDefaultStoreSettings().modules;
    expect(moveModule(modules, "nope", 1)).toBe(modules);
  });
});

describe("validateNewBranch", () => {
  const branches = [{ code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true }];

  it("accepts a valid new branch, case-insensitively and trimmed", () => {
    expect(validateNewBranch(branches, { code: " br04 ", name: " สาขาใหม่ ", type: "สาขา" })).toBe("");
  });

  it.each(["", "A", "ABCDEFG", "BR-4", "สาขา"])("rejects the malformed code %j", (code) => {
    expect(validateNewBranch(branches, { code, name: "x", type: "สาขา" })).toBe("รหัสสาขาต้องเป็นอักษรอังกฤษหรือตัวเลข 2–6 ตัว");
  });

  it("rejects a duplicate code", () => {
    expect(validateNewBranch(branches, { code: "wh", name: "ซ้ำ", type: "สาขา" })).toBe("รหัสสาขา WH มีอยู่แล้ว");
  });

  it("rejects an empty name", () => {
    expect(validateNewBranch(branches, { code: "BR01", name: "  ", type: "สาขา" })).toBe("กรุณาระบุชื่อสาขา");
  });
});

describe("settings requests", () => {
  it("unlocks with POST {pin} and reports a wrong PIN", async () => {
    const fetchMock = vi.fn(jsonResponse(403, { ok: false, error: "รหัส PIN ไม่ถูกต้อง" }));
    const result = await unlockStoreSettings(fetchMock, "0000");
    expect(fetchMock).toHaveBeenCalledWith("/api/store/settings", expect.objectContaining({ method: "POST", body: JSON.stringify({ pin: "0000" }) }));
    expect(result).toMatchObject({ ok: false, status: 403, error: "รหัส PIN ไม่ถูกต้อง" });
    expect((await unlockStoreSettings(jsonResponse(200, { ok: true }), "2532")).ok).toBe(true);
  });

  it("saves with PUT {pin, baseUpdatedAt, settings} and leaves server metadata out", async () => {
    const fetchMock = vi.fn(jsonResponse(200, { ok: true, data: { settings: { version: 1 }, updatedAt: "t2" } }));
    const settings = { ...getDefaultStoreSettings(), updatedAt: "t1", updatedBy: "x", updatedByUid: "u" };
    const result = await saveStoreSettings(fetchMock, { pin: "2532", baseUpdatedAt: "t1", settings });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("PUT");
    const sent = JSON.parse(init.body);
    expect(sent.pin).toBe("2532");
    expect(sent.baseUpdatedAt).toBe("t1");
    expect(sent.settings).not.toHaveProperty("updatedAt");
    expect(sent.settings).not.toHaveProperty("updatedByUid");
    expect(sent.settings.modules).toHaveLength(6);
    expect(result).toMatchObject({ ok: true, status: 200, data: { updatedAt: "t2" } });
  });

  it("surfaces 409 and 400 messages and survives network failures", async () => {
    const conflict = await saveStoreSettings(jsonResponse(409, { ok: false, error: "สาขา WH มีเอกสารอ้างอิงแล้ว ลบไม่ได้ ให้ปิดใช้งานแทน" }), { pin: "2532", baseUpdatedAt: "", settings: {} });
    expect(conflict).toMatchObject({ ok: false, status: 409, error: "สาขา WH มีเอกสารอ้างอิงแล้ว ลบไม่ได้ ให้ปิดใช้งานแทน" });
    const offline = await saveStoreSettings(async () => { throw new Error("offline"); }, { pin: "2532", baseUpdatedAt: "", settings: {} });
    expect(offline).toMatchObject({ ok: false, status: 0 });
    expect(offline.error).toBeTruthy();
  });
});

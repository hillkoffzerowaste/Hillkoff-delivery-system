import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import StoreDailyReport, { copyText } from "../../app/components/store/StoreDailyReport.jsx";

const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: {} }));

describe("StoreDailyReport first render", () => {
  const html = renderToStaticMarkup(<StoreDailyReport apiFetch={apiFetch} settings={{}} />);

  it("shows the heading, the three tabs and the LINE box", () => {
    expect(html).toContain("รายงานการขับเคลื่อนประจำวัน");
    expect(html).toContain("DAILY STORE REPORT");
    expect(html).toContain("ภาพรวมทั้งทีม");
    expect(html).toContain("รายบุคคล");
    expect(html).toContain("วัดผลรายเดือน");
    expect(html).toContain("ข้อความส่งกลุ่ม LINE");
    expect(html).toContain("คัดลอกรายงาน");
    expect(html).toContain("รีเฟรช");
    expect(html).toContain('aria-label="มุมมองรายงาน"');
  });

  it("renders a read-only textarea with the expected id and the team tab selected", () => {
    expect(html).toMatch(/<textarea[^>]*id="line-report-text"[^>]*readOnly|<textarea[^>]*readonly[^>]*id="line-report-text"|<textarea[^>]*id="line-report-text"[^>]*readonly/i);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>ภาพรวมทั้งทีม/);
  });

  it("offers the last seven days with today labelled", () => {
    expect(html).toContain("(วันนี้)");
    const select = html.slice(html.indexOf("<select"), html.indexOf("</select>"));
    expect(select.match(/<option/g)).toHaveLength(7);
  });

  it("does not ship sample data", () => {
    expect(html).not.toContain("ข้อมูลตัวอย่าง");
    expect(html).not.toContain("สโตร์ 1");
  });

  it("uses a custom store label in the description", () => {
    const custom = renderToStaticMarkup(<StoreDailyReport apiFetch={apiFetch} storeLabel="สโตร์ ทดสอบ" />);
    expect(custom).toContain("สรุปงานทั้งหมดของสโตร์ ทดสอบ");
  });
});

describe("copyText", () => {
  it("uses the clipboard when available and skips the fallback", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const execCommand = vi.fn();
    expect(await copyText("สวัสดี", { clipboard, execCommand })).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith("สวัสดี");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to the textarea selection when the clipboard rejects", async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };
    const execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("x", { clipboard, execCommand })).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(1);
  });

  it("falls back when there is no clipboard", async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    expect(await copyText("x", { clipboard: null, execCommand })).toBe(true);
    expect(execCommand).toHaveBeenCalledTimes(1);
  });

  it("returns false when both strategies fail", async () => {
    expect(await copyText("x", { clipboard: null, execCommand: () => false })).toBe(false);
    expect(await copyText("x", { clipboard: { writeText: () => Promise.reject(new Error("no")) }, execCommand: () => { throw new Error("no"); } })).toBe(false);
  });
});

describe("StoreDailyReport.css", () => {
  const css = readFileSync(new URL("../../app/components/store/StoreDailyReport.css", import.meta.url), "utf8");

  it("takes every colour from design tokens", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(/);
  });

  it("prefixes its own classes with sd-", () => {
    const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/\.[a-z][a-z0-9-]*/gi) || [];
    const own = new Set(selectors.filter((name) => !/^\.(store-report-|panel|primary|secondary|muted|num|is-)/.test(name) && !/^\.\d/.test(name)));
    expect([...own].filter((name) => !name.startsWith(".sd-"))).toEqual([]);
  });
});

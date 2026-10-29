import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StorePlanningPanel from "../../app/components/store/StorePlanningPanel.jsx";
describe("store planning interface",()=>{it("offers a calendar and daily and monthly planning",()=>{const html=renderToStaticMarkup(<StorePlanningPanel apiFetch={async()=>{}}/>);expect(html).toContain("ปฏิทินแผนงาน");expect(html).toContain("แผนรายวัน");expect(html).toContain("แผนรายเดือน");expect(html).toContain("เพิ่มแผนงาน");expect(html).toContain('aria-label="เดือนแผนงาน"');});});

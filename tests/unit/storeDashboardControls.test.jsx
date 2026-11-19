import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoreOperationsCenter } from "../../app/components/store/StoreOverviewPanel.jsx";
describe("dashboard filters and planning",()=>{it("offers report categories and the planning calendar tab",()=>{const html=renderToStaticMarkup(<StoreOperationsCenter apiFetch={async()=>{}} settings={{modules:[]}}/>);expect(html).toContain("แผนงานและปฏิทิน");expect(html).toContain("กรองประเภทข้อมูล");expect(html).toContain("ใบสั่งจอง");expect(html).toContain("ใบขายออนไลน์");});});

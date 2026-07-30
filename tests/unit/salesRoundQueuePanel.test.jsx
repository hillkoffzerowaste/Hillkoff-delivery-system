import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SalesRoundQueuePanel from "../../app/components/SalesRoundQueuePanel.jsx";

describe("sales round queue panel", () => {
  it("shows scheduled orders as expandable Sales dashboard sublists and excludes normal orders", () => {
    const html = renderToStaticMarkup(<SalesRoundQueuePanel
      apiFetch={async () => new Response()}
      orders={[
        { id: "NORMAL", customerName: "Normal", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked" },
        { id: "READY", customerName: "Ready", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28", createdAt: "2026-07-26T01:00:00.000Z" },
        { id: "WAIT", customerName: "Wait", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "waiting", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" }
      ]}
      onQueued={() => {}}
    />);
    expect(html).toContain("รอบวันอังคาร");
    expect(html).toContain("2026-07-28");
    expect(html).toContain("เลือกทั้งหมดที่พร้อม");
    expect(html).toContain("READY");
    expect(html).toContain("WAIT");
    expect(html).not.toContain("NORMAL");
    expect(html).toContain("ห้องแพ็คยังตรวจไม่ครบ");
  });
});

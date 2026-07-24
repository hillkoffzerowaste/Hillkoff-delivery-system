import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OutstationLabelPrintDialog from "../../app/components/OutstationLabelPrintDialog.jsx";
import OutstationLabelPreview from "../../app/components/OutstationLabelPreview.jsx";

function label(index, total = 6) {
  return {
    orderId: `BU${String(index).padStart(6, "0")}`,
    senderName: "บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)",
    senderAddressLines: ["66 ณช้างเผือก ต.ศรีภูมิ", "อ.เมือง จ.เชียงใหม่ 50200", "โทร.053-213078"],
    recipientName: `ผู้รับ ${index}`,
    recipientAddressLines: ["ที่อยู่บรรทัด 1", "ที่อยู่บรรทัด 2", "จังหวัด 50000"],
    recipientPhone: "081-234-5678",
    carrier: "Flash",
    trackingCode: "",
    codEnabled: index === 1,
    codAmount: index === 1 ? 1250 : 0,
    codDetail: index === 1 ? "เก็บเงินปลายทาง" : "",
    boxIndex: index,
    boxTotal: total,
    boxLabel: `${index}/${total}`
  };
}

describe("outstation label preview", () => {
  it("renders five label rows per A4 page and keeps receiver lines right aligned", () => {
    const html = renderToStaticMarkup(<OutstationLabelPreview items={Array.from({ length: 6 }, (_, index) => label(index + 1))} />);

    expect((html.match(/outstation-label-print-page/g) || [])).toHaveLength(2);
    expect((html.match(/outstation-label-item/g) || [])).toHaveLength(6);
    expect(html).toContain("outstation-label-recipient");
    expect(html).toContain("1/6");
    expect(html).toContain("6/6");
  });

  it("shows a blank tracking field and COD directly below the carrier", () => {
    const html = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 1)]} />);
    const carrierPosition = html.indexOf("Flash");
    const codPosition = html.indexOf("COD 1,250 บาท");

    expect(html).toContain("รหัสขนส่ง");
    expect(carrierPosition).toBeGreaterThan(-1);
    expect(codPosition).toBeGreaterThan(carrierPosition);
  });

  it("renders editable sender, recipient, carrier, tracking, and COD controls", () => {
    const html = renderToStaticMarkup(
      <OutstationLabelPrintDialog initialItems={[label(1, 1)]} apiFetch={async () => new Response()} onClose={() => {}} />
    );

    expect(html).toContain("ข้อมูลผู้ส่ง");
    expect(html).toContain("ข้อมูลผู้รับ");
    expect(html).toContain("รหัสขนส่ง");
    expect(html).toContain("รายละเอียด COD");
    expect(html).toContain("ดูตัวอย่างก่อนพิมพ์");
  });

  it("shows recipient names instead of order IDs in the label selector and omits sender line-count copy", () => {
    const item = { ...label(1, 1), orderId: "DO-260723-181353681-B91774B7", recipientName: "คุณฉันทนา แซ่หลี่" };
    const html = renderToStaticMarkup(
      <OutstationLabelPrintDialog initialItems={[item]} apiFetch={async () => new Response()} onClose={() => {}} />
    );
    const selector = html.match(/<aside class="outstation-label-item-list">([\s\S]*?)<\/aside>/)?.[0] || "";

    expect(selector).toContain("คุณฉันทนา แซ่หลี่");
    expect(selector).not.toContain("DO-260723-181353681-B91774B7");
    expect(html).not.toContain("ที่อยู่ผู้ส่ง 3 บรรทัด");
    expect(html).toContain("จำนวนกล่อง");
  });
});

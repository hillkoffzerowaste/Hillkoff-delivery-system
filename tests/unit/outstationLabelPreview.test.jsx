import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OutstationLabelPrintDialog from "../../app/components/OutstationLabelPrintDialog.jsx";
import OutstationLabelPreview from "../../app/components/OutstationLabelPreview.jsx";
import OutstationQrScannerDialog from "../../app/components/OutstationQrScannerDialog.jsx";

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

  it("shows tracking only when supplied and keeps COD directly below the carrier", () => {
    const withTracking = renderToStaticMarkup(<OutstationLabelPreview items={[{ ...label(1, 1), trackingCode: "TRACK-001" }]} />);
    const withoutTracking = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 1)]} />);
    const carrierPosition = withTracking.indexOf("Flash");
    const codPosition = withTracking.indexOf("COD 1,250 บาท");

    expect(withTracking).toContain("รหัสขนส่ง: TRACK-001");
    expect(withoutTracking).not.toContain("รหัสขนส่ง");
    expect(carrierPosition).toBeGreaterThan(-1);
    expect(codPosition).toBeGreaterThan(carrierPosition);
  });

  it("prints มีเอกสาร/บิล on the first box of every order", () => {
    const singleBox = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 1)]} />);
    const firstOfTwo = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 2)]} />);
    const firstOfMany = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 12)]} />);
    const laterBox = renderToStaticMarkup(<OutstationLabelPreview items={[label(2, 2)]} />);

    expect(singleBox).toContain("มีเอกสาร/บิล");
    expect(firstOfTwo).toContain("มีเอกสาร/บิล");
    expect(firstOfMany).toContain("มีเอกสาร/บิล");
    expect(laterBox).not.toContain("มีเอกสาร/บิล");
  });

  it("renders each QR before, but outside, the recipient block so it cannot push recipient lines", () => {
    const html = renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 3)]} />);
    const qrPosition = html.indexOf("outstation-label-qr");
    const recipientPosition = html.indexOf("outstation-label-recipient");

    expect(html).toContain("outstation-label-qr");
    expect(html).toContain("HKO1|BU000001|1|3");
    expect(qrPosition).toBeLessThan(recipientPosition);
  });

  it("renders a mobile scanner opener and manual QR fallback", () => {
    const html = renderToStaticMarkup(<OutstationQrScannerDialog apiFetch={async () => new Response()} onClose={() => {}} onScanned={() => {}} />);

    expect(html).toContain("เปิดกล้องสแกน QR");
    expect(html).toContain("กรอกรหัส QR");
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

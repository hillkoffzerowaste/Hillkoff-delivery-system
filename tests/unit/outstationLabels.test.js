import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTSTATION_SENDER,
  buildLabelSnapshot,
  expandOrderToLabelItems,
  normalizeLabelDraft,
  paginateLabelItems,
  replaceOrderLabelItems,
  validateLabelDraft
} from "../../lib/outstationLabels.js";

const order = {
  id: "BU003931",
  boxes: 7,
  customerId: "customer-1",
  customerName: "คุณวชรี พรหมทอง",
  customerPhone: "081-2957098",
  address: "213 หมู่ที่ 5 ตำบลน้ำปั้ว อำเภอเวียงสา จังหวัดน่าน 55110",
  shippingCarrier: "เมล์เขียว",
  cod: 1250
};

describe("outstation label domain", () => {
  it("uses the approved three-line sender default", () => {
    expect(DEFAULT_OUTSTATION_SENDER).toEqual({
      name: "บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)",
      addressLines: [
        "66 ณช้างเผือก ต.ศรีภูมิ",
        "อ.เมือง จ.เชียงใหม่ 50200",
        "โทร.053-213078"
      ]
    });
  });

  it("creates one label for every box without limiting an order to five boxes", () => {
    const items = expandOrderToLabelItems(order, {});

    expect(items).toHaveLength(7);
    expect(items[0]).toMatchObject({ orderId: "BU003931", boxIndex: 1, boxTotal: 7, boxLabel: "1/7" });
    expect(items[6]).toMatchObject({ orderId: "BU003931", boxIndex: 7, boxTotal: 7, boxLabel: "7/7" });
  });

  it("splits generated labels into five rows per A4 page", () => {
    const pages = paginateLabelItems(Array.from({ length: 11 }, (_, index) => ({ id: index })));

    expect(pages.map(page => page.length)).toEqual([5, 5, 1]);
  });

  it("rebuilds only the selected order when a popup box count changes", () => {
    const otherOrder = { ...order, id: "BU003932", boxes: 1 };
    const items = [...expandOrderToLabelItems(order), ...expandOrderToLabelItems(otherOrder)];
    const rebuilt = replaceOrderLabelItems(items, "BU003931", 3);

    expect(rebuilt.filter(item => item.orderId === "BU003931").map(item => item.boxLabel)).toEqual(["1/3", "2/3", "3/3"]);
    expect(rebuilt.filter(item => item.orderId === "BU003932").map(item => item.boxLabel)).toEqual(["1/1"]);
  });

  it("keeps the tracking code blank and places COD details in the printable snapshot", () => {
    const snapshot = buildLabelSnapshot(order, {
      codEnabled: true,
      codAmount: 1250,
      codDetail: "เก็บเงินปลายทาง"
    });

    expect(snapshot).toMatchObject({
      trackingCode: "",
      carrier: "เมล์เขียว",
      codEnabled: true,
      codAmount: 1250,
      codDetail: "เก็บเงินปลายทาง"
    });
  });

  it("normalizes sender and recipient lines without changing the source order", () => {
    const draft = normalizeLabelDraft({
      senderName: " บริษัท ฮิลล์คอฟฟ์ จำกัด ",
      senderAddressLines: [" บรรทัด 1 ", "บรรทัด 2", "บรรทัด 3", "บรรทัด 4"],
      recipientName: " คุณวชรี ",
      recipientAddressLines: ["ที่อยู่ 1", " ที่อยู่ 2 ", "", "ที่อยู่ 3", "เกินจำนวน"]
    });

    expect(draft.senderName).toBe("บริษัท ฮิลล์คอฟฟ์ จำกัด");
    expect(draft.senderAddressLines).toEqual(["บรรทัด 1", "บรรทัด 2", "บรรทัด 3"]);
    expect(draft.recipientName).toBe("คุณวชรี");
    expect(draft.recipientAddressLines).toEqual(["ที่อยู่ 1", "ที่อยู่ 2", "ที่อยู่ 3", "เกินจำนวน"]);
    expect(order.customerName).toBe("คุณวชรี พรหมทอง");
  });

  it("reports required recipient and carrier fields before printing", () => {
    expect(validateLabelDraft({ recipientName: "", recipientAddressLines: [], carrier: "" })).toEqual({
      ok: false,
      errors: ["recipientName", "recipientAddress", "carrier"]
    });
  });
});

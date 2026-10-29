import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BookingNumberInput from "../../app/components/BookingNumberInput.jsx";
import { BOOKING_PREFIXES, joinBookingNumber, splitBookingNumber } from "../../lib/bookingPrefixes.js";

const render = (props) => renderToStaticMarkup(<BookingNumberInput onChange={() => {}} {...props} />);
const options = (html) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

describe("booking number heads", () => {
  it("offers CSP-style heads for ใบสั่งจอง and AS heads for ใบขายออนไลน์", () => {
    expect(options(render({ value: "" }))).toEqual(["CSP", "CSR", "TSR", "custom"]);
    expect(options(render({ value: "", kind: "online" }))).toEqual(["AS1", "AS2", "AS6", "AS7", "custom"]);
    expect(render({ value: "", kind: "online" })).toContain('<option value="AS1" selected="">');
    expect(BOOKING_PREFIXES.online.some((item) => BOOKING_PREFIXES.booking.includes(item))).toBe(false);
  });

  it("splits typed custom heads even when they contain digits", () => {
    expect(splitBookingNumber("AS3-")).toEqual({ prefix: "AS3", digits: "" });
    expect(splitBookingNumber("as1-0042")).toEqual({ prefix: "AS1", digits: "0042" });
    expect(splitBookingNumber("CSP0042")).toEqual({ prefix: "CSP", digits: "0042" });
    expect(splitBookingNumber("")).toEqual({ prefix: "", digits: "" });
    expect(joinBookingNumber("as 3", "12a")).toBe("AS3-12");
    expect(joinBookingNumber("A-B", "1")).toBe("AB-1");
    expect(joinBookingNumber("", "1234")).toBe("");
  });

  it("shows a head from the other list, or any other head, in the custom box", () => {
    const html = render({ value: "AS3-0001" });
    expect(html).toContain('<option value="custom" selected="">');
    expect(html).toContain('aria-label="กรอกรหัสหน้าเอง" autoComplete="off" value="AS3"');
    expect(render({ value: "AS1-0001" })).toContain('value="AS1"');
    expect(render({ value: "CSR-0007" })).toContain('<option value="CSR" selected="">');
  });
});

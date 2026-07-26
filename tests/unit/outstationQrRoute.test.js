import { describe, expect, it } from "vitest";
import { GET } from "../../app/outstation-qr/route.js";

describe("public outstation QR route", () => {
  it("redirects valid public QR URLs to Hillkoff Line@", async () => {
    const request = new Request("https://delivery.example/outstation-qr?t=HKO1%7CDO-260724-093803260-B81E54A1%7C1%7C1");
    const response = await GET(request);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://page.line.me/769svedb?oat_content=url&openQrModal=true");
  });

  it("rejects an invalid public QR URL without redirecting", async () => {
    const response = await GET(new Request("https://delivery.example/outstation-qr?t=invalid"));

    expect(response.status).toBe(400);
  });
});

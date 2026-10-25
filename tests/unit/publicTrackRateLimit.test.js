import { describe, expect, it } from "vitest";
import { isRateLimited, requestClientKey } from "../../lib/publicTrackRateLimit";

function request(headers = {}) {
  return { headers: new Headers(headers) };
}

describe("public tracking rate limit", () => {
  it("uses the first forwarded IP when x-real-ip is unavailable", () => {
    expect(requestClientKey(request({ "x-forwarded-for": "203.0.113.10, 10.0.0.1" }))).toBe("203.0.113.10");
  });

  it("does not put all requests into one shared bucket when the proxy sends no IP", () => {
    const attempts = new Map();
    const anonymousRequest = request();

    for (let index = 0; index < 25; index += 1) {
      expect(isRateLimited(anonymousRequest, attempts, index)).toBe(false);
    }

    expect(attempts.size).toBe(0);
  });

  it("limits a known client after twenty requests in the window", () => {
    const attempts = new Map();
    const clientRequest = request({ "x-real-ip": "203.0.113.11" });

    for (let index = 0; index < 20; index += 1) {
      expect(isRateLimited(clientRequest, attempts, index)).toBe(false);
    }

    expect(isRateLimited(clientRequest, attempts, 20)).toBe(true);
  });
});

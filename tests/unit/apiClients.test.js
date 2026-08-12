import { describe, expect, it } from "vitest";
import {
  apiKeyPrefix,
  corsHeaders,
  evaluateApiClient,
  extractApiKey,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  isIpAllowed,
  isOriginAllowed,
  looksLikeApiKey,
  missingScopes,
  normalizeOriginList,
  normalizeRoles,
  normalizeScopes,
  publicApiClient,
  scopeGranted
} from "../../lib/apiClients.js";

function headers(map) {
  return { headers: new Headers(map) };
}

describe("api key material", () => {
  it("generates unique keys that match the documented shape", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
    expect(looksLikeApiKey(a)).toBe(true);
    expect(apiKeyPrefix(a)).toBe(a.slice(0, 16));
  });

  it("rejects values that are not hillkoff keys", () => {
    expect(looksLikeApiKey("")).toBe(false);
    expect(looksLikeApiKey("hk_live_short")).toBe(false);
    expect(looksLikeApiKey("eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9.payload.sig")).toBe(false);
  });

  it("hashes deterministically and compares in constant time", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()));
    expect(hashesMatch(hashApiKey(key), hashApiKey(key))).toBe(true);
    expect(hashesMatch(hashApiKey(key), hashApiKey("other"))).toBe(false);
    expect(hashesMatch("", "")).toBe(false);
  });
});

describe("extractApiKey", () => {
  const key = generateApiKey();

  it("reads x-api-key first", () => {
    expect(extractApiKey(headers({ "x-api-key": key }))).toBe(key);
  });

  it("reads ApiKey and Bearer authorization schemes", () => {
    expect(extractApiKey(headers({ authorization: `ApiKey ${key}` }))).toBe(key);
    expect(extractApiKey(headers({ authorization: `Bearer ${key}` }))).toBe(key);
  });

  it("ignores firebase id tokens so user sessions still work", () => {
    expect(extractApiKey(headers({ authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.abc.def" }))).toBe("");
    expect(extractApiKey(headers({}))).toBe("");
  });
});

describe("scopes and roles", () => {
  it("collapses to full access when '*' is present", () => {
    expect(normalizeScopes(["orders:read", "*"])).toEqual(["*"]);
    expect(normalizeScopes("orders:read, orders:write")).toEqual(["orders:read", "orders:write"]);
  });

  it("drops unknown scopes but keeps group wildcards", () => {
    expect(normalizeScopes(["orders:*", "nonsense:read"])).toEqual(["orders:*"]);
  });

  it("grants by exact match, group wildcard, or full access", () => {
    expect(scopeGranted(["orders:read"], "orders:read")).toBe(true);
    expect(scopeGranted(["orders:read"], "orders:write")).toBe(false);
    expect(scopeGranted(["orders:*"], "orders:write")).toBe(true);
    expect(scopeGranted(["*"], "vehicles:write")).toBe(true);
    expect(missingScopes(["orders:read"], ["orders:read", "customers:write"])).toEqual(["customers:write"]);
  });

  it("expands '*' roles to every supported role", () => {
    expect(normalizeRoles("*")).toContain("driver");
    expect(normalizeRoles(["sales", "bogus"])).toEqual(["sales"]);
  });
});

describe("origin and ip allowlists", () => {
  it("treats an empty allowlist as open", () => {
    expect(isOriginAllowed("https://a.example.com", [])).toBe(true);
    expect(isIpAllowed("1.2.3.4", [])).toBe(true);
  });

  it("matches origins case-insensitively without trailing slashes", () => {
    const list = normalizeOriginList("https://App.Example.com/");
    expect(list).toEqual(["https://app.example.com"]);
    expect(isOriginAllowed("https://app.example.com", list)).toBe(true);
    expect(isOriginAllowed("https://evil.example.com", list)).toBe(false);
  });

  it("rejects unknown ips when an allowlist exists", () => {
    expect(isIpAllowed("1.2.3.4", ["9.9.9.9"])).toBe(false);
    expect(isIpAllowed("", ["9.9.9.9"])).toBe(false);
  });
});

describe("evaluateApiClient", () => {
  const base = { id: "c1", active: true, scopes: ["orders:read"], origins: [], ipAllowlist: [] };

  it("accepts an active client with the required scope", () => {
    expect(evaluateApiClient(base, { scopes: ["orders:read"] })).toMatchObject({ ok: true });
  });

  it("rejects a missing, revoked, or expired client", () => {
    expect(evaluateApiClient(null, {})).toMatchObject({ ok: false, status: 401 });
    expect(evaluateApiClient({ ...base, active: false }, {})).toMatchObject({ ok: false, status: 401 });
    expect(evaluateApiClient({ ...base, expiresAt: "2020-01-01T00:00:00.000Z" }, {})).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects disallowed origin, ip, and scope with 403", () => {
    expect(evaluateApiClient({ ...base, origins: ["https://ok.example.com"] }, { origin: "https://no.example.com" }))
      .toMatchObject({ ok: false, status: 403 });
    expect(evaluateApiClient({ ...base, ipAllowlist: ["9.9.9.9"] }, { ip: "1.1.1.1" }))
      .toMatchObject({ ok: false, status: 403 });
    expect(evaluateApiClient(base, { scopes: ["orders:write"] })).toMatchObject({ ok: false, status: 403 });
  });

  it("honours an expiry that is still in the future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(evaluateApiClient({ ...base, expiresAt: future }, {})).toMatchObject({ ok: true });
  });
});

describe("cors and serialization", () => {
  it("echoes an allowed origin and withholds headers for a blocked one", () => {
    const allowed = corsHeaders("https://app.example.com", { origins: ["https://app.example.com"] });
    expect(allowed["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(corsHeaders("https://evil.example.com", { origins: ["https://app.example.com"] })).toEqual({});
    expect(corsHeaders("", null)["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("never leaks the stored key hash", () => {
    const safe = publicApiClient({ id: "c1", name: "app", keyHash: "secret-hash", keyPrefix: "hk_live_abc" });
    expect(safe.keyHash).toBeUndefined();
    expect(safe.keyPrefix).toBe("hk_live_abc");
    expect(publicApiClient(null)).toBeNull();
  });
});

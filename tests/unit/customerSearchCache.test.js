import { describe, expect, it } from "vitest";
import {
  CUSTOMER_SEARCH_CACHE_TTL_MS,
  cacheEntryIsFresh,
  cachePayloadFits,
  customerSearchCacheDocId,
  versionedCacheKey
} from "../../lib/customerSearchCache.js";

describe("customer search cache", () => {
  it("derives a Firestore-safe document id from any query text", () => {
    const id = customerSearchCacheDocId("v1:ร้านกาแฟ/สาขา 2");
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(id).toBe(customerSearchCacheDocId("v1:ร้านกาแฟ/สาขา 2"));
    expect(id).not.toBe(customerSearchCacheDocId("v2:ร้านกาแฟ/สาขา 2"));
  });

  it("scopes cache keys by index version so a bump strands every old entry", () => {
    expect(versionedCacheKey(7, "somchai")).toBe("v7:somchai");
    expect(versionedCacheKey(8, "somchai")).not.toBe(versionedCacheKey(7, "somchai"));
  });

  it("treats an entry as fresh only until its stored expiry", () => {
    const now = 1_800_000_000_000;
    const entry = { data: [], expiresAt: new Date(now + CUSTOMER_SEARCH_CACHE_TTL_MS).toISOString() };
    expect(cacheEntryIsFresh(entry, now)).toBe(true);
    expect(cacheEntryIsFresh(entry, now + CUSTOMER_SEARCH_CACHE_TTL_MS + 1)).toBe(false);
  });

  it("accepts a Firestore Timestamp expiry as well as an ISO string", () => {
    const now = 1_800_000_000_000;
    const entry = { data: [], expiresAt: { toMillis: () => now + 60_000 } };
    expect(cacheEntryIsFresh(entry, now)).toBe(true);
    expect(cacheEntryIsFresh(entry, now + 61_000)).toBe(false);
  });

  it("rejects entries that carry no result array", () => {
    expect(cacheEntryIsFresh(null)).toBe(false);
    expect(cacheEntryIsFresh({ expiresAt: new Date(Date.now() + 60_000).toISOString() })).toBe(false);
  });

  it("refuses payloads that would not fit inside a Firestore document", () => {
    expect(cachePayloadFits([{ id: "C1", name: "ร้านกาแฟ" }])).toBe(true);
    expect(cachePayloadFits(Array.from({ length: 5000 }, (_, index) => ({
      id: `C${index}`, name: "x".repeat(200), address: "y".repeat(200)
    })))).toBe(false);
  });
});

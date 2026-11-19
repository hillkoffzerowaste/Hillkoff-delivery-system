import { beforeEach, describe, expect, it } from "vitest";
import { cachedRead, resetCachedReads } from "../../lib/serverCache.js";

describe("cachedRead", () => {
  beforeEach(() => resetCachedReads());

  it("shares one read within the time window and re-reads after it or when fresh", async () => {
    let clock = 0;
    let reads = 0;
    const read = async () => ++reads;
    const opts = { now: () => clock };
    expect(await cachedRead("k", 1000, read, opts)).toBe(1);
    clock = 999;
    expect(await cachedRead("k", 1000, read, opts)).toBe(1);
    expect(await cachedRead("k", 1000, read, { ...opts, fresh: true })).toBe(2);
    clock = 3000;
    expect(await cachedRead("k", 1000, read, opts)).toBe(3);
    expect(await cachedRead("other", 1000, read, opts)).toBe(4);
  });

  it("shares a read already in flight and does not keep failures", async () => {
    let reads = 0;
    let release;
    const slow = () => { reads += 1; return new Promise((resolve) => { release = resolve; }); };
    const a = cachedRead("k", 1000, slow);
    const b = cachedRead("k", 1000, slow);
    release("x");
    expect(await Promise.all([a, b])).toEqual(["x", "x"]);
    expect(reads).toBe(1);
    await expect(cachedRead("bad", 1000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await cachedRead("bad", 1000, async () => "ok")).toBe("ok");
  });
});

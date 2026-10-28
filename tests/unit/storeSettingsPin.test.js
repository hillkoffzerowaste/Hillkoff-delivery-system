import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  STORE_SETTINGS_PIN_SHA256,
  createPinThrottle,
  hashPin,
  verifyStoreSettingsPin
} from "../../lib/storeSettingsPin.js";

afterEach(() => vi.unstubAllEnvs());

describe("verifyStoreSettingsPin", () => {
  it("keeps the constant equal to sha256 of 2532", () => {
    expect(STORE_SETTINGS_PIN_SHA256).toBe(createHash("sha256").update("2532").digest("hex"));
    expect(hashPin(" 2532 ")).toBe(STORE_SETTINGS_PIN_SHA256);
  });

  it("accepts the default PIN and rejects everything else without throwing", () => {
    const env = {};
    expect(verifyStoreSettingsPin("2532", env)).toBe(true);
    expect(verifyStoreSettingsPin(2532, env)).toBe(true);
    expect(verifyStoreSettingsPin("2533", env)).toBe(false);
    expect(verifyStoreSettingsPin("", env)).toBe(false);
    expect(verifyStoreSettingsPin(undefined, env)).toBe(false);
    expect(verifyStoreSettingsPin("25320000000000000", env)).toBe(false);
  });

  it("uses STORE_SETTINGS_PIN from the environment instead of the default", () => {
    vi.stubEnv("STORE_SETTINGS_PIN", "9876");
    expect(verifyStoreSettingsPin("9876")).toBe(true);
    expect(verifyStoreSettingsPin("2532")).toBe(false);
  });

  it("ignores an empty override", () => {
    expect(verifyStoreSettingsPin("2532", { STORE_SETTINGS_PIN: "  " })).toBe(true);
  });
});

describe("createPinThrottle", () => {
  it("locks after 5 failures and unlocks after lockMs", () => {
    const throttle = createPinThrottle();
    for (let i = 0; i < 4; i += 1) throttle.recordFailure("u1", 1000 + i);
    expect(throttle.isLocked("u1", 1100)).toBe(false);
    throttle.recordFailure("u1", 1100);
    expect(throttle.isLocked("u1", 1200)).toBe(true);
    expect(throttle.isLocked("u2", 1200)).toBe(false);
    expect(throttle.isLocked("u1", 1100 + 60_000)).toBe(false);
  });

  it("forgets failures older than the window and supports reset", () => {
    const throttle = createPinThrottle();
    for (let i = 0; i < 4; i += 1) throttle.recordFailure("u1", 0);
    throttle.recordFailure("u1", 61_000);
    expect(throttle.isLocked("u1", 61_001)).toBe(false);
    for (let i = 0; i < 4; i += 1) throttle.recordFailure("u1", 62_000);
    expect(throttle.isLocked("u1", 62_001)).toBe(true);
    throttle.reset("u1");
    expect(throttle.isLocked("u1", 62_002)).toBe(false);
  });
});

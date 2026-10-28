// Server-only: PIN check for the store settings page. Never import from a client component.
import { createHash, timingSafeEqual } from "node:crypto";

export const STORE_SETTINGS_PIN_SHA256 = "6cf5896600cbb072644fcdfa4e8bad2159c558e67c4b2226e87e26f6b898c99a"; // sha256("2532")

export function hashPin(pin) {
  return createHash("sha256").update(String(pin ?? "").trim()).digest("hex");
}

export function verifyStoreSettingsPin(pin, env = process.env) {
  const override = String(env?.STORE_SETTINGS_PIN ?? "").trim();
  const expected = Buffer.from(override ? hashPin(override) : STORE_SETTINGS_PIN_SHA256, "hex");
  const actual = Buffer.from(hashPin(pin), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createPinThrottle({ maxFails = 5, lockMs = 60_000 } = {}) {
  const state = new Map();
  const live = (key, now) => {
    const entry = state.get(key);
    if (entry && now - entry.firstAt >= lockMs && !(entry.lockedUntil > now)) state.delete(key);
    return state.get(key);
  };
  return {
    isLocked(key, now = Date.now()) {
      const entry = live(key, now);
      return Boolean(entry && entry.lockedUntil > now);
    },
    recordFailure(key, now = Date.now()) {
      const entry = live(key, now) || { count: 0, firstAt: now, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= maxFails) entry.lockedUntil = now + lockMs;
      state.set(key, entry);
      return entry.lockedUntil > now;
    },
    reset(key) {
      state.delete(key);
    }
  };
}

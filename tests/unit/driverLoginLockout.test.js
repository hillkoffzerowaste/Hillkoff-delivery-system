import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("firebase-admin/firestore", () => ({ FieldValue: { delete: () => "__delete__" } }));
vi.mock("../../lib/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: "driver-uid-1" }) }),
  getAdminDb: () => state.db
}));
vi.mock("../../lib/driverIdentity.js", () => ({ driverIdentityPatch: () => ({}) }));

const PHONE = "0812345678";
const PASSWORD = "correct-horse";
const SALT = "a".repeat(32);

function createDb({ lockedUntilMs, failedAttempts = 5 }) {
  const docs = new Map([
    [`users_by_phone/${PHONE}`, {
      role: "driver",
      active: true,
      status: "active",
      phone: PHONE,
      phoneDigits: PHONE,
      passwordSalt: SALT,
      passwordHash: crypto.scryptSync(PASSWORD, SALT, 32).toString("hex"),
      passwordHashVersion: "scrypt-v1"
    }],
    ["login_rate_limits/" + PHONE, { lockedUntilMs, failedAttempts, windowStartedAtMs: Date.now() }]
  ]);
  const failures = [];
  const docRef = (path) => ({
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) })
  });
  return {
    docs,
    failures,
    collection: (name) => ({ doc: (id) => docRef(`${name}/${id ?? "auto"}`) }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
      set: (ref, data) => { failures.push({ path: ref.path, data }); docs.set(ref.path, { ...docs.get(ref.path), ...data }); }
    }),
    batch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} })
  };
}

async function login(password) {
  const { POST } = await import("../../app/api/auth/login/route.js");
  return POST(new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "test-token", role: "driver", username: PHONE, password })
  }));
}

describe("driver login lockout", () => {
  beforeEach(() => {
    process.env.OTP_SECRET = "x".repeat(40);
  });

  it("blocks even the correct password while the account is locked out", async () => {
    state.db = createDb({ lockedUntilMs: Date.now() + 10 * 60_000 });

    const response = await login(PASSWORD);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "TOO_MANY_LOGIN_ATTEMPTS" });
  });

  it("does not hand out free guesses during lockout — a wrong password is rejected without unlocking", async () => {
    state.db = createDb({ lockedUntilMs: Date.now() + 10 * 60_000 });

    const response = await login("wrong-password");

    expect(response.status).toBe(429);
    // ยังล็อกอยู่ ไม่มีการรีเซ็ตหน้าต่างนับ attempt
    expect(state.db.docs.get(`login_rate_limits/${PHONE}`).failedAttempts).toBe(5);
  });

  it("accepts the correct password once the lockout has expired", async () => {
    state.db = createDb({ lockedUntilMs: Date.now() - 1_000 });

    const response = await login(PASSWORD);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, data: { role: "driver" } });
  });

  it("counts a failure when the account is not locked", async () => {
    state.db = createDb({ lockedUntilMs: 0, failedAttempts: 0 });

    const response = await login("wrong-password");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_PASSWORD" });
    expect(state.db.failures.at(-1)).toMatchObject({
      path: `login_rate_limits/${PHONE}`,
      data: { failedAttempts: 1, lockedUntilMs: 0 }
    });
  });

  it("locks the account on the fifth consecutive failure", async () => {
    state.db = createDb({ lockedUntilMs: 0, failedAttempts: 4 });

    const response = await login("wrong-password");

    expect(response.status).toBe(429);
    expect(state.db.failures.at(-1).data.failedAttempts).toBe(5);
    expect(state.db.failures.at(-1).data.lockedUntilMs).toBeGreaterThan(Date.now());
  });
});

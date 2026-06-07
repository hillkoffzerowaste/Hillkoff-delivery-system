import crypto from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000;

export function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function createOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

export function hashOtp(code, salt) {
  return crypto.createHash("sha256").update(`${salt}:${String(code || "").trim()}`, "utf8").digest("hex");
}

export function createOtpSessionPayload({ uid, email, role, phoneDigits, name }) {
  const code = createOtpCode();
  const salt = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  return {
    code,
    session: {
      uid,
      email: normalizeEmail(email),
      role,
      phoneDigits: normalizePhoneDigits(phoneDigits),
      name: String(name || "").trim(),
      otpSalt: salt,
      otpHash: hashOtp(code, salt),
      attempts: 0,
      usedAt: null,
      expiresAtMs: now + OTP_TTL_MS,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + OTP_TTL_MS).toISOString()
    }
  };
}

export function isOtpExpired(session) {
  return !session?.expiresAtMs || Date.now() > Number(session.expiresAtMs);
}

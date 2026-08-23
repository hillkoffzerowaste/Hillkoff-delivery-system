import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth } from "../../../../lib/firebaseAdmin";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

const phoneDigits = (value) => String(value || "").replace(/\D/g, "");

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const phone = phoneDigits(body?.phone);
    const password = String(body?.password || "");

    if (phone.length < 9 || phone.length > 15) {
      return Response.json({ ok: false, error: "Invalid driver phone" }, { status: 400 });
    }
    if (password !== password.trim() || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return Response.json({ ok: false, error: `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters and cannot start or end with spaces` }, { status: 400 });
    }

    const userRef = db.collection("users_by_phone").doc(phone);
    const snapshot = await userRef.get();
    if (!snapshot.exists || snapshot.data()?.role !== "driver") {
      return Response.json({ ok: false, error: "Driver account not found" }, { status: 404 });
    }

    const driver = snapshot.data() || {};
    const now = new Date().toISOString();
    const passwordSalt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(password, passwordSalt);
    const resetPatch = {
      passwordSalt,
      passwordHash,
      passwordHashVersion: "scrypt-v1",
      pinSalt: FieldValue.delete(),
      pinHash: FieldValue.delete(),
      pinHashVersion: FieldValue.delete(),
      trustedDevices: [],
      trustedDeviceHashes: [],
      passwordResetAt: now,
      passwordResetBy: profile.email || profile.uid,
      updatedAt: now
    };

    const batch = db.batch();
    batch.set(userRef, resetPatch, { merge: true });
    batch.delete(db.collection("login_rate_limits").doc(phone));
    batch.set(db.collection("audit_logs").doc(), {
      action: "driver_password_reset",
      targetId: phone,
      driverId: driver.driverId || "",
      uid: profile.uid,
      createdAt: now
    });
    await batch.commit();

    // Drivers authenticate with anonymous Firebase sessions. Revoking the current
    // session prevents an already signed-in device from continuing after a reset.
    const currentUid = String(driver.uidLast || driver.uid || "").trim();
    if (currentUid) await getAdminAuth().revokeRefreshTokens(currentUid);

    return Response.json({ ok: true, data: { phone, driverName: driver.name || "" } });
  } catch (error) {
    return errorResponse(error);
  }
}

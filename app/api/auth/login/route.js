import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import crypto from "node:crypto";
import { driverIdentityPatch } from "../../../../lib/driverIdentity";

export const runtime = "nodejs";

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s || ""), "utf8").digest("hex");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const role = String(payload?.role || "").trim(); // driver | sales
  const name = String(payload?.name || "").trim();
  const phoneRaw = String(payload?.phone || "").trim();
  const phone = normalizePhoneDigits(phoneRaw);
  const pin = String(payload?.pin || "").trim();
  const setPin = Boolean(payload?.setPin);
  const deviceId = String(payload?.deviceId || "").trim();
  const rememberDevice = Boolean(payload?.rememberDevice);
  const driverProfile = payload?.driverProfile && typeof payload.driverProfile === "object" ? payload.driverProfile : null;

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!["driver", "sales"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  if (!phone) return Response.json({ ok: false, error: "Missing phone" }, { status: 400 });

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const db = getAdminDb();

    const uid = decoded.uid;

    const userRef = db.collection("users_by_phone").doc(phone);
    const existingSnap = await userRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : null;

    const trusted = Array.isArray(existing?.trustedDevices) ? existing.trustedDevices : [];
    const isDeviceTrusted = !!deviceId && trusted.includes(deviceId);
    const hasPin = !!existing?.pinHash && !!existing?.pinSalt;

    if (existing?.role && existing.role !== role) {
      return Response.json({ ok: false, error: "ROLE_MISMATCH" }, { status: 403 });
    }
    if (setPin && existing && hasPin) {
      return Response.json({ ok: false, error: "PIN_ALREADY_SET" }, { status: 403 });
    }

    if (!existing && !setPin) {
      return Response.json({ ok: false, error: "PIN_NOT_SET" }, { status: 401 });
    }
    if (existing && !hasPin && !setPin) {
      return Response.json({ ok: false, error: "PIN_NOT_SET" }, { status: 401 });
    }

    if (!isDeviceTrusted) {
      if (!pin) return Response.json({ ok: false, error: "PIN_REQUIRED" }, { status: 401 });
      if (!setPin && existing?.pinSalt) {
        const expectedHash = sha256Hex(`${existing.pinSalt}:${pin}`);
        if (expectedHash !== existing.pinHash) {
          return Response.json({ ok: false, error: "INVALID_PIN" }, { status: 401 });
        }
      }
    }

    const nextTrusted = new Set(trusted);
    if (rememberDevice && deviceId) nextTrusted.add(deviceId);

    const nextPinSalt = existing?.pinSalt || crypto.randomBytes(16).toString("hex");
    const nextPinHash = setPin ? sha256Hex(`${nextPinSalt}:${pin}`) : existing?.pinHash || null;

    const next = {
      uid,
      uidLast: uid,
      role,
      phone: phoneRaw || existing?.phone || null,
      phoneDigits: phone,
      name: name || existing?.name || null,
      driverId: role === "driver" ? (existing?.driverId || `driver_${phone}`) : null,
      pinSalt: nextPinSalt,
      pinHash: nextPinHash,
      trustedDevices: Array.from(nextTrusted),
      driverProfile: role === "driver"
        ? {
            firstName: String(driverProfile?.firstName || existing?.driverProfile?.firstName || ""),
            lastName: String(driverProfile?.lastName || existing?.driverProfile?.lastName || ""),
            vehicle: String(driverProfile?.vehicle || existing?.driverProfile?.vehicle || ""),
            plate: String(driverProfile?.plate || existing?.driverProfile?.plate || ""),
            zone: String(driverProfile?.zone || existing?.driverProfile?.zone || "")
          }
        : null,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    if (role === "driver") Object.assign(next, driverIdentityPatch(existing, uid));

    await userRef.set(next, { merge: true });

    await db.collection("login_events").add({
      uid,
      role,
      phone: next.phone,
      success: true,
      createdAt: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      data: { uid, role, phone: next.phone, name: next.name, driverId: next.driverId, driverProfile: next.driverProfile || null }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

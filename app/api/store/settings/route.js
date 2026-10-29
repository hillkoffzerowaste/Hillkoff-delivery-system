import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import {
  STORE_SETTINGS_COLLECTION,
  STORE_SETTINGS_DOC_ID,
  normalizeStoreSettings,
  removedBranchCodes,
  validateStoreSettings
} from "../../../../lib/storeSettings.js";
import { createPinThrottle, verifyStoreSettingsPin } from "../../../../lib/storeSettingsPin.js";

export const runtime = "nodejs";

// In-memory and best-effort (per server instance): enough to slow down PIN guessing.
const pinThrottle = createPinThrottle();

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw httpError(400, "Invalid JSON");
  }
}

// Checked on the unlock POST and on every PUT, before anything is read or written.
function assertPin(profile, pin) {
  if (pinThrottle.isLocked(profile.uid)) throw httpError(429, "ใส่รหัส PIN ผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่");
  if (!verifyStoreSettingsPin(pin)) {
    const locked = pinThrottle.recordFailure(profile.uid);
    throw httpError(locked ? 429 : 403, locked ? "ใส่รหัส PIN ผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่" : "รหัส PIN ไม่ถูกต้อง");
  }
  pinThrottle.reset(profile.uid);
}

function failureResponse(error) {
  if (error?.status === 400 && Array.isArray(error.errors)) {
    return Response.json({ ok: false, error: error.message, errors: error.errors }, { status: 400 });
  }
  return errorResponse(error);
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "pack", "admin"]);
    const snapshot = await db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID).get();
    const settings = normalizeStoreSettings(snapshot.exists ? snapshot.data() : {});
    return Response.json({ ok: true, data: { settings, updatedAt: settings.updatedAt || "" } });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile } = await requireProfile(request, ["store", "admin"]);
    const body = await readBody(request);
    assertPin(profile, body.pin);
    return Response.json({ ok: true });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PUT(request) {
  try {
    const { profile, db } = await requireProfile(request, ["store", "admin"]);
    const body = await readBody(request);
    assertPin(profile, body.pin);

    const baseUpdatedAt = typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : "";
    const ref = db.collection(STORE_SETTINGS_COLLECTION).doc(STORE_SETTINGS_DOC_ID);
    const updatedAt = new Date().toISOString();

    const saved = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const previous = normalizeStoreSettings(snapshot.exists ? snapshot.data() : {});
      if ((previous.updatedAt || "") !== baseUpdatedAt) {
        throw httpError(409, "มีผู้อื่นบันทึกการตั้งค่าไปก่อน กรุณาโหลดใหม่แล้วแก้อีกครั้ง");
      }

      const incoming = body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? { ...body.settings } : body.settings;
      if (incoming && typeof incoming === "object") {
        if (incoming.staff === undefined) incoming.staff = previous.staff;
        if (Array.isArray(incoming.branches)) incoming.branches = incoming.branches.map((branch) => {
          if (!branch || typeof branch !== "object" || branch.header !== undefined) return branch;
          const prior = previous.branches.find((item) => item.code === String(branch.code || "").trim().toUpperCase());
          return prior?.header ? { ...branch, header: prior.header } : branch;
        });
      }
      const result = validateStoreSettings(incoming);
      if (!result.ok) throw httpError(400, result.errors[0].message, { errors: result.errors });

      for (const code of removedBranchCodes(previous, result.value)) {
        const references = await Promise.all([
          transaction.get(db.collection("store_transfers").where("fromBranchCode", "==", code).limit(1)),
          transaction.get(db.collection("store_transfers").where("toBranchCode", "==", code).limit(1)),
          transaction.get(db.collection("store_audits").where("branchCode", "==", code).limit(1))
        ]);
        if (references.some((snap) => snap.docs.length > 0)) {
          throw httpError(409, `สาขา ${code} มีเอกสารอ้างอิงแล้ว ลบไม่ได้ ให้ปิดใช้งานแทน`);
        }
      }

      const document = { ...result.value, updatedAt, updatedBy: profile.name || "", updatedByUid: profile.uid };
      transaction.set(ref, document);
      return document;
    });

    return Response.json({ ok: true, data: { settings: normalizeStoreSettings(saved), updatedAt } });
  } catch (error) {
    return failureResponse(error);
  }
}

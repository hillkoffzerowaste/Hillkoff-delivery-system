import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { readStoreRoster } from "../../../../lib/storeRoster.js";
import { dayDutyId, validateDuty } from "../../../../lib/storeDuty.js";

export const runtime = "nodejs";

const fail = (message, status) => Object.assign(new Error(message), { status });

async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    throw fail("ข้อมูลไม่ถูกต้อง", 400);
  }
}

async function checked(db, body) {
  const result = validateDuty(body);
  if (!result.ok) throw fail(result.error, 400);
  const member = (await readStoreRoster(db)).find((person) => person.uid === result.value.staffId);
  if (!member || member.name.toLowerCase() === "store") throw fail("ไม่พบพนักงานคนนี้ในรายชื่อสโตร์", 400);
  return { ...result.value, staffName: member.name };
}

// PUT sets a standing role (scope "default", empty values clear it) or one day's duty (scope "day").
export async function PUT(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const { scope, ...value } = await checked(db, await bodyOf(request));
    const now = new Date().toISOString();
    const stamp = { updatedAt: now, updatedBy: profile.name || profile.email || "", updatedByUid: profile.uid };
    if (scope === "default") {
      await db.collection("store_staff_roles").doc(value.staffId).set({ ...value, ...stamp });
    } else {
      await db.collection("store_duties").doc(dayDutyId(value.date, value.staffId)).set({ ...value, ...stamp, deletedAt: "" });
    }
    return Response.json({ ok: true, data: { scope, ...value, updatedAt: now } });
  } catch (error) {
    return errorResponse(error);
  }
}

// Clears one day's duty so the standing role applies again; kept as a soft delete for the audit trail.
export async function DELETE(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await bodyOf(request);
    const result = validateDuty({ ...body, scope: "day", position: "-" });
    if (!result.ok) throw fail(result.error, 400);
    const now = new Date().toISOString();
    await db.collection("store_duties").doc(dayDutyId(result.value.date, result.value.staffId)).set({ deletedAt: now, deletedByUid: profile.uid, updatedAt: now }, { merge: true });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

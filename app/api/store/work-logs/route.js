import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokDayRange, bangkokMonthRange } from "../../../../lib/storeFormat.js";
import { bangkokDateOf } from "../../../../lib/storeOverview.js";
import { readStoreRoster } from "../../../../lib/storeRoster.js";
import { publicWorkLog, sortWorkLogs, validateWorkLog } from "../../../../lib/storeWorkLog.js";

export const runtime = "nodejs";

const MONTH_LIMIT = 2000;
const fail = (message, status) => Object.assign(new Error(message), { status });
const validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 200 && !id.includes("/");
// Strictly increasing so two quick edits never share the same stale-check stamp.
const stamp = (old = "") => new Date(Math.max(Date.now(), (Date.parse(old) || 0) + 1)).toISOString();

async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    throw fail("ข้อมูลไม่ถูกต้อง", 400);
  }
}

function checkedLog(body) {
  const checked = validateWorkLog(body);
  if (!checked.ok) throw fail(checked.error, 400);
  if (checked.value.date > bangkokDateOf(new Date().toISOString())) throw fail("บันทึกงานได้ถึงวันนี้เท่านั้น ส่วนงานล่วงหน้าให้ใส่ในแผนงาน", 400);
  return checked.value;
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["store", "admin"]);
    const params = new URL(request.url).searchParams;
    const staffId = params.get("staffId") || "";
    let query;
    if (params.has("month")) {
      const range = bangkokMonthRange(params.get("month"));
      if (!range) throw fail("เดือนไม่ถูกต้อง", 400);
      query = db.collection("store_work_logs").where("date", ">=", range.from).where("date", "<=", range.to).orderBy("date");
    } else {
      const date = params.get("date");
      if (!bangkokDayRange(date)) throw fail("วันที่ไม่ถูกต้อง", 400);
      query = db.collection("store_work_logs").where("date", "==", date);
    }
    const snap = await query.limit(MONTH_LIMIT + 1).get();
    if (snap.docs.length > MONTH_LIMIT) throw fail("บันทึกงานมีจำนวนมากเกินขีดจำกัด", 422);
    const items = sortWorkLogs(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item) => !item.deletedAt && (!staffId || item.staffId === staffId))).map(publicWorkLog);
    return Response.json({ ok: true, data: { items } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const value = checkedLog(await bodyOf(request));
    const member = (await readStoreRoster(db)).find((person) => person.uid === value.staffId);
    if (!member || member.name.toLowerCase() === "store") throw fail("ไม่พบพนักงานคนนี้ในรายชื่อสโตร์", 400);
    const now = stamp();
    const ref = db.collection("store_work_logs").doc();
    const doc = { ...value, staffName: member.name, createdAt: now, updatedAt: now, createdBy: profile.name || profile.email || "", createdByUid: profile.uid, updatedByUid: profile.uid };
    await ref.set(doc);
    return Response.json({ ok: true, data: publicWorkLog({ id: ref.id, ...doc }) });
  } catch (error) {
    return errorResponse(error);
  }
}

async function change(request, deleted) {
  try {
    const { db, profile } = await requireProfile(request, ["store"]);
    const body = await bodyOf(request);
    if (!validId(body.id) || typeof body.baseUpdatedAt !== "string") throw fail("ข้อมูลไม่ถูกต้อง", 400);
    const ref = db.collection("store_work_logs").doc(body.id);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().deletedAt) throw fail("ไม่พบบันทึกงาน", 404);
      const doc = snap.data();
      if (doc.updatedAt !== body.baseUpdatedAt) throw fail("บันทึกงานเปลี่ยนแล้ว กรุณาโหลดใหม่", 409);
      const now = stamp(doc.updatedAt);
      let patch = { updatedAt: now, updatedByUid: profile.uid };
      if (deleted) {
        patch = { ...patch, deletedAt: now, deletedByUid: profile.uid };
      } else {
        // The owner stays fixed so an edit can never move work onto someone else's record.
        const value = checkedLog({ ...body, staffId: doc.staffId });
        patch = { ...patch, ...value };
      }
      tx.update(ref, patch);
      return { id: ref.id, ...doc, ...patch };
    });
    return Response.json({ ok: true, data: publicWorkLog(result) });
  } catch (error) {
    return errorResponse(error);
  }
}

export const PATCH = (request) => change(request, false);
export const DELETE = (request) => change(request, true);

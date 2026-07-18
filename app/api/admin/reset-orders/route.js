import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    const before = await db.collection("orders").count().get();
    const deleted = Number(before.data().count || 0);
    await db.recursiveDelete(db.collection("orders"));
    return Response.json({ ok: true, deleted });
  } catch (error) { return errorResponse(error); }
}

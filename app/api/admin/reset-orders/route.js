import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const REQUIRED_CONFIRMATION = "YES_DELETE_ALL_ORDERS";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== REQUIRED_CONFIRMATION) {
      return Response.json({ ok: false, error: `Reset requires confirm='${REQUIRED_CONFIRMATION}'` }, { status: 400 });
    }
    const before = await db.collection("orders").count().get();
    const deleted = Number(before.data().count || 0);
    await db.recursiveDelete(db.collection("orders"));
    return Response.json({ ok: true, deleted });
  } catch (error) { return errorResponse(error); }
}

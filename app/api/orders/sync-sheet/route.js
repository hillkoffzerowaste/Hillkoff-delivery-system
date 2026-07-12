import { requireProfile, errorResponse } from "../../../../lib/workflowAuth";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "store", "pack", "driver", "admin"]);
    const body = await request.json();
    const orderId = String(body?.orderId || "");
    if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    const result = await syncDeliveryOrderToSheet(db, orderId);
    return Response.json(result, { status: result?.ok === false ? 502 : 200 });
  } catch (error) { return errorResponse(error); }
}

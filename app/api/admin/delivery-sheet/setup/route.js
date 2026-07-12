import { requireProfile, errorResponse } from "../../../../../lib/workflowAuth";
import { setupDeliverySheet } from "../../../../../lib/deliverySheetSync";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await requireProfile(request, ["admin"]);
    const result = await setupDeliverySheet();
    return Response.json(result, { status: result?.ok === false ? 502 : 200 });
  } catch (error) { return errorResponse(error); }
}

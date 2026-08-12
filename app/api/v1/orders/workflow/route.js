import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { PATCH as patchWorkflow } from "../../../orders/workflow/route";

export const runtime = "nodejs";

export const PATCH = withApiV1(patchWorkflow, { scopes: ["orders:write"] });
export { apiV1Options as OPTIONS };

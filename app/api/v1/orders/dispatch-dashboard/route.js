import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { POST as dispatchDashboard } from "../../../orders/dispatch-dashboard/route";

export const runtime = "nodejs";

export const POST = withApiV1(dispatchDashboard, { scopes: ["reports:read"] });
export { apiV1Options as OPTIONS };

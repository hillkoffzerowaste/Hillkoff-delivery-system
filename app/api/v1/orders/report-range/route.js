import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { POST as reportRange } from "../../../orders/report-range/route";

export const runtime = "nodejs";

export const POST = withApiV1(reportRange, { scopes: ["reports:read"] });
export { apiV1Options as OPTIONS };

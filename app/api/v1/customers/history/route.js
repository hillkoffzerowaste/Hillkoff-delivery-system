import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { GET as customerHistory } from "../../../customers/history/route";

export const runtime = "nodejs";

export const GET = withApiV1(customerHistory, { scopes: ["customers:read"] });
export { apiV1Options as OPTIONS };

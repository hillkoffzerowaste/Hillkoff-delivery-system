import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { PATCH as patchRounds } from "../../../orders/chiangmai-rounds/route";

export const runtime = "nodejs";

export const PATCH = withApiV1(patchRounds, { scopes: ["orders:write"] });
export { apiV1Options as OPTIONS };

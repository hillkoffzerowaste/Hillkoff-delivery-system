import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { POST as completeChiangmaiOrders } from "../../../orders/chiangmai-complete/route";

export const runtime = "nodejs";

export const POST = withApiV1(completeChiangmaiOrders, { scopes: ["orders:write"] });
export { apiV1Options as OPTIONS };

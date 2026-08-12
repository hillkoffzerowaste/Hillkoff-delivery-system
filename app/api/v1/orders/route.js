import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { GET as searchOrders } from "../../orders/search/route";
import { POST as createOrder } from "../../orders/create/route";

export const runtime = "nodejs";

export const GET = withApiV1(searchOrders, { scopes: ["orders:read"] });
export const POST = withApiV1(createOrder, { scopes: ["orders:write"] });
export { apiV1Options as OPTIONS };

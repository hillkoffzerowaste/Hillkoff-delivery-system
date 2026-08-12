import { apiV1Options, withApiV1 } from "../../../../../lib/apiV1";
import { POST as deleteOrder } from "../../../orders/delete/route";

export const runtime = "nodejs";

export const POST = withApiV1(deleteOrder, { scopes: ["orders:write"] });
export { apiV1Options as OPTIONS };

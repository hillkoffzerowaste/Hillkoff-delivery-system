import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { GET as searchCustomers } from "../../customers/search/route";
import { POST as upsertCustomer } from "../../customers/upsert/route";

export const runtime = "nodejs";

export const GET = withApiV1(searchCustomers, { scopes: ["customers:read"] });
export const POST = withApiV1(upsertCustomer, { scopes: ["customers:write"] });
export { apiV1Options as OPTIONS };

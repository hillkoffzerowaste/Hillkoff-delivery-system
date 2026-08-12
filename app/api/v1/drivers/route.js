import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { GET as listDrivers, POST as upsertDriver, DELETE as disableDriver } from "../../driver-master/route";

export const runtime = "nodejs";

export const GET = withApiV1(listDrivers, { scopes: ["drivers:read"] });
export const POST = withApiV1(upsertDriver, { scopes: ["drivers:write"] });
export const PATCH = withApiV1(upsertDriver, { scopes: ["drivers:write"] });
export const DELETE = withApiV1(disableDriver, { scopes: ["drivers:write"] });
export { apiV1Options as OPTIONS };

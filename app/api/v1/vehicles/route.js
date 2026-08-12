import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { GET as listVehicles, POST as upsertVehicle, DELETE as disableVehicle } from "../../vehicle-master/route";

export const runtime = "nodejs";

export const GET = withApiV1(listVehicles, { scopes: ["vehicles:read"] });
export const POST = withApiV1(upsertVehicle, { scopes: ["vehicles:write"] });
export const PATCH = withApiV1(upsertVehicle, { scopes: ["vehicles:write"] });
export const DELETE = withApiV1(disableVehicle, { scopes: ["vehicles:write"] });
export { apiV1Options as OPTIONS };

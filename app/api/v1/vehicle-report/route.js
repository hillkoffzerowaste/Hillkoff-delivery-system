import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { POST as queryVehicleReport } from "../../vehicle-report/query/route";

export const runtime = "nodejs";

export const POST = withApiV1(queryVehicleReport, { scopes: ["reports:read"] });
export { apiV1Options as OPTIONS };

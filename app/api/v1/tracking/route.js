import { apiV1Options, withApiV1 } from "../../../../lib/apiV1";
import { authenticateApiKey } from "../../../../lib/apiClientStore";
import { GET as publicTrack } from "../../public/track/route";

export const runtime = "nodejs";

// The public tracking endpoint is unauthenticated by design; the v1 mirror
// always demands a key so partner traffic is attributable and rate limited.
export const GET = withApiV1(async (request) => {
  await authenticateApiKey(request, ["tracking:read"]);
  return publicTrack(request);
}, { scopes: ["tracking:read"] });

export { apiV1Options as OPTIONS };

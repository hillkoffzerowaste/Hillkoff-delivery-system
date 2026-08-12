import { apiV1Json, apiV1Options } from "../../../../lib/apiV1";
import { authenticateApiKey } from "../../../../lib/apiClientStore";
import { errorResponse } from "../../../../lib/workflowAuth";
import { normalizeRoles } from "../../../../lib/apiClients";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { client } = await authenticateApiKey(request);
    return apiV1Json(request, {
      ok: true,
      data: {
        clientId: client.id,
        name: client.name || "",
        keyPrefix: client.keyPrefix || "",
        scopes: Array.isArray(client.scopes) ? client.scopes : [],
        roles: normalizeRoles(client.roles),
        origins: Array.isArray(client.origins) ? client.origins : [],
        rateLimitPerMinute: client.rateLimitPerMinute ?? null,
        expiresAt: client.expiresAt || "",
        lastUsedAt: client.lastUsedAt || ""
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export { apiV1Options as OPTIONS };

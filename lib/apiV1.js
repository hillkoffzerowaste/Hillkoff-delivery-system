import { corsHeaders, extractApiKey } from "./apiClients";
import { authenticateApiKey } from "./apiClientStore";
import { errorResponse } from "./workflowAuth";

export const API_V1_VERSION = "2026-08-12";

function withHeaders(response, headers) {
  const entries = Object.entries(headers || {});
  if (!entries.length) return response;
  const next = new Headers(response.headers);
  for (const [key, value] of entries) next.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: next });
}

/**
 * Wraps an existing route handler for the `/api/v1` namespace: enforces the
 * scopes an API key must carry, then delegates to the handler unchanged so the
 * business rules stay in one place. Requests authenticated with a Firebase ID
 * token skip the scope check and keep their normal role restrictions.
 */
export function withApiV1(handler, { scopes = [] } = {}) {
  return async function apiV1Route(request, context) {
    const origin = request.headers.get("origin") || "";
    let client = null;
    try {
      if (extractApiKey(request)) {
        ({ client } = await authenticateApiKey(request, scopes));
      }
      const response = await handler(request, context);
      return withHeaders(response, corsHeaders(origin, client));
    } catch (error) {
      return withHeaders(errorResponse(error), corsHeaders(origin, client));
    }
  };
}

export function apiV1Options(request) {
  const origin = request.headers.get("origin") || "";
  const headers = corsHeaders(origin, null);
  return new Response(null, { status: 204, headers });
}

export function apiV1Json(request, data, init = {}) {
  const origin = request.headers.get("origin") || "";
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders(origin, null), "Cache-Control": "no-store", ...(init.headers || {}) }
  });
}

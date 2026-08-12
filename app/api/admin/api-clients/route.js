import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { createApiClient, listApiClients, rotateApiClientKey, updateApiClient } from "../../../../lib/apiClientStore";
import { API_CLIENT_ROLES, API_SCOPES, FULL_ACCESS_SCOPE } from "../../../../lib/apiClients";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    return Response.json({
      ok: true,
      data: await listApiClients(db),
      meta: { scopes: [FULL_ACCESS_SCOPE, ...API_SCOPES], roles: API_CLIENT_ROLES }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const { client, key } = await createApiClient(db, body, profile);
    return Response.json({ ok: true, data: { client, key } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const id = String(body?.id || "");
    if (body?.action === "rotate") {
      const { client, key } = await rotateApiClientKey(db, id, profile);
      return Response.json({ ok: true, data: { client, key } }, { headers: { "Cache-Control": "no-store" } });
    }
    const { id: _ignored, action: _action, ...patch } = body || {};
    return Response.json({ ok: true, data: await updateApiClient(db, id, patch, profile) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin"]);
    const body = await request.json();
    const client = await updateApiClient(db, String(body?.id || ""), { active: false }, profile);
    return Response.json({ ok: true, data: client }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

import { createBackup } from "../../../../lib/backup/backupService.js";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await requireProfile(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    const result = await createBackup(String(body?.reason || "manual"));
    return Response.json({ ok: true, message: "Backup created", data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

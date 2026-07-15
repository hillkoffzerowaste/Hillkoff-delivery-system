import { getBackupMetadata } from "../../../../../lib/backup/backupService.js";
import { errorResponse, requireProfile } from "../../../../../lib/workflowAuth.js";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    await requireProfile(request, ["admin"]);
    const { date } = await params;
    return Response.json({ ok: true, data: await getBackupMetadata(date) });
  } catch (error) {
    return errorResponse(error);
  }
}

import { getBackupMetadata, listBackups } from "../../../../lib/backup/backupService.js";
import { createBackupSummary } from "../../../../lib/utils/backupUtils.js";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth.js";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await requireProfile(request, ["admin"]);
    const backups = await listBackups();
    const latestMetadata = backups.length ? await getBackupMetadata(backups[0]).catch(() => null) : null;
    return Response.json({ ok: true, backups, summary: createBackupSummary(backups.map((id) => id.slice(0, 10))), latestMetadata });
  } catch (error) {
    return errorResponse(error);
  }
}

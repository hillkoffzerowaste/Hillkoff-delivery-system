/**
 * GET /api/backup/list
 * List all available backups
 */

import { listBackups, getBackupMetadata, formatBytes } from "@/lib/backup/backupService";
import { createBackupSummary } from "@/lib/utils/backupUtils";

export async function GET(request) {
  try {
    const backups = await listBackups();
    const summary = createBackupSummary(backups);

    // Get metadata for latest backup
    let latestMetadata = null;
    if (backups.length > 0) {
      try {
        latestMetadata = await getBackupMetadata(backups[0]);
      } catch (error) {
        console.warn("Could not read latest backup metadata:", error.message);
      }
    }

    return Response.json({
      ok: true,
      backups: backups,
      summary: summary,
      latestMetadata: latestMetadata
    });
  } catch (error) {
    console.error("❌ Backup list error:", error);
    return Response.json(
      {
        ok: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

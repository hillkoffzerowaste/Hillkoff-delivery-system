/**
 * POST /api/backup/now
 * Trigger a backup immediately
 */

import { createBackup } from "@/lib/backup/backupService";
import { requireProfile } from "@/lib/workflowAuth";

export async function POST(request) {
  try {
    await requireProfile(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "manual";

    console.log(`📤 Backup API called: ${reason}`);

    const result = await createBackup(reason);

    return Response.json({
      ok: true,
      message: "Backup created successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Backup API error:", error);
    return Response.json(
      {
        ok: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

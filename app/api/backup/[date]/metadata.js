/**
 * GET /api/backup/[date]/metadata
 * Get metadata for a specific backup
 */
import { requireProfile } from "@/lib/workflowAuth";

export async function GET(request, { params }) {
  try {
    await requireProfile(request, ["admin"]);
    const { date } = params;

    if (!date) {
      return Response.json(
        {
          ok: false,
          error: "Backup date is required"
        },
        { status: 400 }
      );
    }

    // Dynamic import to avoid server component issues
    const { getBackupMetadata } = await import("@/lib/backup/backupService");

    const metadata = await getBackupMetadata(date);

    return Response.json({
      ok: true,
      data: metadata
    });
  } catch (error) {
    console.error("❌ Error fetching metadata:", error);
    return Response.json(
      {
        ok: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

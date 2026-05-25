/**
 * POST /api/backup/restore
 * Restore data from a backup snapshot
 * WARNING: This will DELETE existing data!
 */

import { getBackupTableData } from "@/lib/backup/backupService";
import { restoreFromBackup } from "@/lib/backup/supabaseBackup";

export async function POST(request) {
  try {
    const body = await request.json();
    const { backupDate, tables, confirm } = body;

    // Safety check - require explicit confirmation
    if (!confirm || confirm !== "YES_DELETE_ALL_DATA") {
      return Response.json(
        {
          ok: false,
          error: "Restore requires confirmation. Pass confirm='YES_DELETE_ALL_DATA' to proceed."
        },
        { status: 400 }
      );
    }

    if (!backupDate) {
      return Response.json(
        {
          ok: false,
          error: "backupDate is required (format: YYYY-MM-DD)"
        },
        { status: 400 }
      );
    }

    console.log(`🔄 Restoring from backup: ${backupDate}`);

    // Load backup data
    const tablesToRestore = tables || [
      "customers",
      "orders",
      "drivers",
      "chat_messages",
      "driver_locations"
    ];

    const backupData = {};
    for (const table of tablesToRestore) {
      try {
        backupData[table] = await getBackupTableData(backupDate, table);
        console.log(`  ✅ Loaded ${table}: ${backupData[table].length} rows`);
      } catch (error) {
        console.warn(`  ⚠️  Could not load ${table}:`, error.message);
        backupData[table] = [];
      }
    }

    // Restore to Supabase
    const result = await restoreFromBackup(backupData, tablesToRestore);

    return Response.json({
      ok: true,
      message: "Restore completed successfully",
      data: result
    });
  } catch (error) {
    console.error("❌ Restore error:", error);
    return Response.json(
      {
        ok: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

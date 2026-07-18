import { loadBackup } from "../../../../lib/backup/backupService.js";
import { restoreFirestoreBackup } from "../../../../lib/backup/firestoreBackup.js";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth.js";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request) {
  try {
    await requireProfile(request, ["admin"]);
    const body = await request.json();
    const backupId = String(body?.backupId || "");
    const replace = body?.replace === true;
    const requiredConfirmation = replace ? "YES_REPLACE_FIRESTORE_DATA" : "YES_MERGE_FIRESTORE_DATA";
    if (body?.confirm !== requiredConfirmation) {
      return Response.json({ ok: false, error: `Restore requires confirm='${requiredConfirmation}'` }, { status: 400 });
    }
    const collections = Array.isArray(body?.collections) ? body.collections.map(String).slice(0, 100) : null;
    const { selected, data } = await loadBackup(backupId, collections);
    const result = await restoreFirestoreBackup(data, selected, { replace });
    return Response.json({ ok: true, message: "Firestore restore completed", data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

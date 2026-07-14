import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

async function deleteCollectionBatch(db, collectionPath, batchSize = 300) {
  const colRef = db.collection(collectionPath);
  const snap = await colRef.orderBy("__name__").limit(batchSize).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    let deleted = 0;
    // Loop batches until empty
    for (let i = 0; i < 50; i++) {
      const n = await deleteCollectionBatch(db, "orders", 300);
      deleted += n;
      if (n === 0) break;
    }
    return Response.json({ ok: true, deleted });
  } catch (error) { return errorResponse(error); }
}

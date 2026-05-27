import { getAdminDb } from "../../../../lib/firebaseAdmin";

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
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const password = String(payload?.password || "");
  if (password !== "2532") return Response.json({ ok: false, error: "Invalid password" }, { status: 401 });

  try {
    const db = getAdminDb();
    let deleted = 0;
    // Loop batches until empty
    for (let i = 0; i < 50; i++) {
      const n = await deleteCollectionBatch(db, "orders", 300);
      deleted += n;
      if (n === 0) break;
    }
    return Response.json({ ok: true, deleted });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

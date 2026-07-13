import "dotenv/config";
import { getAdminDb } from "../lib/firebaseAdmin.js";

const db = getAdminDb();
const snap = await db.collection("orders").get();
let batch = db.batch();
let count = 0;
for (const doc of snap.docs) {
  const data = doc.data() || {};
  if (data.customerPhoneDigits) continue;
  const digits = String(data.customerPhone || "").replace(/\D/g, "");
  if (!digits) continue;
  batch.set(doc.ref, { customerPhoneDigits: digits }, { merge: true });
  count += 1;
  if (count % 400 === 0) { await batch.commit(); batch = db.batch(); }
}
if (count % 400) await batch.commit();
console.log(`Backfilled customerPhoneDigits for ${count} orders.`);

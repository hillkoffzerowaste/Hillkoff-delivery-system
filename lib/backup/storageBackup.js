import fs from "node:fs/promises";
import path from "node:path";
import { getAdminStorage } from "../firebaseAdmin.js";

export async function uploadToStorage(backupPath, backupId) {
  const bucket = getAdminStorage().bucket();
  const files = await fs.readdir(backupPath, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;
    await bucket.upload(path.join(backupPath, file.name), {
      destination: `backups/snapshots/${backupId}/${file.name}`,
      metadata: { contentType: "application/json", cacheControl: "no-store" },
      resumable: false
    });
  }
  return { ok: true, bucket: bucket.name, backupId };
}

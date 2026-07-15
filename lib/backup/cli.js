import dotenv from "dotenv";
import { createBackup, listBackups, loadBackup } from "./backupService.js";
import { restoreFirestoreBackup } from "./firestoreBackup.js";

dotenv.config({ path: ".env.local" });

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function main() {
  const command = process.argv[2] || "backup";
  if (command === "backup") {
    const result = await createBackup(argument("--reason") || "manual-cli");
    console.log(JSON.stringify({ ok: true, backupId: result.metadata.backupId, collections: result.metadata.collections }, null, 2));
    return;
  }
  if (command === "list") {
    console.log(JSON.stringify(await listBackups(), null, 2));
    return;
  }
  if (command === "restore") {
    const backupId = argument("--id");
    const confirm = argument("--confirm");
    if (confirm !== "YES_REPLACE_FIRESTORE_DATA") throw new Error("Pass --confirm YES_REPLACE_FIRESTORE_DATA to restore");
    const collections = argument("--collections").split(",").map((value) => value.trim()).filter(Boolean);
    const loaded = await loadBackup(backupId, collections.length ? collections : null);
    console.log(JSON.stringify(await restoreFirestoreBackup(loaded.data, loaded.selected, { replace: true }), null, 2));
    return;
  }
  throw new Error(`Unknown backup command: ${command}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

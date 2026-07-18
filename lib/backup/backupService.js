import fs from "node:fs/promises";
import path from "node:path";
import { fetchAllData, getTableStats } from "./firestoreBackup.js";
import { uploadToStorage } from "./storageBackup.js";
import { generateChecksum, getCurrentTimestamp } from "../utils/backupUtils.js";

const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.BACKUP_DIR)
  : path.join(process.cwd(), "backups", "snapshots");
const RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10) || 30);
const BACKUP_ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}$/;
const COLLECTION_PATTERN = /^[A-Za-z0-9_-]{1,1500}$/;

function createBackupId(date = new Date()) {
  return date.toISOString().replace("T", "_").replace(/[:.]/g, "-").replace("Z", "");
}

function safeBackupPath(backupId) {
  if (!BACKUP_ID_PATTERN.test(String(backupId || ""))) throw new Error("Invalid backup ID");
  return path.join(BACKUP_DIR, backupId);
}

function safeCollectionName(name) {
  if (!COLLECTION_PATTERN.test(String(name || ""))) throw new Error("Invalid collection name");
  return String(name);
}

async function writeJsonAtomic(filePath, value) {
  const content = JSON.stringify(value, null, 2);
  const temporary = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporary, filePath);
  return content;
}

export async function createBackup(reason = "manual") {
  const startTime = Date.now();
  const timestamp = getCurrentTimestamp();
  const backupId = createBackupId(new Date(timestamp));
  const backupPath = safeBackupPath(backupId);
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(backupPath, { recursive: false });

  try {
    const data = await fetchAllData();
    const stats = getTableStats(data);
    const files = {};
    for (const [collectionName, rows] of Object.entries(data)) {
      const safeName = safeCollectionName(collectionName);
      const content = await writeJsonAtomic(path.join(backupPath, `${safeName}.json`), rows);
      files[safeName] = {
        size: Buffer.byteLength(content, "utf8"),
        rows: rows.length,
        checksum: generateChecksum(content)
      };
    }

    const metadata = {
      backupId,
      timestamp,
      timezone: "UTC",
      source: "firebase",
      version: "3.0",
      reason: String(reason || "manual").trim().slice(0, 120),
      collections: stats,
      files,
      totalSize: Object.values(files).reduce((sum, file) => sum + file.size, 0),
      durationMs: Date.now() - startTime,
      authNote: "Auth user metadata is backed up; passwords and provider credentials are not restorable.",
      success: true
    };
    await writeJsonAtomic(path.join(backupPath, "backup-metadata.json"), metadata);

    if (process.env.BACKUP_UPLOAD_TO_CLOUD === "true") await uploadToStorage(backupPath, backupId);
    await cleanupOldBackups();
    return { success: true, metadata };
  } catch (error) {
    await fs.rm(backupPath, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function listBackups() {
  try {
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && BACKUP_ID_PATTERN.test(entry.name)).map((entry) => entry.name).sort().reverse();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function getBackupMetadata(backupId) {
  return JSON.parse(await fs.readFile(path.join(safeBackupPath(backupId), "backup-metadata.json"), "utf8"));
}

export async function getBackupTableData(backupId, collectionName) {
  const safeName = safeCollectionName(collectionName);
  return JSON.parse(await fs.readFile(path.join(safeBackupPath(backupId), `${safeName}.json`), "utf8"));
}

export async function loadBackup(backupId, collectionNames = null) {
  const metadata = await getBackupMetadata(backupId);
  const available = Object.keys(metadata.files || {});
  const selected = collectionNames?.length ? collectionNames.map(safeCollectionName) : available;
  for (const name of selected) if (!available.includes(name)) throw new Error(`Collection not found in backup: ${name}`);
  const data = {};
  for (const name of selected) {
    const filePath = path.join(safeBackupPath(backupId), `${name}.json`);
    const content = await fs.readFile(filePath, "utf8");
    if (generateChecksum(content) !== metadata.files[name].checksum) throw new Error(`Checksum mismatch: ${name}`);
    data[name] = JSON.parse(content);
  }
  return { metadata, selected, data };
}

export async function cleanupOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const backupId of await listBackups()) {
    const created = new Date(backupId.slice(0, 10)).getTime();
    if (Number.isFinite(created) && created < cutoff) await fs.rm(safeBackupPath(backupId), { recursive: true, force: true });
  }
}

export function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Math.round((bytes / 1024 ** index) * 100) / 100} ${units[index]}`;
}

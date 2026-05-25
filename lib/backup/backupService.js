/**
 * Backup Service
 * Manages automatic backups, scheduling, and storage
 */

import { fetchAllData, getTableStats } from "./supabaseBackup.js";
import { uploadToStorage } from "./storageBackup.js";
import { generateChecksum, getCurrentTimestamp, formatDate } from "../utils/backupUtils.js";
import fs from "fs/promises";
import path from "path";

const BACKUP_DIR = process.env.BACKUP_DIR || "./backups/snapshots";
const RETENTION_DAYS = process.env.BACKUP_RETENTION_DAYS || 30;

/**
 * Create a backup snapshot
 * @param {string} reason - Why backup was triggered (auto, manual, deploy)
 * @returns {Promise<Object>} Backup result
 */
export async function createBackup(reason = "manual") {
  const startTime = Date.now();
  const timestamp = getCurrentTimestamp();
  const dateFolder = formatDate(new Date());

  try {
    console.log(`\n🔄 Starting backup: ${reason} (${timestamp})`);

    // Fetch all data
    console.log("📥 Fetching data from Supabase...");
    const data = await fetchAllData();
    const stats = await getTableStats();

    // Generate backup files
    const backupPath = path.join(BACKUP_DIR, dateFolder);
    await fs.mkdir(backupPath, { recursive: true });

    // Save individual table files
    const files = {};
    for (const [tableName, tableData] of Object.entries(data)) {
      const filePath = path.join(backupPath, `${tableName}.json`);
      const content = JSON.stringify(tableData, null, 2);
      await fs.writeFile(filePath, content, "utf8");
      files[tableName] = {
        path: filePath,
        size: content.length,
        rows: tableData.length,
        checksum: generateChecksum(content)
      };
      console.log(`  ✅ ${tableName}: ${tableData.length} rows`);
    }

    // Create metadata file
    const metadata = {
      timestamp: timestamp,
      date: dateFolder,
      timezone: "Asia/Bangkok",
      version: "2.0",
      reason: reason,
      tables: stats,
      files: files,
      totalSize: Object.values(files).reduce((sum, f) => sum + f.size, 0),
      duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
      success: true
    };

    const metadataPath = path.join(backupPath, "backup-metadata.json");
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    console.log(`✅ Backup complete in ${metadata.duration}`);
    console.log(`📊 Total size: ${formatBytes(metadata.totalSize)}`);

    // Upload to cloud storage (optional)
    if (process.env.BACKUP_UPLOAD_TO_CLOUD === "true") {
      console.log("☁️  Uploading to cloud storage...");
      try {
        await uploadToStorage(backupPath, dateFolder);
        console.log("✅ Cloud upload complete");
      } catch (uploadError) {
        console.error("⚠️  Cloud upload failed (backup still local):", uploadError.message);
      }
    }

    // Cleanup old backups
    await cleanupOldBackups();

    return { success: true, metadata };
  } catch (error) {
    console.error("❌ Backup failed:", error);
    throw error;
  }
}

/**
 * List available backups
 * @returns {Promise<Array>} List of backup dates
 */
export async function listBackups() {
  try {
    const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
    const backups = entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
      .reverse();

    return backups;
  } catch (error) {
    console.error("❌ Error listing backups:", error);
    return [];
  }
}

/**
 * Get metadata for a specific backup
 * @param {string} backupDate - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Backup metadata
 */
export async function getBackupMetadata(backupDate) {
  try {
    const metadataPath = path.join(BACKUP_DIR, backupDate, "backup-metadata.json");
    const content = await fs.readFile(metadataPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading backup metadata for ${backupDate}:`, error);
    throw error;
  }
}

/**
 * Get content of a specific backup file
 * @param {string} backupDate - Date in YYYY-MM-DD format
 * @param {string} tableName - Table name
 * @returns {Promise<Array>} Table data
 */
export async function getBackupTableData(backupDate, tableName) {
  try {
    const filePath = path.join(BACKUP_DIR, backupDate, `${tableName}.json`);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading ${tableName} from ${backupDate}:`, error);
    throw error;
  }
}

/**
 * Cleanup backups older than retention period
 */
export async function cleanupOldBackups() {
  try {
    const backups = await listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    for (const backup of backups) {
      const backupDate = new Date(backup);
      if (backupDate < cutoffDate) {
        const backupPath = path.join(BACKUP_DIR, backup);
        console.log(`🗑️  Removing old backup: ${backup}`);
        await fs.rm(backupPath, { recursive: true });
      }
    }
  } catch (error) {
    console.error("⚠️  Error during cleanup:", error);
    // Don't throw - this is non-critical
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

export { formatBytes };

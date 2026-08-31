/**
 * Backup Utilities
 * Helper functions for backup operations
 */

import crypto from "crypto";

/**
 * Generate SHA-256 checksum for data integrity
 * @param {string} data - Data to checksum
 * @returns {string} SHA-256 hash
 */
export function generateChecksum(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Get current timestamp in ISO format
 * @returns {string} ISO timestamp
 */
export function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Format date as YYYY-MM-DD
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
export function formatDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Parsed date
 */
export function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return new Date(year, month - 1, day);
}

/**
 * Calculate days between two dates
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {number} Days difference
 */
export function daysBetween(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to - from) / msPerDay);
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted size
 */
export function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Generate a backup report
 * @param {Object} metadata - Backup metadata
 * @returns {string} Human-readable report
 */
export function generateReport(metadata) {
  const timestamp = String(metadata?.timestamp || "");
  const collections = metadata?.collections || metadata?.tables || {};
  const durationMs = Number(metadata?.durationMs ?? metadata?.duration ?? 0);
  const lines = [
    "=" .repeat(50),
    "BACKUP REPORT",
    "=" .repeat(50),
    `Timestamp: ${timestamp || "-"}`,
    `Date: ${timestamp ? timestamp.slice(0, 10) : "-"}`,
    `Reason: ${metadata?.reason || "-"}`,
    `Duration: ${Number.isFinite(durationMs) ? `${durationMs} ms` : "-"}`,
    `Total Size: ${formatBytes(Number(metadata?.totalSize || 0))}`,
    "",
    "TABLE STATISTICS:",
    ...Object.entries(collections).map(([table, count]) => `  ${table}: ${count} rows`),
    "",
    "FILES:",
    ...Object.entries(metadata?.files || {}).map(([table, info]) =>
      `  ${table}.json: ${info?.rows || 0} rows, ${formatBytes(Number(info?.size || 0))}`
    ),
    "=" .repeat(50)
  ];
  return lines.join("\n");
}

/**
 * Verify checksum integrity
 * @param {string} data - Data to verify
 * @param {string} expectedChecksum - Expected SHA-256 hash
 * @returns {boolean} True if checksums match
 */
export function verifyChecksum(data, expectedChecksum) {
  const actualChecksum = generateChecksum(data);
  return actualChecksum === expectedChecksum;
}

/**
 * Create a backup summary
 * @param {Array} backups - Array of backup dates
 * @returns {Object} Summary statistics
 */
export function createBackupSummary(backups) {
  if (backups.length === 0) {
    return {
      totalBackups: 0,
      dateRange: null,
      avgPerDay: 0
    };
  }

  const oldest = parseDate(backups[backups.length - 1]);
  const newest = parseDate(backups[0]);
  const days = daysBetween(oldest, newest) + 1;

  return {
    totalBackups: backups.length,
    dateRange: {
      from: backups[backups.length - 1],
      to: backups[0]
    },
    spanDays: days,
    avgPerDay: (backups.length / days).toFixed(2)
  };
}

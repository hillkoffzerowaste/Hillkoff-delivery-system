/**
 * Cloud Storage Backup Module
 * Uploads backups to Supabase Storage
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const STORAGE_BUCKET = "backups";

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Upload backup directory to Supabase Storage
 * @param {string} backupPath - Local path to backup folder
 * @param {string} backupDate - Date folder name (YYYY-MM-DD)
 */
export async function uploadToStorage(backupPath, backupDate) {
  const supabase = getSupabaseClient();

  try {
    // List all files in backup directory
    const files = await fs.readdir(backupPath);

    for (const fileName of files) {
      const filePath = path.join(backupPath, fileName);
      const fileContent = await fs.readFile(filePath);
      const remotePath = `snapshots/${backupDate}/${fileName}`;

      console.log(`  📤 Uploading: ${remotePath}`);

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(remotePath, fileContent, {
          upsert: true,
          contentType: "application/json"
        });

      if (error) throw error;
    }

    console.log(`✅ All files uploaded for ${backupDate}`);
  } catch (error) {
    console.error("❌ Storage upload error:", error);
    throw error;
  }
}

/**
 * Download backup from cloud storage
 * @param {string} backupDate - Date in YYYY-MM-DD format
 * @param {string} tableName - Table name (optional, for single file)
 * @returns {Promise<Object>} Downloaded data
 */
export async function downloadFromStorage(backupDate, tableName = null) {
  const supabase = getSupabaseClient();

  try {
    if (tableName) {
      // Download single file
      const remotePath = `snapshots/${backupDate}/${tableName}.json`;
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(remotePath);

      if (error) throw error;

      const text = await data.text();
      return JSON.parse(text);
    } else {
      // Download all files for a date
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(`snapshots/${backupDate}`);

      if (error) throw error;

      const result = {};
      for (const file of data) {
        if (file.name.endsWith(".json")) {
          const fileData = await downloadFromStorage(backupDate, file.name.replace(".json", ""));
          result[file.name.replace(".json", "")] = fileData;
        }
      }

      return result;
    }
  } catch (error) {
    console.error("❌ Storage download error:", error);
    throw error;
  }
}

/**
 * List backups in cloud storage
 * @returns {Promise<Array>} List of backup folders
 */
export async function listStorageBackups() {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list("snapshots", {
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "desc" }
      });

    if (error) throw error;

    return data
      .filter(item => item.id) // Filter out metadata items
      .map(item => item.name);
  } catch (error) {
    console.error("❌ Error listing storage backups:", error);
    return [];
  }
}

/**
 * Delete backup from cloud storage
 * @param {string} backupDate - Date in YYYY-MM-DD format
 */
export async function deleteStorageBackup(backupDate) {
  const supabase = getSupabaseClient();

  try {
    // List all files in the backup folder
    const { data, error: listError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .list(`snapshots/${backupDate}`);

    if (listError) throw listError;

    // Delete all files
    for (const file of data) {
      const filePath = `snapshots/${backupDate}/${file.name}`;
      const { error: deleteError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      if (deleteError) throw deleteError;
    }

    console.log(`✅ Deleted backup from cloud: ${backupDate}`);
  } catch (error) {
    console.error("❌ Error deleting storage backup:", error);
    throw error;
  }
}

export { STORAGE_BUCKET };

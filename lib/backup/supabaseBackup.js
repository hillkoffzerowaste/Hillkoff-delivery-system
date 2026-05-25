/**
 * Supabase Backup Module
 * Handles fetching and backing up all data from Supabase
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Initialize Supabase client
 * Uses service key for server-side operations (if available)
 * Falls back to anon key
 */
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Fetch all data from Supabase tables
 * @returns {Promise<Object>} All table data
 */
export async function fetchAllData() {
  const supabase = getSupabaseClient();
  
  try {
    const [customers, orders, drivers, chatMessages, driverLocations] = await Promise.all([
      supabase.from("customers").select("*"),
      supabase.from("orders").select("*"),
      supabase.from("drivers").select("*"),
      supabase.from("chat_messages").select("*"),
      supabase.from("driver_locations").select("*")
    ]);

    if (customers.error) throw customers.error;
    if (orders.error) throw orders.error;
    if (drivers.error) throw drivers.error;
    if (chatMessages.error) throw chatMessages.error;
    if (driverLocations.error) throw driverLocations.error;

    return {
      customers: customers.data || [],
      orders: orders.data || [],
      drivers: drivers.data || [],
      chat_messages: chatMessages.data || [],
      driver_locations: driverLocations.data || []
    };
  } catch (error) {
    console.error("❌ Error fetching backup data:", error);
    throw error;
  }
}

/**
 * Restore data from backup into Supabase
 * WARNING: This will DELETE existing data!
 * @param {Object} backupData - The backup data object
 * @param {Array<string>} tables - Which tables to restore (default: all)
 */
export async function restoreFromBackup(backupData, tables = null) {
  const supabase = getSupabaseClient();
  const tablesToRestore = tables || [
    "customers",
    "orders",
    "drivers",
    "chat_messages",
    "driver_locations"
  ];

  try {
    // Step 1: Delete all existing data (CAREFUL!)
    for (const tableName of tablesToRestore) {
      console.log(`🗑️  Clearing table: ${tableName}`);
      const { error } = await supabase.from(tableName).delete().neq("id", "");
      if (error) throw error;
    }

    // Step 2: Insert backup data
    for (const tableName of tablesToRestore) {
      if (!backupData[tableName] || backupData[tableName].length === 0) {
        console.log(`⏭️  No data for ${tableName}, skipping...`);
        continue;
      }

      console.log(`📥 Restoring ${tableName}...`);
      const { error } = await supabase.from(tableName).insert(backupData[tableName]);
      if (error) throw error;

      console.log(`✅ ${tableName}: ${backupData[tableName].length} rows inserted`);
    }

    return { success: true, message: "Restore complete" };
  } catch (error) {
    console.error("❌ Error restoring backup:", error);
    throw error;
  }
}

/**
 * Get row counts for all tables
 * @returns {Promise<Object>} Table statistics
 */
export async function getTableStats() {
  const supabase = getSupabaseClient();
  
  try {
    const tables = ["customers", "orders", "drivers", "chat_messages", "driver_locations"];
    const stats = {};

    for (const tableName of tables) {
      const { count, error } = await supabase
        .from(tableName)
        .select("id", { count: "exact", head: true });

      if (error) throw error;
      stats[tableName] = count || 0;
    }

    return stats;
  } catch (error) {
    console.error("❌ Error getting table stats:", error);
    throw error;
  }
}

/**
 * Verify table schema exists
 * @returns {Promise<boolean>} True if all tables exist
 */
export async function verifySchema() {
  const supabase = getSupabaseClient();
  const tables = ["customers", "orders", "drivers", "chat_messages", "driver_locations"];

  try {
    for (const tableName of tables) {
      const { data, error } = await supabase.from(tableName).select("*").limit(0);
      if (error) {
        console.error(`❌ Table missing: ${tableName}`);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("❌ Error verifying schema:", error);
    return false;
  }
}

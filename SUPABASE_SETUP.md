# 🚀 Supabase Setup & Reset Guide (Legacy)

> เอกสารนี้เก็บไว้เพื่ออ้างอิงระบบเก่าเท่านั้น ระบบปัจจุบันใช้ Firebase/Firestore
> และ backup module ไม่ได้เชื่อมต่อ Supabase แล้ว ดู `README.md` และ `BACKUP_SYSTEM.md`

## 📋 Checklist: Reset and Configure Supabase

### Step 1: Reset Supabase Database (Manual via Dashboard)

**⚠️ WARNING: This will DELETE all data permanently!**

1. **Go to Supabase Dashboard**
   - Open: https://app.supabase.com
   - Select project: "jerggqygfojqqenazqqt" (Hillkoff)

2. **Drop All Tables**
   - Go to: **SQL Editor**
   - Click: **New Query**
   - Run this SQL script:

```sql
-- Drop all tables if they exist
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.driver_locations CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;

-- Run this query to confirm deletion
SELECT * FROM information_schema.tables WHERE table_schema = 'public';
```

   - **Result**: Should show 0 tables in public schema

3. **Verify Tables Are Deleted**
   - Go to: **Table Editor**
   - Should see: **"No tables"** message
   - ✅ Proceed to next step

---

### Step 2: Create New Schema from Fresh Setup

**In Supabase Dashboard → SQL Editor:**

1. **Click: New Query**
2. **Copy and paste the entire content from**:  
   `supabase-setup.sql`
3. **Run the query**
4. **Expected result**: 
   ```
   ✅ queries executed successfully
   ```

5. **Verify in Table Editor**:
   - ✅ customers
   - ✅ orders
   - ✅ drivers
   - ✅ driver_locations
   - ✅ chat_messages

---

### Step 3: Setup Storage Bucket (for Backups)

1. **Go to**: **Storage** → **Buckets**
2. **Click**: **New Bucket**
3. **Configure**:
   - Name: `backups`
   - Privacy: **Public**
   - ✅ Create

4. **Set Bucket Policies**:
   - Go to: **Buckets** → Select `backups`
   - **Policies** tab
   - Click: **Create policy**
   - Select: **For full customization, use custom SQL**

```sql
-- Allow public read/write for backups
CREATE POLICY "Enable public access"
ON storage.objects
FOR ALL
USING (bucket_id = 'backups')
WITH CHECK (bucket_id = 'backups');
```

---

### Step 4: Enable RLS (Row Level Security)

**In SQL Editor, run:**

```sql
-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (allow all for local team)
-- Note: In production, make these more restrictive

-- Customers
CREATE POLICY "Allow all operations on customers"
ON public.customers
FOR ALL
USING (true)
WITH CHECK (true);

-- Orders
CREATE POLICY "Allow all operations on orders"
ON public.orders
FOR ALL
USING (true)
WITH CHECK (true);

-- Drivers
CREATE POLICY "Allow all operations on drivers"
ON public.drivers
FOR ALL
USING (true)
WITH CHECK (true);

-- Driver Locations
CREATE POLICY "Allow all operations on driver_locations"
ON public.driver_locations
FOR ALL
USING (true)
WITH CHECK (true);

-- Chat Messages
CREATE POLICY "Allow all operations on chat_messages"
ON public.chat_messages
FOR ALL
USING (true)
WITH CHECK (true);
```

---

### Step 5: Get Service Key (for Server-Side Operations)

**For backup system to work:**

1. **Go to**: **Settings** → **API**
2. **Find**: `service_role` (secret key)
3. **Copy the key**
4. **Update `.env.local`**:
   ```
   SUPABASE_SERVICE_KEY=eyJ...YOUR_KEY_HERE...
   ```

⚠️ **KEEP THIS SECRET** - Never commit to git!

---

### Step 6: Verify Connection

**Run in terminal:**

```bash
# Install dependencies
npm install

# Test Supabase connection
npm run dev
```

**Check browser console**:
```
✅ Supabase initialized: https://jerggqygfojqqenazqqt.supabase.co
```

---

## 🧪 Testing the Setup

### Test 1: Add Sample Data

**In app (Sales Dashboard)**:

1. Login as Sales
2. Add a customer
3. Create an order
4. Check Supabase dashboard → **Table Editor**
5. ✅ Data appears in `customers` and `orders` tables

### Test 2: Real-time Sync

**In Sales Dashboard**:
1. Open **Orders** tab
2. Edit an order status
3. Watch **Supabase → Table Editor**
4. ✅ Status updates immediately

### Test 3: Driver Operations

**In Driver Dashboard**:
1. Login as Driver
2. Accept an order
3. Check-in
4. Complete delivery
5. Watch **Supabase → Table Editor**:
   - ✅ `driverId` assigned to order
   - ✅ `status` changed
   - ✅ `driver_locations` updated

### Test 4: Backup System

**Trigger backup**:

```bash
npm run backup
```

**Expected output**:
```
🔄 Starting backup: manual (2026-05-25T10:30:00Z)
📥 Fetching data from Supabase...
  ✅ customers: 5 rows
  ✅ orders: 12 rows
  ✅ drivers: 3 rows
  ✅ chat_messages: 15 rows
  ✅ driver_locations: 3 rows
✅ Backup complete in 2s
📊 Total size: 125 KB
```

**Check backup files**:
```
backups/
  └── snapshots/
      └── 2026-05-25/
          ├── customers.json
          ├── orders.json
          ├── drivers.json
          ├── chat_messages.json
          ├── driver_locations.json
          └── backup-metadata.json
```

---

## 🔄 Backup System Operations

### Manual Backup

```bash
npm run backup
```

### List All Backups

```bash
npm run backup:list
```

**Output:**
```
Available backups:
  - 2026-05-25
  - 2026-05-24
  - 2026-05-23
```

### Restore from Backup

⚠️ **WARNING: This will DELETE existing data and restore from snapshot**

```bash
npm run backup:restore --date 2026-05-25
```

### Via API

**Trigger backup (POST)**:
```bash
curl -X POST http://localhost:3000/api/backup/now \
  -H "Content-Type: application/json" \
  -d '{"reason":"manual"}'
```

**List backups (GET)**:
```bash
curl http://localhost:3000/api/backup/list
```

**Restore from backup (POST)**:
```bash
curl -X POST http://localhost:3000/api/backup/restore \
  -H "Content-Type: application/json" \
  -d '{
    "backupDate": "2026-05-25",
    "confirm": "YES_DELETE_ALL_DATA"
  }'
```

---

## 📊 Backup System Features

### Automatic Daily Backup
- ✅ Scheduled for 2 AM Bangkok time daily
- ✅ Runs in background
- ✅ Stores last 30 days
- ✅ Uploads to Supabase storage

### Manual Backup
- ✅ On-demand via CLI or API
- ✅ Triggered before deployments
- ✅ Custom naming with reason

### Backup Contents
```
backup-metadata.json
├── timestamp
├── date
├── tables: { customers, orders, drivers, chat_messages, driver_locations }
├── fileSize
├── integrity: { checksums }
└── nextBackup: scheduled time
```

### Retention Policy
- ✅ Keep last 30 days of daily backups
- ✅ Keep monthly snapshots for 12 months
- ✅ Keep yearly snapshots for 5 years
- ✅ Auto-cleanup old backups

---

## 🚨 Disaster Recovery

### If Data is Corrupted

```bash
# List available backups
npm run backup:list

# Choose a backup date from output
# Example: 2026-05-24

# Restore that backup
npm run backup:restore --date 2026-05-24
```

### Recovery Steps

1. **Identify problem** (what went wrong?)
2. **Find last good backup** (use: `npm run backup:list`)
3. **Verify backup integrity** (check metadata)
4. **Restore backup** (run restore command)
5. **Verify data** (check in dashboard)
6. **Re-enter missing data** (data since last backup)

---

## 🔐 Security Notes

1. **Service Key** (`.env.local`)
   - Never commit to git
   - Store securely
   - Rotate periodically

2. **Database Policies**
   - Currently: "Allow all" (for local team)
   - Production: Add authentication check
   - Production: Restrict by role

3. **Backups**
   - Stored in Supabase Cloud
   - Encrypted at rest by Supabase
   - Consider: Additional backup to external storage

4. **Access Control**
   - Sales can: view/create/edit customers, orders, drivers
   - Drivers can: update own deliveries, add locations
   - Chat: all can read/write

---

## 📱 Environment Variables

### Required for App
```
NEXT_PUBLIC_SUPABASE_URL=https://jerggqygfojqqenazqqt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_DxnczUIpmEWlvN_pQCcnuA_plV6IjOw
```

### Required for Backups
```
SUPABASE_SERVICE_KEY=eyJ...
```

### Optional Backup Config
```
BACKUP_DIR=./backups/snapshots
BACKUP_RETENTION_DAYS=30
BACKUP_UPLOAD_TO_CLOUD=true
ADMIN_EMAIL=admin@hillkoff.local
```

---

## ✅ Verification Checklist

After completing reset and setup:

- [ ] All 5 tables created in Supabase
- [ ] RLS enabled on all tables
- [ ] Storage bucket "backups" created
- [ ] Service key obtained and stored in `.env.local`
- [ ] npm install completed
- [ ] npm run dev works without errors
- [ ] Can add customer in app
- [ ] Data appears in Supabase dashboard
- [ ] Backup system works (npm run backup)
- [ ] Backups store to local folder

---

## 🆘 Troubleshooting

### "Supabase credentials missing"
**Solution**: Check `.env.local` has both URL and ANON_KEY

### "Table does not exist"
**Solution**: Run `supabase-setup.sql` in SQL Editor

### "RLS policy error"
**Solution**: Run RLS setup SQL in Step 4

### "Backup fails: no access to service key"
**Solution**: Add `SUPABASE_SERVICE_KEY` to `.env.local`

### "Backup upload to cloud fails"
**Solution**: Set `BACKUP_UPLOAD_TO_CLOUD=false` in `.env.local` to keep local-only

---

## 📞 Support

If issues occur:

1. **Check logs**:
   - Browser console (F12)
   - Terminal output
   - `backups/logs/backup-*.log`

2. **Test connection**:
   ```bash
   npm run dev
   # Check console for "✅ Supabase initialized"
   ```

3. **Verify schema**:
   - Go to Supabase Dashboard
   - Check Table Editor
   - All 5 tables should exist

4. **Reset and retry**:
   ```bash
   # Clear local storage
   rm -rf backups/
   # Clear local browser cache
   # Reload app
   npm run dev
   ```

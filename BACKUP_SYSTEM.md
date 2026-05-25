# 🔄 Supabase Backup System Architecture

## 📊 System Overview

```
┌────────────────────────────────────────────────────────────┐
│         Hillkoff Delivery - Supabase Backup System          │
├────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────────┐          ┌──────────────────┐       │
│   │   App Frontend   │          │  Supabase Cloud  │       │
│   │  (Next.js)       │◄────────►│  (PostgreSQL)    │       │
│   └────────┬─────────┘          └────────┬─────────┘       │
│            │                             │                  │
│            │ [Insert/Update/Delete]      │                  │
│            │                             │                  │
│            └─────────────┬────────────────┘                 │
│                          ▼                                   │
│         ┌────────────────────────────────┐                  │
│         │   Backup Service (Node.js)     │                  │
│         │   (Can run anywhere)           │                  │
│         └────────────┬───────────────────┘                  │
│                      │                                       │
│        ┌─────────────┴──────────────┐                       │
│        ▼                            ▼                        │
│   ┌─────────────┐          ┌──────────────┐                │
│   │  JSON Dump  │          │  CSV Export  │                │
│   │ Daily/Auto  │          │ For Reports  │                │
│   └──────┬──────┘          └────────┬─────┘                │
│          │                         │                        │
│          └──────────────┬──────────┘                        │
│                         ▼                                    │
│              ┌──────────────────┐                           │
│              │  Supabase Cloud  │                           │
│              │  Storage Bucket  │                           │
│              │  (Or AWS S3)     │                           │
│              └──────────────────┘                           │
│                                                              │
│   ALSO BACKUP:                                              │
│   ├─ POD Photos → Google Drive / Supabase Storage         │
│   ├─ Chat History → JSON backup                           │
│   └─ Daily Snapshots → Timestamped folders                │
│                                                              │
└────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Backup Structure

### **Local Directory Structure** (On backup server/PC)
```
backup/
├── config/
│   └── backup.config.json          # Backup settings
├── logs/
│   ├── backup-2026-05-25.log
│   ├── backup-2026-05-26.log
│   └── ...
├── snapshots/
│   ├── 2026-05-25/
│   │   ├── customers.json
│   │   ├── orders.json
│   │   ├── drivers.json
│   │   ├── chat_messages.json
│   │   ├── driver_locations.json
│   │   └── metadata.json
│   ├── 2026-05-26/
│   │   └── ...
│   └── ...
├── exports/
│   ├── daily-report-2026-05-25.csv
│   ├── driver-performance-2026-05-25.csv
│   ├── orders-summary-2026-05-25.csv
│   └── ...
└── scripts/
    ├── backup.js                    # Main backup script
    ├── export-csv.js                # CSV export utility
    ├── upload-to-cloud.js           # Upload to storage
    └── restore.js                   # Recovery script
```

---

## 🔧 Backup System Components

### **1. Backup Script** (`backup.js`)
```javascript
// Core backup logic:
// - Connect to Supabase
// - Fetch all tables
// - Save as JSON (timestamped)
// - Create metadata
// - Upload to cloud storage
// - Cleanup old backups (keep last 30 days)
// - Log all operations
```

**Triggers:**
- ✅ Automatic daily (e.g., 2 AM)
- ✅ Manual on-demand
- ✅ After major operations (bulk updates)
- ✅ On every app deploy

---

### **2. Cloud Storage** (Supabase)
```
Bucket: "backups"
  ├── snapshots/
  │   ├── 2026-05-25/
  │   │   ├── customers.json
  │   │   ├── orders.json
  │   │   ├── drivers.json
  │   │   ├── chat_messages.json
  │   │   ├── driver_locations.json
  │   │   └── backup-metadata.json
  │   └── 2026-05-26/
  │       └── ...
  └── exports/
      ├── monthly/
      │   └── 2026-05-report.csv
      └── weekly/
          └── 2026-W21-summary.csv
```

---

### **3. Data Being Backed Up**

#### **Priority 1: Critical (Always Backup)**
- ✅ `customers` - Business data
- ✅ `orders` - Transaction history
- ✅ `drivers` - Driver profiles
- ✅ `chat_messages` - Communication logs

#### **Priority 2: Important (Backup Daily)**
- ✅ `driver_locations` - GPS history (last 7 days)
- ✅ POD photos metadata

#### **Priority 3: Optional (Backup on request)**
- ⭐ Analytics/Reports
- ⭐ Driver performance metrics

---

### **4. Backup Metadata** (`backup-metadata.json`)
```json
{
  "timestamp": "2026-05-25T02:00:00Z",
  "date": "2026-05-25",
  "timezone": "Asia/Bangkok",
  "version": "2.0",
  "tables": {
    "customers": {
      "rows": 125,
      "lastModified": "2026-05-24T15:30:00Z"
    },
    "orders": {
      "rows": 892,
      "lastModified": "2026-05-25T01:45:00Z"
    },
    "drivers": {
      "rows": 8,
      "lastModified": "2026-05-20T10:00:00Z"
    },
    "chat_messages": {
      "rows": 1245,
      "lastModified": "2026-05-25T01:50:00Z"
    },
    "driver_locations": {
      "rows": 500,
      "lastModified": "2026-05-25T01:59:00Z",
      "note": "Last 7 days only"
    }
  },
  "fileSize": "2.3 MB",
  "integrity": {
    "checksums": {
      "customers.json": "abc123def456",
      "orders.json": "xyz789uvw012",
      "drivers.json": "ijk345lmn678",
      "chat_messages.json": "opq901rst234",
      "driver_locations.json": "uvw567xyz890"
    }
  },
  "backupSource": "production",
  "backupMethod": "automated-daily",
  "nextBackup": "2026-05-26T02:00:00Z",
  "comment": ""
}
```

---

## 📅 Backup Schedule

### **Daily Automated Backup**
```
⏰ Time: 2:00 AM Bangkok Time (UTC+7)
📍 Frequency: Every day
⚙️ Action: 
   - Fetch all data from Supabase
   - Save as timestamped JSON
   - Upload to cloud storage
   - Keep last 30 days only
   - Generate metadata
   - Log results
```

### **Manual Backup (On-Demand)**
```
👤 Who: Admin/Developer
⏰ When: Before major updates, deployments, or on request
⚙️ How:
   - Run: npm run backup
   - Or: click "Backup Now" in admin panel
   - Or: API endpoint: POST /api/backup/now
```

### **Emergency Backup**
```
🚨 When: Critical changes detected
   - Bulk delete
   - Schema migration
   - Data reconciliation
⚙️ Action: Automatic snapshot before operation
```

---

## 🔄 Backup & Recovery Workflow

### **Backup Flow**
```
[Scheduled Time] or [Manual Trigger]
        ↓
Connect to Supabase
        ↓
Fetch data:
  - SELECT * FROM customers
  - SELECT * FROM orders
  - SELECT * FROM drivers
  - SELECT * FROM chat_messages
  - SELECT * FROM driver_locations (last 7 days)
        ↓
Create JSON files
        ↓
Generate checksums (MD5)
        ↓
Create backup-metadata.json
        ↓
ZIP all files (optional compression)
        ↓
Upload to Supabase Storage: /backups/YYYY-MM-DD/
        ↓
Remove old backups (>30 days)
        ↓
Update backup registry
        ↓
✅ Log success
   - Timestamp
   - Row counts
   - File size
   - Upload status
```

### **Recovery Flow (If Disaster)**
```
[Need to restore]
        ↓
List available backups
        ↓
Choose backup date
        ↓
Download from cloud storage
        ↓
Verify checksums
        ↓
Delete current tables
        ↓
Truncate tables:
  - DELETE FROM customers
  - DELETE FROM orders
  - DELETE FROM drivers
  - DELETE FROM chat_messages
  - DELETE FROM driver_locations
        ↓
Import JSON data:
  - Parse customers.json
  - Insert into customers table
  - Parse orders.json
  - Insert into orders table
  - ... (repeat for all tables)
        ↓
Verify counts match
        ↓
✅ Restore complete
   - All data recovered
   - Ready to use
```

---

## 🛡️ Safety Features

### **Data Integrity**
- ✅ Checksums (MD5) for each file
- ✅ Row count verification
- ✅ Timestamp validation
- ✅ Schema validation

### **Redundancy**
- ✅ Keep last 30 days of backups
- ✅ Store in Supabase (cloud)
- ✅ Store local copy (if on-premises)
- ✅ Optional: Mirror to AWS S3

### **Accessibility**
- ✅ Backups searchable by date
- ✅ Can restore to specific date
- ✅ CSV exports for Excel analysis
- ✅ JSON for programmatic access

---

## 📱 Implementation: Files to Create

### **New Files Needed**
```
lib/
├── backup/
│   ├── backupService.js         # Main service
│   ├── supabaseBackup.js        # Supabase integration
│   ├── storageBackup.js         # Cloud storage upload
│   ├── csvExport.js             # CSV generation
│   ├── recovery.js              # Recovery utilities
│   └── logger.js                # Logging
├── utils/
│   ├── checksum.js              # MD5 generation
│   └── dateUtils.js             # Date formatting
└── api/
    └── backup/
        ├── now.js               # POST /api/backup/now
        ├── list.js              # GET /api/backup/list
        ├── restore.js           # POST /api/backup/restore
        ├── delete.js            # DELETE /api/backup/{date}
        └── metadata.js          # GET /api/backup/{date}/metadata
```

### **Modified Files**
```
- app/page.jsx                  # Remove Google Sheets code
- .env.local                    # Update config
- package.json                  # Add backup dependencies
- README.md                     # Document backup system
```

### **Removed Files**
```
- google-apps-script/           # Entire folder deleted
- deploy.bat                    # Google Apps Script deployment
```

---

## 🚀 Backup System Features

### **Admin Commands**
```bash
# Backup now (manual)
npm run backup

# List backups
npm run backup:list

# Restore from specific date
npm run backup:restore -- --date 2026-05-20

# Export to CSV
npm run backup:export-csv

# Verify integrity
npm run backup:verify

# Delete old backups (keep only N days)
npm run backup:cleanup -- --keep 30
```

### **API Endpoints**
```
POST   /api/backup/now                 # Trigger backup
GET    /api/backup/list                # List available backups
GET    /api/backup/{date}/metadata     # Get backup metadata
GET    /api/backup/{date}/download     # Download backup ZIP
POST   /api/backup/restore             # Restore from backup
DELETE /api/backup/{date}              # Delete specific backup
POST   /api/backup/export-csv          # Export to CSV
```

---

## 📊 Monitoring & Alerts

### **Backup Status Dashboard**
```
✅ Last Backup:     2026-05-25 02:00 AM (2 hours ago)
✅ Status:          Success
📊 Size:            2.3 MB
📦 Records:         2,660 rows
🔄 Next Scheduled:  2026-05-26 02:00 AM
⏱️  Duration:        45 seconds
```

### **Alerts**
- ⚠️ Backup failed (notify admin)
- ⚠️ Backup slow (>5 minutes)
- ⚠️ Disk space low
- ⚠️ Cloud storage error
- ⚠️ Checksum mismatch

---

## 🔐 Configuration (`backup.config.json`)

```json
{
  "enabled": true,
  "schedule": {
    "timezone": "Asia/Bangkok",
    "hour": 2,
    "minute": 0,
    "dayOfWeek": "*"
  },
  "retention": {
    "keepDays": 30,
    "keepMonthly": 12,
    "keepYearly": 5
  },
  "storage": {
    "type": "supabase",
    "bucket": "backups",
    "autoCompress": true,
    "compression": "gzip"
  },
  "tables": {
    "customers": true,
    "orders": true,
    "drivers": true,
    "chat_messages": true,
    "driver_locations": {
      "enabled": true,
      "retention": "7 days"
    }
  },
  "notifications": {
    "onSuccess": false,
    "onFailure": true,
    "email": "admin@hillkoff.local",
    "slack": null
  },
  "logging": {
    "level": "info",
    "file": "logs/backup.log",
    "maxSizeMB": 50,
    "keepFiles": 10
  }
}
```

---

## 🎯 Benefits of This Approach

| Feature | Benefit |
|---------|---------|
| **Automated Daily** | No manual work, always protected |
| **30-day History** | Can recover from any point in last month |
| **Cloud Storage** | Data safe even if local fails |
| **Checksums** | Verify data integrity |
| **Metadata** | Know exactly what's in each backup |
| **CSV Exports** | Easy Excel analysis |
| **JSON Format** | Easy to process programmatically |
| **Recovery API** | Restore with one command |
| **Scalable** | Works as data grows |

---

## 📝 Next Steps

1. ✅ Create backup service module (`lib/backup/`)
2. ✅ Create API endpoints (`app/api/backup/`)
3. ✅ Setup backup scheduler
4. ✅ Create recovery utilities
5. ✅ Add CLI commands
6. ✅ Test backup & restore
7. ✅ Document for team


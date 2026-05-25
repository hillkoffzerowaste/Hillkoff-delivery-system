# Hillkoff Delivery System

Operational dashboard for Hillkoff local delivery in Chiang Mai and nearby provinces.

## 📋 Quick Links

- 📖 **[Workflow Documentation](WORKFLOW.md)** - How sales & drivers use the system
- 🔄 **[Backup System](BACKUP_SYSTEM.md)** - Automatic data backup & recovery
- 🚀 **[Supabase Setup](SUPABASE_SETUP.md)** - Database configuration & reset guide

---

## 🎯 Overview

```
Hillkoff Delivery System
├── 👨‍💼 Sales Dashboard (Web)
│   ├── Add Customers
│   ├── Create Orders
│   ├── Manage Drivers
│   └── View Reports
│
├── 🚗 Driver Dashboard (Mobile)
│   ├── View Order Queue
│   ├── Accept Orders
│   ├── Check-in & Delivery
│   ├── GPS Tracking
│   └── POD Photos
│
├── 💾 Data Storage
│   └── Supabase (PostgreSQL)
│       ├── customers
│       ├── orders
│       ├── drivers
│       ├── driver_locations
│       └── chat_messages
│
└── 🔄 Backup System
    ├── Automatic Daily
    ├── Cloud Storage (Supabase)
    ├── Local Snapshots
    └── Recovery Tools
```

---

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🗂️ Scope & Scale

- **👥 Users**: 5-10 staff (sales + drivers)
- **📦 Orders**: 20-30 per day
- **🚗 Drivers**: 5 drivers
- **📍 Coverage**: Chiang Mai, Lamphun, Lampang, Chiang Rai, Phayao, Mae Hong Son
- **🌐 Connectivity**: Works offline, syncs when online

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 + React 18 | UI & Real-time logic |
| **Database** | Supabase (PostgreSQL) | Primary data storage |
| **Storage** | Supabase Storage | Backup archives & POD photos |
| **API** | Next.js API Routes | Backup & sync endpoints |
| **Location** | Browser Geolocation | GPS tracking |
| **Maps** | OpenStreetMap | Map display & navigation |

### Data Tables

#### 1. **customers**
- Store customer information (name, phone, zone, address, map link)
- Used by: Sales (create/edit), Drivers (view)

#### 2. **orders**
- Store delivery orders with status tracking
- Used by: Sales (create/manage), Drivers (accept/complete)

#### 3. **drivers**
- Store driver information (name, vehicle, phone, zone)
- Used by: Sales (manage), Drivers (profile)

#### 4. **driver_locations**
- Real-time GPS locations of drivers
- Updated every 10-30 seconds when driver is active

#### 5. **chat_messages**
- Team communication between sales & drivers
- Supports multiple conversations

---

## 💼 Usage Workflows

### For Sales Team

1. **Login**: Select "ขาย" (Sales) role
2. **Add Customers**: Create customer profiles
3. **Create Orders**: Assign delivery jobs with:
   - Customer & address
   - Time window (morning/midday/afternoon)
   - Quantity & COD
4. **Manage Drivers**: View assignments & completion
5. **Reports**: Export daily summaries

### For Driver Team

1. **Login**: Select "คนขับ" (Driver) role
2. **Enable GPS**: Allow location tracking
3. **View Orders**: See pending & assigned orders
4. **Accept Order**: Take delivery job
5. **Navigate**: Follow map to customer
6. **Check-in**: Arrive at location
7. **Deliver**: Complete delivery & upload photo
8. **Status**: Mark as completed/problem/returned

---

## 🔄 Backup System

### Automatic Backups

- ✅ Daily at 2 AM Bangkok time
- ✅ Keeps last 30 days of snapshots
- ✅ Stores in Supabase Cloud
- ✅ Auto-cleanup of old backups

### Manual Backup

```bash
npm run backup
```

### Restore from Backup

```bash
npm run backup:list              # See available backups
npm run backup:restore --date 2026-05-25  # Restore specific date
```

### API Endpoints

```
POST   /api/backup/now           # Trigger backup
GET    /api/backup/list          # List backups
GET    /api/backup/{date}/metadata   # Get backup info
POST   /api/backup/restore       # Restore from backup
```

---

## 🔐 Configuration

### Required Environment Variables

```env
# Supabase (Client)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Supabase (Server - for backups)
SUPABASE_SERVICE_KEY=eyJ...

# Backup Settings
BACKUP_DIR=./backups/snapshots
BACKUP_RETENTION_DAYS=30
BACKUP_UPLOAD_TO_CLOUD=true
```

### Get Credentials

1. **SUPABASE_URL & ANON_KEY**:
   - Supabase Dashboard → Settings → API

2. **SERVICE_KEY**:
   - Supabase Dashboard → Settings → API → service_role (SECRET)

---

## 📱 Features

### ✅ Core Features
- [x] Customer Management
- [x] Order Management
- [x] Driver Assignment
- [x] Real-time GPS Tracking
- [x] POD Photo Upload
- [x] Complaint Management
- [x] Chat Communication
- [x] Daily Reports

### ✅ Advanced Features
- [x] Offline Support (Local Storage)
- [x] Real-time Sync (Supabase)
- [x] Automatic Backups
- [x] Recovery Tools
- [x] Multi-zone Coverage
- [x] Driver Performance Metrics

### ✅ Data Storage
- [x] Supabase (Cloud PostgreSQL)
- [x] Local Storage (Browser)
- [x] Cloud Backups (Snapshots)
- [x] POD Storage (Google Drive / Supabase)

---

## 🚀 Deployment

### Development

```bash
npm run dev
# Open http://localhost:3000
```

### Production Build

```bash
npm run build
npm start
```

### On Vercel

1. Push code to GitHub
2. Connect Vercel to GitHub repo
3. Add environment variables in Vercel dashboard
4. Deploy

---

## 🆘 Troubleshooting

### Connection Issues

**"Supabase connection failed"**
- Check `.env.local` has correct URL & key
- Verify Supabase project is active
- Check browser console for errors

### Data Not Syncing

**"Orders don't appear in Supabase"**
- Check network tab (F12) for API errors
- Verify RLS policies are enabled
- Try: F5 refresh, clear browser cache
- Check: Supabase Dashboard → Table Editor

### Backup Failures

**"Backup failed"**
- Ensure `.env.local` has `SUPABASE_SERVICE_KEY`
- Check `backups/` folder has write permissions
- Run: `npm run backup` manually to see error
- Check: `backups/logs/backup-*.log` for details

---

## 📚 Documentation

- 📖 **[WORKFLOW.md](WORKFLOW.md)** - Step-by-step user workflows
- 🔄 **[BACKUP_SYSTEM.md](BACKUP_SYSTEM.md)** - Backup architecture & recovery
- 🚀 **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** - Database setup & configuration

---

## 👥 Team

- **Sales**: Create orders, manage customers, view reports
- **Drivers**: Accept orders, track location, upload POD
- **Admin**: System configuration, backups, monitoring

---

## 📞 Support

For issues:

1. Check the relevant documentation file above
2. Review browser console (F12) for errors
3. Check Supabase dashboard for data sync status
4. Try system reload: Menu → "🔄 รีโหลดระบบ"

---

## 📝 Version History

- **v2.0** (2026-05-25)
  - ✅ Supabase backend integration
  - ✅ Automatic backup system
  - ✅ Removed Google Sheets (optional)
  - ✅ Real-time GPS tracking
  - ✅ Complete workflow documentation

- **v1.0** (2026-05-01)
  - Initial release with local storage
  - Google Sheets integration

---

## 📄 License

Internal use only - Hillkoff Local Delivery

---

## 🔗 Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Supabase Dashboard](https://app.supabase.com)



# Hillkoff Delivery System

เว็บแอป (PWA) สำหรับจัดการงานส่งของภายในของ Hillkoff ครอบตั้งแต่ฝ่ายขายเปิดออเดอร์ → สโตร์ตรวจของ → ห้องแพ็คแพ็คของ → คนขับรับงานและส่ง → รายงานผู้บริหาร/บัญชี พร้อมหน้าติดตามสถานะสำหรับลูกค้าแบบไม่ต้องล็อกอิน

Internal use only — Hillkoff Local Delivery

---

## 1. ภาพรวมระบบ

| ด้าน | รายละเอียด |
| --- | --- |
| Framework | Next.js 16 (App Router) / React 19 |
| ภาษา | JavaScript (ESM, `type: module`), Node 22.x |
| ฐานข้อมูล | Cloud Firestore (ข้อมูลหลักทั้งหมด) |
| Auth | Firebase Authentication (Google sign-in, anonymous + PIN, Email OTP) |
| Notification | Firebase Cloud Messaging (Web Push) + LINE Official Account |
| Integration | Google Apps Script / Google Sheets (optional) |
| Deploy | Vercel (production) |
| Test | Vitest (unit) + Firebase Emulator (Firestore Rules) |

> ระบบ **ไม่ได้ใช้ Supabase แล้ว** ไฟล์ `supabase-setup.sql` และ `SUPABASE_SETUP.md` เก็บไว้เป็นประวัติเท่านั้น

Firebase project: `hillkoff-delivery` (ดู `.firebaserc`)

---

## 2. Roles และหน้าจอ

แอปเป็น single-page app (`app/page.jsx`) ที่สลับ workspace ตาม role ของผู้ใช้

| Role | ขอบเขตงาน | Tab หลัก |
| --- | --- | --- |
| **sales** | เปิด/แก้ออเดอร์, จัดคิวคนขับ, งานต่างจังหวัด, รอบส่งเชียงใหม่, รายงาน | `sales`, `sales-outstation`, `dispatch`, `chiangmai`, `reports`, `driver-sop-report`, `driver-ratings` |
| **store** | ตรวจของ, งานจอง, งานรับหน้าร้าน, ออนไลน์, ติดตามรอบเชียงใหม่ | `store-dashboard`, `store-work`, `store-booking`, `store-pickup`, `store-online`, `store-chiangmai-track` |
| **pack** | แพ็คของ, งานจอง, รับหน้าร้าน, ออนไลน์, ต่างจังหวัด | `pack-dashboard`, `pack-work`, `pack-booking`, `pack-pickup`, `pack-online`, `pack-outstation` |
| **driver** | รับงาน/เช็กอิน/ส่งสำเร็จ, SOP ตรวจรถรายวัน, บันทึกเลขไมล์+น้ำมัน, งานเตรียมของ | `driver-dashboard`, `driver`, `driver-prep`, `driver-sop`, `driver-vehicle` |
| **admin** | ตั้งค่าระบบ, จัดการผู้ใช้, reset orders, backup/restore | `settings` + Admin APIs |
| **accounting** | ดูรายงานรถ/น้ำมันเท่านั้น (report-only, ไม่มีสิทธิ์แตะ Firestore ตรง) | `reports` (vehicle report) |

สิทธิ์ admin/accounting ควบคุมด้วย `ADMIN_EMAIL_ALLOWLIST` และ `ACCOUNTING_EMAIL_ALLOWLIST`

### หน้าสาธารณะ (ไม่ต้องล็อกอิน)

| Path | ใช้ทำอะไร |
| --- | --- |
| `/track` | ลูกค้ากรอกเบอร์โทรเพื่อเช็กสถานะออเดอร์ (ข้อมูล mask + rate limit) |
| `/order-review` | ลูกค้าให้คะแนน/รีวิวการจัดส่งผ่าน QR |
| `/outstation-qr` | QR บนใบปิดกล่องต่างจังหวัด → redirect ไปหน้า scan/dispatch |

---

## 3. Workflow ออเดอร์

```
ฝ่ายขายเปิดออเดอร์
      │
      ▼
[store]  รอตรวจ → กำลังตรวจ → ตรวจครบ / ของไม่ครบ / รอของ / ส่งกลับ
      │
      ▼
[pack]   รอแพ็ค → กำลังแพ็ค → แพ็คเสร็จ / ของไม่ครบ / ส่งกลับสโตร์
      │
      ▼
[dispatch] เข้าคิว → มอบหมายคนขับ
      │
      ▼
[driver] รับงาน → เช็กอิน → ส่งสำเร็จ (+ POD) / ติดปัญหา
      │
      ▼
รายงานรายวัน / รายเดือน + รีวิวจากลูกค้า
```

สถานะกลางของ workflow (`WORKFLOW_STATUS_META`): `pending`, `blocked`, `working`, `waiting`, `partial`, `returned`, `checked`, `skipped`, `draft`, `saved`

**ประเภทงาน**: งานในเมือง (dispatch ปกติ) · งานจอง (booking) · รับหน้าร้าน (pickup) · ออเดอร์ออนไลน์ (online) · งานต่างจังหวัด (outstation) · รอบส่งเชียงใหม่ (chiangmai rounds) · งานวิ่ง (route tasks)

---

## 4. โครงสร้างโปรเจกต์

```text
.
├── app/
│   ├── page.jsx                 # [ENTRY POINT] main app: login, ทุก role workspace, Firestore realtime
│   ├── layout.jsx               # app shell + PWA metadata
│   ├── globals.css              # layout/responsive ทั้งระบบ
│   ├── track/                   # หน้าลูกค้าติดตามสถานะ
│   ├── order-review/            # หน้าลูกค้ารีวิวการจัดส่ง
│   ├── outstation-qr/           # route handler สำหรับ QR ต่างจังหวัด
│   ├── components/              # DispatchDashboard, Outstation label/QR, VehicleInspectionReport ฯลฯ
│   └── api/                     # server route handlers (ดูหัวข้อ 5)
├── lib/                         # business logic ฝั่ง server/shared
│   ├── firebaseAdmin.js         # Firebase Admin singleton
│   ├── firebaseClient.js        # Firebase browser SDK
│   ├── workflowAuth.js          # ตรวจ token + role ของทุก write API
│   ├── firestoreReadPolicy.js   # คุมปริมาณ read ของ realtime listener
│   ├── preparationWorkflow.js   # store/pack workflow
│   ├── dispatchDashboard.js     # ข้อมูล dashboard จัดคิว
│   ├── outstationLabels.js / outstationQr.js / outstationDispatch.js
│   ├── vehicleReport.js / vehicleMaster.js / vehicleRepository.js / vehicleReportCsv.js
│   ├── operationsReporting.js   # รายงานฝ่ายปฏิบัติการ + accounting
│   ├── customerSearchIndex.js   # index ค้นหาลูกค้าด้วยเบอร์โทร
│   ├── otp.js / otpEmail.js     # Email OTP login
│   ├── lineOa.js                # LINE push + webhook
│   ├── googleAppsScript.js / deliverySheetSync.js
│   └── backup/                  # backupService, firestoreBackup, storageBackup, cli
├── scripts/                     # migration / backfill / seed / audit (.mjs)
├── tests/
│   ├── unit/                    # Vitest unit + component tests
│   └── firestore.rules.test.js  # ทดสอบสิทธิ์บน Firestore Emulator
├── google-apps-script/          # Apps Script สำหรับ sync Google Sheets
├── docs/
│   ├── superpowers/plans|specs  # plan + design doc ต่อฟีเจอร์
│   ├── uat/                     # checklist ก่อน release
│   ├── mockups/                 # ตัวอย่างใบปิดกล่อง A4
│   └── vehicle-report-data-quality.md
├── public/                      # PWA icons, manifest, firebase-messaging-sw.js
├── backups/snapshots/           # snapshot ที่สร้างจาก CLI (git ignored)
├── firestore.rules              # security rules
├── firestore.indexes.json       # composite indexes
└── firebase.json / .firebaserc  # config + emulator
```

---

## 5. API Reference (`app/api/**`)

ทุก endpoint ที่เขียนข้อมูลจะตรวจ Firebase ID token และ role ผ่าน `lib/workflowAuth.js`

**Auth & Users**

- `POST /api/auth/login` — login ด้วยเบอร์โทร + PIN, จัดการ trusted device
- `POST /api/auth/validate` — ตรวจ ID token → คืน role/name/driverId
- `POST /api/auth/google/start` · `POST /api/auth/google/verify` — Google + Email OTP
- `/api/admin/users` · `/api/admin/driver-identities` — จัดการผู้ใช้และตัวตนคนขับ

**Orders & Workflow**

- `POST /api/orders/create` · `/api/orders/workflow` · `/api/orders/delete`
- `/api/orders/search` · `/api/orders/report-range` · `/api/orders/dispatch-dashboard`
- `/api/orders/chiangmai-rounds` · `/api/orders/chiangmai-rounds/queue`
- `POST /api/orders/sync-sheet` — push ขึ้น Google Sheets
- `/api/preparation/checkers` — ผู้ตรวจของสโตร์/ห้องแพ็ค

**Customers**

- `POST /api/customers/upsert` · `/api/customers/delete`
- `/api/customers/search` · `/api/customers/history`

**Outstation (ต่างจังหวัด)**

- `/api/outstation-labels/jobs` · `/recipients` · `/settings` — สร้าง/พิมพ์ใบปิดกล่อง + ประวัติพิมพ์ซ้ำ
- `POST /api/outstation-dispatch/scan` — สแกน QR เพื่อยืนยันการส่งออก

**Vehicle & Driver**

- `POST /api/driver-assessments/submit` · `/api/driver-assessments/today` — SOP ตรวจรถ
- `POST /api/vehicle-usage/submit` · `POST /api/fuel-bills/submit`
- `/api/vehicle-master` · `/api/driver-master`
- `/api/vehicle-report/query` · `/odometer` · `/api/vehicle-report/export` (CSV)

**Reports & Integration**

- `/api/store/reports` — รายงานสโตร์ + history
- `POST /api/line/push` · `POST /api/line/webhook` (ตรวจ LINE signature)
- `POST /api/push/register` — เก็บ FCM token
- `/api/google` · `/api/sync` — proxy Apps Script (legacy)

**Public**

- `GET /api/public/track` — ข้อมูล mask + rate limit
- `/api/public/order-review`

**Admin & Backup**

- `POST /api/admin/reset-orders` · `POST /api/admin/delivery-sheet/setup`
- `POST /api/backup/now` · `GET /api/backup/list` · `GET /api/backup/{id}/metadata` · `POST /api/backup/restore`

---

## 6. Firestore Collections หลัก

| กลุ่ม | Collections |
| --- | --- |
| งาน | `orders` (+ subcollection `activity`, `items`), `route_tasks`, `booking_month_registry` |
| ลูกค้า | `customers`, `customer_search`, `delivery_reviews` |
| ผู้ใช้ | `users`, `users_by_phone`, `login_events`, `login_rate_limits`, `otp_sessions`, `otp_rate_limits` |
| รถ/คนขับ | `vehicle_master`, `vehicle_usage_events`, `vehicle_odometer_audits`, `fuel_bills`, `driver_daily_assessments`, `driver_weekly_assessments`, `driver_locations`, `driver_delivery_sequences` |
| ต่างจังหวัด | `outstation_label_settings`, `outstation_recipient_addresses` |
| รายงาน | `store_reports` (+ `history`), `events`, `activity` |
| ระบบ | `app_settings`, `audit_logs`, `notifications`, `push_tokens`, `line_webhook_events`, `chat_messages`, `chat_meta` |

---

## 7. เริ่มพัฒนา (Local setup)

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

เปิด `http://localhost:3000`

ตัวแปรที่ **จำเป็น**:

- `NEXT_PUBLIC_FIREBASE_*` — client config
- `FIREBASE_SERVICE_ACCOUNT_JSON` — service account (JSON string บรรทัดเดียว)
- `OTP_SECRET` — ยาวอย่างน้อย 32 ตัวอักษร
- `ADMIN_EMAIL_ALLOWLIST`, `ACCOUNTING_EMAIL_ALLOWLIST`

⚠️ ห้าม commit `.env.local` หรือไฟล์ service-account key
`OTP_DEV_MODE=true` คืนรหัส OTP กลับมาใน API response — ใช้เฉพาะเครื่อง dev เท่านั้น

---

## 8. Verification ก่อน commit / deploy

```powershell
npm run lint          # eslint --max-warnings=0
npm test              # vitest run tests/unit
npm run test:rules    # Firestore Rules บน emulator
npm run build         # next build
```

หรือรวบเดียว: `npm run check` (lint → test → build)

`npm run test:rules` ต้องมี Java + Firebase CLI และทดสอบการแยกสิทธิ์ของ sales, driver, store, pack, admin

---

## 9. Data maintenance scripts

ทุก script รองรับ dry-run โดยไม่ใส่ `--apply` — **ให้รัน dry-run ดูผลก่อนทุกครั้ง**

```powershell
# ตรวจความสมบูรณ์ข้อมูล (dry-run)
node scripts/backfill-firebase-integrity.mjs
npm run firebase:backfill-integrity      # --apply

# เติม index ค้นหาลูกค้าจากเบอร์โทร
npm run customers:backfill-search

# ย้าย login ของคนขับ
npm run firebase:migrate-driver-logins

# seed ทะเบียนรถ (merge write เท่านั้น ไม่ลบรถ)
node scripts/seed-vehicle-master.mjs
node scripts/seed-vehicle-master.mjs --apply

# ตรวจคุณภาพข้อมูลรายงานรถ
node scripts/audit-vehicle-report.mjs
```

รัน `--apply` เฉพาะหลังมี production backup แล้ว

---

## 10. Backup & Restore

Snapshot ครอบทุก root collection รวม `orders/activity` และ `store_reports/history` พร้อม metadata ของ Firebase Auth และตรวจ SHA-256 checksum

```powershell
npm run backup
npm run backup:list
npm run backup:restore -- --id 2026-07-15_00-00-00-000 --confirm YES_REPLACE_FIRESTORE_DATA
```

- ไฟล์อยู่ที่ `backups/snapshots/` (git ignored) เปลี่ยนได้ด้วย `BACKUP_DIR`
- `BACKUP_RETENTION_DAYS` ค่าเริ่มต้น 30 วัน
- `BACKUP_UPLOAD_TO_CLOUD=true` อัปโหลดขึ้น Firebase Storage
- Auth password / provider credential **กู้ไม่ได้** — สำรองเฉพาะ user metadata; Firestore documents กู้ได้ครบ

รายละเอียด: [`BACKUP_SYSTEM.md`](BACKUP_SYSTEM.md)

---

## 11. Optional integrations

| Integration | ตัวแปร |
| --- | --- |
| Google Apps Script / Sheets | `GOOGLE_SHEETS_WEB_APP_URL`, `GOOGLE_SHEETS_SHARED_SECRET` (= `HILLKOFF_SYNC_SHARED_SECRET` ใน Script Properties), `GOOGLE_MILEAGE_WEB_APP_URL`, `GOOGLE_DAILY_DELIVERY_WEB_APP_URL` |
| LINE OA | `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TO` |
| SMTP OTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Web Push | สร้าง Web Push certificate ใน Firebase Console → `NEXT_PUBLIC_FIREBASE_VAPID_KEY` |

คู่มือ Apps Script: [`google-apps-script/README.md`](google-apps-script/README.md)

---

## 12. Security boundaries

- การเขียน `customers` / `orders` / workflow / reports ทำผ่าน server API และตรวจ Firebase ID token เสมอ
- Firestore Rules ปิด client write สำหรับข้อมูลสำคัญ คนขับเห็นเฉพาะงานที่เข้าคิวหรืองานของตัวเอง
- `/api/public/track` เปิดสาธารณะเฉพาะข้อมูลที่ mask แล้ว และมี rate limit
- `/api/line/webhook` ตรวจ LINE signature ก่อนบันทึก
- Accounting เป็น report-only ต้องเป็นบัญชี Google ของ Hillkoff และอยู่ใน `ACCOUNTING_EMAIL_ALLOWLIST`
- Rules และ indexes: `firestore.rules`, `firestore.indexes.json`

---

## 13. Deploy

Production อยู่บน Vercel (`.vercel/project.json`) — push branch หลักแล้ว Vercel build อัตโนมัติ

Deploy Firestore rules/indexes:

```powershell
npx firebase deploy --only firestore:rules,firestore:indexes
```

Rollback ของ operations update ทำได้ระดับแอป (deploy commit ก่อนหน้า) เพราะ field/collection ใหม่เป็น additive ทั้งหมด

---

## 14. เอกสารอื่นในโปรเจกต์

| ไฟล์ | เนื้อหา |
| --- | --- |
| [`BACKUP_SYSTEM.md`](BACKUP_SYSTEM.md) | Backup/restore เชิงลึก + ขั้นตอน rollout |
| [`SYSTEM_WORKFLOW_2026.md`](SYSTEM_WORKFLOW_2026.md) | Workflow ระบบฉบับปี 2026 |
| [`WORKFLOW.md`](WORKFLOW.md) | Workflow ฉบับละเอียด (ประวัติ) |
| [`IMPLEMENTATION_SUMMARY.md`](IMPLEMENTATION_SUMMARY.md) | สรุปสิ่งที่ทำไปแล้ว |
| [`INTEGRATION_SETUP.md`](INTEGRATION_SETUP.md) | ตั้งค่า integration ภายนอก |
| [`code_map.md`](code_map.md) | แผนที่โค้ดไฟล์ต่อไฟล์ (บางส่วนอ้าง Supabase — ล้าสมัย) |
| `docs/superpowers/plans` · `specs` | Plan + design doc ต่อฟีเจอร์ |
| `docs/uat/` | UAT checklist ก่อน release |
| `docs/vehicle-report-data-quality.md` | กฎการปันส่วนข้อมูลรายงานรถย้อนหลัง |
| [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md) | ⚠️ ล้าสมัย เก็บไว้เป็นประวัติ |

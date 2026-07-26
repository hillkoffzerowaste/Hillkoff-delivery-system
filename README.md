# Hillkoff Delivery System

เว็บแอปจัดการออเดอร์ การเตรียมสินค้า คิวคนขับ งานวิ่ง รายงานสโตร์ และการติดตามสถานะสำหรับลูกค้า

## Technology

- Next.js 16 / React 19
- Firebase Authentication, Cloud Firestore และ Firebase Cloud Messaging
- LINE Official Account, SMTP OTP และ Google Apps Script/Sheets (optional)
- Vercel สำหรับ production deployment

ข้อมูลหลักทั้งหมดอยู่ใน Firebase/Firestore ไม่ได้ใช้ Supabase แล้ว

## Local setup

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

เปิด `http://localhost:3000` ตัวแปรที่จำเป็นอยู่ใน `.env.example` โดยเฉพาะ
Firebase client config, `FIREBASE_SERVICE_ACCOUNT_JSON` และ `OTP_SECRET` ที่ต้องยาว
อย่างน้อย 32 ตัวอักษร ห้าม commit `.env.local` หรือ service-account key

## Verification

```powershell
npm run lint
npm test
npm run test:rules
npm run build
```

`npm run test:rules` ใช้ Firestore Emulator และทดสอบการแยกสิทธิ์ของ sales,
driver, store, pack และ admin

## Firebase data maintenance

```powershell
# ตรวจข้อมูลโดยไม่เขียน
node scripts/backfill-firebase-integrity.mjs

# เติม search fields, service date และ user mirrors
npm run firebase:backfill-integrity
```

Firestore Rules และ indexes อยู่ที่ `firestore.rules` และ `firestore.indexes.json`

## Backup and restore

ระบบสำรองข้อมูลอ่านทุก root collection รวม `orders/activity` และ
`store_reports/history` พร้อม metadata ของ Firebase Auth แล้วตรวจ checksum SHA-256

```powershell
npm run backup
npm run backup:list
npm run backup:restore -- --id 2026-07-15_00-00-00-000 --confirm YES_REPLACE_FIRESTORE_DATA
```

ไฟล์อยู่ที่ `backups/snapshots/` และถูก ignore จาก Git Auth passwords/provider
credentials ไม่สามารถกู้จาก snapshot นี้ได้ จึงสำรองเฉพาะ user metadata;
Firestore documents กู้ได้ครบ ดูรายละเอียดที่ `BACKUP_SYSTEM.md`

## Optional integrations

- Google Apps Script: ตั้ง `HILLKOFF_SYNC_SHARED_SECRET` ใน Script Properties และใช้ค่าเดียวกันใน `GOOGLE_SHEETS_SHARED_SECRET`
- LINE OA: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_DEFAULT_TO`
- SMTP OTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Web Push: สร้าง Web Push certificate ใน Firebase Console แล้วตั้ง `NEXT_PUBLIC_FIREBASE_VAPID_KEY`

คู่มือ Apps Script อยู่ที่ `google-apps-script/README.md`

## Security boundaries

- การเขียน customers/orders/workflow/reports ผ่าน server API และตรวจ Firebase ID token
- Firestore Rules ปิด client writes สำหรับข้อมูลสำคัญ และให้คนขับเห็นเฉพาะงานเข้าคิวหรือของตัวเอง
- `/api/public/track` เปิดสาธารณะเฉพาะข้อมูลที่ mask แล้วและมี rate limit
- `/api/line/webhook` ตรวจ LINE signature ก่อนบันทึก

Internal use only — Hillkoff Local Delivery
# Operations reporting and delivery rounds

The vehicle report is server-backed and available to sales, admin, and allowlisted accounting users. Accounting is report-only and has no direct Firestore access. Configure `ACCOUNTING_EMAIL_ALLOWLIST` in the deployment environment.

Before enabling the live vehicle master:

```powershell
node scripts/seed-vehicle-master.mjs
node scripts/seed-vehicle-master.mjs --apply
```

Run the second command only after a production backup. The seed uses merge writes and never deletes vehicles. See `docs/vehicle-report-data-quality.md` for historical allocation rules and `docs/uat/2026-07-26-operations-eight-phase-checklist.md` for release UAT.

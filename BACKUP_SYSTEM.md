# Firebase Backup and Recovery

ระบบ production ใช้ Cloud Firestore ดังนั้น backup module ปัจจุบันอ่าน Firebase โดยตรง
และไม่พึ่ง Supabase

## Snapshot contents

- ทุก root collection ที่พบใน Firestore
- `orders/{id}/activity`
- `store_reports/{id}/history`
- Firebase Auth user metadata (ไม่มี password hash หรือ provider credential)
- Metadata, จำนวน records, ขนาดไฟล์ และ SHA-256 checksum

แต่ละ snapshot ใช้ ID แบบ UTC เช่น `2026-07-15_00-15-20-123` เพื่อไม่เขียนทับกัน
และถูกเก็บใน `BACKUP_DIR` (ค่าเริ่มต้น `backups/snapshots`)

## Commands

```powershell
npm run backup
npm run backup:list
npm run backup:restore -- --id BACKUP_ID --collections orders,customers --confirm YES_REPLACE_FIRESTORE_DATA
```

ถ้าไม่ส่ง `--collections` ระบบจะ restore ทุก Firestore collection ใน snapshot
แต่จะไม่ restore `auth_users`

## API

ทุก endpoint ต้องเป็น admin:

- `POST /api/backup/now`
- `GET /api/backup/list`
- `GET /api/backup/{backupId}/metadata`
- `POST /api/backup/restore`

API restore รองรับ merge ด้วย `YES_MERGE_FIRESTORE_DATA` และ replace ด้วย
`YES_REPLACE_FIRESTORE_DATA`

## Retention and cloud copy

- `BACKUP_RETENTION_DAYS` ค่าเริ่มต้น 30 วัน
- `BACKUP_UPLOAD_TO_CLOUD=true` จะอัปโหลด JSON ไป Firebase Storage bucket ที่ตั้งไว้
- ถ้าโปรเจกต์ยังไม่มี Storage bucket ให้ใช้ local snapshots หรือสร้าง bucket ก่อนเปิด option นี้

ก่อน restore ให้สร้าง snapshot ใหม่ ตรวจ metadata/checksum และทดลองกับ project แยกก่อนเสมอ
# Operations rollout backup and rollback

Before enabling accounting access, seeding `vehicle_master`, or deploying the eight-phase operations update:

1. Run `npm.cmd run backup`.
2. Confirm backup metadata and storage location.
3. Run `node scripts/seed-vehicle-master.mjs` and review the dry-run count.
4. Apply with `node scripts/seed-vehicle-master.mjs --apply` only after backup approval.

Rollback is application-only: deploy the previous commit. All new Firestore fields and collections are additive, master-data deletion is a soft disable, and the previous application ignores `vehicle_master`.

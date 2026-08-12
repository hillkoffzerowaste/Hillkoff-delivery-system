# Hillkoff Delivery — Public API v1

API สำหรับให้ **แอปโปรเจกต์อื่นของเราเอง** เชื่อมเข้ามาใช้ข้อมูลและสั่งงานระบบส่งของ
ทุกอย่างอยู่ใต้ `/api/v1` และยืนยันตัวตนด้วย API key ที่ออกจากหน้า `/admin/api-clients`

---

## 1. หลักการออกแบบ

| หัวข้อ | สรุป |
| --- | --- |
| Namespace | `/api/v1/*` เท่านั้น — เส้นทางเดิม (`/api/orders/*` ฯลฯ) ยังบังคับ Firebase ID token เหมือนเดิม |
| ตัวตน | API key แบบ `hk_live_...` เก็บเป็น SHA-256 hash ใน Firestore collection `api_clients` |
| สิทธิ์ | scope (`orders:read`, `orders:write`, …) + บทบาทที่ key ใช้แทน (`admin`, `sales`, `store`, `pack`, `driver`, `accounting`) |
| Logic | route ใน `/api/v1` เป็น wrapper บาง ๆ ที่เรียก handler เดิม จึงได้ business rule, validation และ transaction ชุดเดียวกับที่ UI ใช้ |

**เหตุผลที่จำกัด key ไว้เฉพาะ `/api/v1`:** ถ้ามี key หลุด ผู้ถือจะเข้าถึงได้แค่ contract ที่ประกาศไว้
เส้นทางที่แอปภายในใช้อยู่จะปฏิเสธ key เสมอ (`401 API keys are only accepted on /api/v1 endpoints`)

---

## 2. การยืนยันตัวตน

ส่งกุญแจแบบใดแบบหนึ่ง:

```http
x-api-key: hk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```http
Authorization: Bearer hk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Firebase ID token ยังใช้กับ `/api/v1` ได้เหมือนเดิม (สำหรับหน้าเว็บของเราเอง) — ระบบแยกจากกันด้วย prefix `hk_live_` ที่ ID token ไม่มีทางชนกัน

ตรวจว่ากุญแจใช้ได้และได้สิทธิ์อะไรบ้าง:

```bash
curl -H "x-api-key: $HILLKOFF_API_KEY" https://<domain>/api/v1/me
```

---

## 3. Scopes

| Scope | ครอบคลุม |
| --- | --- |
| `*` | ทุกอย่าง (ใช้กับแอปของเราเอง) |
| `orders:read` / `orders:write` | ค้นหา/อ่านออเดอร์ • สร้าง ลบ เปลี่ยนสถานะ จัดรอบส่ง |
| `customers:read` / `customers:write` | ค้นหาลูกค้า ประวัติการสั่ง • สร้าง/แก้ไขลูกค้า |
| `drivers:read` / `drivers:write` | รายชื่อคนขับ • เพิ่ม/แก้ไข/ปิดการใช้งาน |
| `vehicles:read` / `vehicles:write` | ทะเบียนรถ • เพิ่ม/แก้ไข/ปิดการใช้งาน |
| `reports:read` | dispatch dashboard, รายงานช่วงวันที่, รายงานการใช้รถ |
| `tracking:read` | สถานะการส่งแบบที่ลูกค้าเห็น (ข้อมูลถูก mask) |

รองรับ group wildcard เช่น `orders:*` ด้วย

**บทบาท (`roles`)** เป็นคนละชั้นกับ scope — endpoint เดิมบางตัวจำกัดบทบาทไว้ (เช่น รายงานสโตร์รับเฉพาะ `store`)
key ที่มี `roles: ["*"]` จะถูกจับคู่กับบทบาทที่ endpoint นั้นยอมรับโดยอัตโนมัติ จึงเรียกได้ทุกเส้นทาง

---

## 4. Endpoints

`GET /api/v1` คืน catalogue ฉบับเต็ม (machine-readable) — ตารางนี้คือฉบับย่อ

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/api/v1/me` | – |
| GET | `/api/v1/orders?q=` หรือ `?id=` | `orders:read` |
| POST | `/api/v1/orders` | `orders:write` |
| POST | `/api/v1/orders/delete` | `orders:write` |
| PATCH | `/api/v1/orders/workflow` | `orders:write` |
| PATCH | `/api/v1/orders/chiangmai-rounds` | `orders:write` |
| POST | `/api/v1/orders/chiangmai-complete` | `orders:write` |
| POST | `/api/v1/orders/dispatch-dashboard` | `reports:read` |
| POST | `/api/v1/orders/report-range` | `reports:read` |
| GET | `/api/v1/customers?q=` หรือ `?all=true` | `customers:read` |
| POST | `/api/v1/customers` | `customers:write` |
| GET | `/api/v1/customers/history` | `customers:read` |
| POST | `/api/v1/customers/delete` | `customers:write` |
| GET/POST/PATCH/DELETE | `/api/v1/drivers` | `drivers:read` / `drivers:write` |
| GET/POST/PATCH/DELETE | `/api/v1/vehicles` | `vehicles:read` / `vehicles:write` |
| POST | `/api/v1/vehicle-report` | `reports:read` |
| GET | `/api/v1/tracking?phone=` | `tracking:read` |

รูปแบบคำตอบเหมือนกันทั้งหมด:

```json
{ "ok": true, "data": … }
{ "ok": false, "error": "ข้อความอธิบาย" }
```

Payload ของแต่ละ endpoint ตรงกับ handler เดิมใน `app/api/**` ทุกฟิลด์ — ดูรายละเอียดฟิลด์ที่ [`README.md`](../README.md)

---

## 5. ตัวอย่าง

ค้นหาออเดอร์:

```bash
curl -G "https://<domain>/api/v1/orders" \
  -H "x-api-key: $HILLKOFF_API_KEY" \
  --data-urlencode "q=สมชาย"
```

สร้างออเดอร์ (ต้องมี `customerId` ที่มีอยู่จริงแล้ว):

```bash
curl -X POST "https://<domain>/api/v1/orders" \
  -H "x-api-key: $HILLKOFF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"order":{"id":"ORD-20260812-001","customerId":"cus_123","bookingNumbers":["HK-1234"],"boxes":3,"cod":0,"serviceDate":"2026-08-12"}}'
```

เปลี่ยนสถานะ:

```bash
curl -X PATCH "https://<domain>/api/v1/orders/workflow" \
  -H "x-api-key: $HILLKOFF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"ORD-20260812-001","action":"queue","note":"ส่งจากระบบ partner"}'
```

---

## 6. รหัสข้อผิดพลาด

| Status | ความหมาย |
| --- | --- |
| 400 | payload ไม่ถูกต้อง |
| 401 | ไม่มี key / key ผิด / ถูกเพิกถอน / หมดอายุ / ใช้ key นอก `/api/v1` |
| 403 | scope ไม่พอ, origin หรือ IP ไม่อยู่ใน allowlist, บทบาทไม่ตรงกับ endpoint |
| 404 | ไม่พบข้อมูล |
| 409 | ข้อมูลชนกัน (เช่น order id หรือเลขใบสั่งจองซ้ำ) |
| 429 | เกิน rate limit ของ key นั้น |
| 500 | ข้อผิดพลาดฝั่งเซิร์ฟเวอร์ (รายละเอียดอยู่ใน log เท่านั้น) |

---

## 7. CORS

- เว้น `origins` ว่างไว้ = เรียกจาก origin ไหนก็ได้ (เหมาะกับ server-to-server ที่ไม่ผ่านเบราว์เซอร์)
- ใส่ origin ไว้ = ตอบ `Access-Control-Allow-Origin` เฉพาะ origin นั้น และปฏิเสธ origin อื่นด้วย 403
- ทุก route รองรับ `OPTIONS` preflight แล้ว

> เบราว์เซอร์เปิดเผยทุกอย่างที่ frontend ถืออยู่ — ถ้าแอปปลายทางเป็น SPA ควรให้ backend ของแอปนั้นถือกุญแจแทน

---

## 8. การจัดการกุญแจ

หน้า `/admin/api-clients` (ต้องเข้าสู่ระบบด้วยบัญชี admin) ทำได้ทั้งหมด:

- ออกกุญแจใหม่ — **ค่าเต็มของกุญแจแสดงครั้งเดียว** ระบบเก็บแค่ hash กับ prefix 16 ตัวแรก
- แก้ scope, บทบาท, origin, IP allowlist, rate limit, วันหมดอายุ
- เปลี่ยนกุญแจ (rotate) โดยไม่ต้องสร้าง client ใหม่
- เพิกถอน / เปิดใช้งานอีกครั้ง

ทุกการกระทำเขียนลง `audit_logs` และการเรียกใช้จะอัปเดต `lastUsedAt` / `lastUsedIp` (throttle ไว้ที่ 1 ครั้ง/นาทีต่อ client)

หน้าเว็บเรียก admin endpoint ภายใน `GET/POST/PATCH/DELETE /api/admin/api-clients` ด้วย Firebase ID token ของบัญชี admin เท่านั้น เส้นทางนี้ไม่รับ API key และไม่ได้เป็นส่วนหนึ่งของ public API v1:

- `GET` แสดงรายการ client โดยไม่ส่ง `keyHash` กลับมา
- `POST` ออก client และคืน plaintext key เพียงครั้งเดียว
- `PATCH` แก้ชื่อ/คำอธิบาย/อีเมล, scopes, roles, origins, IP allowlist, rate limit, วันหมดอายุ, สถานะ หรือ rotate key
- `DELETE` เพิกถอน client โดยเก็บ record และ audit trail ไว้

`api_clients` ถูกปิดจาก client SDK ด้วย catch-all `allow read, write: if false` ใน [`firestore.rules`](../firestore.rules) อ่านได้เฉพาะฝั่ง Admin SDK

**ขั้นตอนเชื่อมแอปใหม่**

1. เปิด `/admin/api-clients` → ตั้งชื่อแอป → เลือก scope `*` และบทบาท `*` (สำหรับแอปของเราเอง) → ออกกุญแจ
2. คัดลอกกุญแจไปเก็บใน env ของแอปปลายทาง เช่น `HILLKOFF_API_KEY` (อย่า commit ลง repo)
3. ทดสอบด้วย `GET /api/v1/me`
4. ถ้าแอปปลายทางเป็นเว็บที่เรียกตรงจากเบราว์เซอร์ ให้ใส่ origin ของมันในช่อง Origins

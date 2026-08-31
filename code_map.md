# 🗺️ SYSTEM CODE MAP — Hillkoff Delivery System

> อัปเดตล่าสุด: 2026-07-28 · สแกนจากโค้ดจริงทั้ง repo
> เอกสารนี้เป็นแผนที่โค้ดไฟล์ต่อไฟล์ ใช้คู่กับ [`README.md`](README.md) (ภาพรวม/วิธีใช้งาน)
> **ระบบใช้ Cloud Firestore ทั้งหมด ไม่มี Supabase ในโค้ดปัจจุบันแล้ว**

---

## 1. สถาปัตยกรรมโดยรวม

```
┌──────────────────────────── Browser (PWA) ────────────────────────────┐
│  app/page.jsx (7,469 บรรทัด, "use client")                            │
│  · login + role routing + 25 tabs + realtime state                   │
│  · onSnapshot → orders / route_tasks / customers /                    │
│                 driver_locations / chat_messages                      │
│  · เขียนข้อมูลสำคัญทั้งหมด "ผ่าน API" ไม่เขียน Firestore ตรง            │
│  ├── app/components/*  (8 components)                                 │
│  └── lib/authenticatedFetch.js → แนบ Firebase ID token ทุก request      │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTPS + Bearer ID token
┌───────────────────────────────▼───────────────────────────────────────┐
│  app/api/**/route.js (47 route handlers, Node runtime)                │
│  ทุก write ผ่าน lib/workflowAuth.js → requireProfile(request, roles)   │
│  ├── lib/*.js  business logic (pure functions ส่วนใหญ่ → unit test ได้) │
│  └── lib/firebaseAdmin.js → Admin SDK singleton                       │
└───────┬──────────────┬──────────────┬──────────────┬──────────────────┘
        │              │              │              │
   Firestore      Firebase Auth      FCM         External:
   30 collections  Google/OTP/     Web Push      LINE OA API
   + Rules         password                      Google Apps Script
                                                 SMTP (OTP email)
                                                 Firebase Storage (backup)
```

**หลักการออกแบบ 5 ข้อที่โค้ดยึดถือ**

1. **Client อ่านได้ เขียนไม่ได้** — Firestore Rules ปิด write ของ `customers`, `users`, `users_by_phone`, `orders/activity` ทั้งหมด; `orders` เปิดเฉพาะ update ที่มี field allowlist
2. **Auth gate จุดเดียว** — `lib/workflowAuth.js` → `requireProfile()` เป็นประตูเดียวของทุก API
3. **Business logic เป็น pure function** — อยู่ใน `lib/` ไม่แตะ Firestore → มี unit test 20 ไฟล์
4. **Read plan แยกจาก Read** — `dispatchDashboardReadPlan`, `vehicleReportReadPlan`, `dailyOrdersReadPlan` คืน "แผนการ query" ให้ route เอาไปรัน → test ได้ว่าอ่านเกินขอบเขตไหม
5. **ไม่เดาข้อมูล** — `vehicleReport` ถ้าจับคู่ order กับรถไม่ได้แน่ชัด จะยกไปไว้ใน `dataQuality.ambiguousOrders` ไม่เดาทะเบียน

---

## 2. โครงสร้างโฟลเดอร์

```text
.
├── app/                              # Next.js App Router
│   ├── page.jsx                      # [ENTRY POINT] SPA ทั้งระบบ 7,469 บรรทัด
│   ├── layout.jsx                    # [APP SHELL] metadata + PWA manifest
│   ├── globals.css                   # [STYLE] 2,970 บรรทัด + print A4
│   ├── track/page.jsx                # [PUBLIC] ลูกค้าเช็กสถานะด้วยเบอร์โทร
│   ├── order-review/page.jsx         # [PUBLIC] ลูกค้าให้ดาว 1-5 + คอมเมนต์
│   ├── outstation-qr/route.js        # [PUBLIC] QR กล่อง → redirect LINE OA
│   ├── components/                   # 8 client components
│   └── api/                          # [SERVER] 47 route handlers
│       ├── admin/                    # delivery-sheet, driver-identities, reset-orders, users
│       ├── auth/                     # login, validate, google/start, google/verify
│       ├── backup/                   # now, list, restore, [date]/metadata
│       ├── customers/                # upsert, delete, search, history
│       ├── driver-assessments/       # submit, today
│       ├── driver-master/            # CRUD คนขับ
│       ├── fuel-bills/submit/
│       ├── google/ · sync/           # ⚠️ legacy proxy ปิดแล้ว (HTTP 410)
│       ├── line/                     # push, webhook
│       ├── orders/                   # create, workflow, delete, search, sync-sheet,
│       │                             # dispatch-dashboard, report-range, chiangmai-rounds
│       ├── outstation-dispatch/scan/
│       ├── outstation-labels/        # jobs, recipients, settings
│       ├── preparation/checkers/
│       ├── public/                   # track, order-review
│       ├── push/register/
│       ├── store/reports/
│       ├── vehicle-master/
│       ├── vehicle-report/           # query, export, odometer
│       └── vehicle-usage/submit/
├── lib/                              # 31 ไฟล์ business logic
│   ├── firebaseAdmin.js              # Admin SDK singleton
│   ├── firebaseClient.js             # Browser SDK + sign-in helpers
│   ├── workflowAuth.js               # ⭐ auth/authorization gate
│   ├── authenticatedFetch.js         # client fetch + token retry
│   ├── firestoreReadPolicy.js        # เพดานจำนวน read
│   ├── preparationWorkflow.js        # ⭐ store/pack state machine + รอบเชียงใหม่
│   ├── operationsReporting.js        # ⭐ date/status/area classification
│   ├── dispatchDashboard.js          # 8 KPI cards + driver loads
│   ├── vehicleReport.js              # join usage+fuel+assessment+orders
│   ├── vehicleReportCsv.js           # CSV + กัน formula injection
│   ├── vehicleMaster.js              # static 21 คัน (fallback)
│   ├── vehicleRepository.js          # Firestore-first + fallback
│   ├── vehicleOdometerCorrection.js  # แก้เลขไมล์ + audit
│   ├── outstationLabels.js           # label model + pagination A4
│   ├── outstationLabelStorage.js     # sanitizer ของ label API
│   ├── outstationDispatch.js         # QR HKO1 + box scan state
│   ├── outstationQr.js               # QR render options + scan URL
│   ├── orderReview.js                # QR HKO2 + rating aggregation
│   ├── bookingRegistry.js            # กันเลขใบสั่งจองซ้ำต่อเดือน
│   ├── customerSearchIndex.js        # prefix/trigram index
│   ├── driverIdentity.js             # UID history ของคนขับ
│   ├── deliverySheetSync.js          # sync order → Google Sheet
│   ├── googleAppsScript.js           # HTTP poster + shared secret
│   ├── lineOa.js                     # LINE signature + push
│   ├── otp.js · otpEmail.js          # OTP hash + SMTP
│   ├── backup/                       # backupService, firestoreBackup,
│   │                                 # storageBackup, cli
│   └── utils/backupUtils.js
├── scripts/                          # 6 migration/backfill/seed/audit
├── tests/
│   ├── unit/                         # 20 ไฟล์ Vitest
│   └── firestore.rules.test.js       # 11 scenario บน emulator
├── google-apps-script/               # Web App + Sheets dashboard (แยก project)
├── docs/                             # plans, specs, uat, mockups
├── public/                           # PWA icons, manifest, FCM service worker
├── backups/snapshots/                # snapshot จาก CLI (git ignored)
├── firestore.rules                   # 183 บรรทัด
├── firestore.indexes.json            # 6 composite indexes
└── firebase.json / .firebaserc       # config + emulator (port 8080)
```

---

## 3. Client Entry Point

### 📄 `app/page.jsx` — 7,469 บรรทัด
* **บทบาท:** `export default function App` — SPA ทั้งระบบในไฟล์เดียว: login, sidebar ตาม role, workspace ของ sales/store/pack/driver/admin/accounting, realtime state จาก Firestore
* **Constants:**
  * `STORE_KEY`, `initialDrivers` / `initialCustomers` / `initialOrders`
  * `ZONES` (10 โซนเชียงใหม่+ใกล้เคียง), `STATUS` = `["รอคนขับรับ","กำลังส่ง","กำลังจัดส่ง","ส่งสำเร็จ","ติดปัญหา","ยกเลิก"]`, `statusColor`, `WORKFLOW_STATUS_META`
  * `BRANCH_ROUTE_STOPS`, `LONG_ROUTE_STOPS`, `LONG_ROUTE_RETURN_STOPS`, `routeTaskStatusColor`, `TAB_TITLES`
  * SOP คนขับ: `DRIVER_DAILY_CHECK_ITEMS`, `DRIVER_WEEKLY_CHECK_ITEMS`, `DRIVER_MORNING_NOTICE`, `DRIVER_CARE_BASICS`, `DRIVER_RESPONSIBILITIES`, `DRIVER_PRECAUTIONS`, `DRIVER_REPAIR_STEPS`, `DRIVER_MAINTENANCE_SCHEDULE`
  * `DEFAULT_PREPARATION_CHECKERS`, `SUPER_ADMIN_EMAILS`
* **Sub-components ที่นิยามในไฟล์:** `WorkflowStatus`, `StoreMetricCard`, `OperationsKpiDashboard`, `SalesNoteAlert`, `ReworkNotice`, `PackSalesOrderDetails`, `OrderCreatedAt`, `OrderHistorySearch`, `BookingNumberInput`, `PackReportWorkspace`
* **Helpers:**
  * เงิน/วันที่ — `money`, `todayText`, `formatThaiDateTime`, `isSameLocalDay`, `toServiceDateKey` (Asia/Bangkok), `parseServiceDateKey`, `formatWithCommas`, `digitsOnly`
  * ID — `generateOrderId`, `generateCustomerId`, `routeTaskStopKey`
  * ลูกค้า — `normalizeCustomerText`, `compactCustomerText`, `customerSearchValues`, `customerMatchesQuery`, `customerNameKey`, `privacySafeName`
  * แผนที่ — `osmPageUrl`, `osmEmbedUrl` (OpenStreetMap)
  * LINE — `buildLineMessageForOrder`, `buildLineMessageForNewOrder`, `buildLineMessageForRouteTask`, `createLinePhotoSheet` (รวมรูปเป็น canvas → File), `dataUrlToFile`
  * ใบสั่งจอง — `isValidBookingNumber`, `normalizeBookingNumber`, `getOrderBookingNumbers`, `formatOrderBookingNumbers`
  * store flow — `skipsStoreCheck`, `storeStatusLabel`, `reportHistoryLabel`, `getOrderTimeline`
  * state — `defaultState`, `readState`
* **Auth & role routing:**
  * ฟังก์ชัน login: `startGoogleOtpLogin` + `verifyGoogleOtpLogin` (`/api/auth/google/start`, `/verify`), `passwordLogin` (`/api/auth/login`), `loginDriver`, `loginStaff` (`/api/auth/validate`), `registerDriver`, `applyLoginSession`, `logout`
  * `localStorage` keys: `hillkoff_auth`, `hillkoff-last-phone`, `hillkoff-last-sales-name`, `hillkoff-last-checker-names`, `hillkoff-device-id`, `hillkoff_last_emergency_id`, `chatLastReadKey`, `dailyVehicleStartKey`, `latestDriverVehicleKey` — **ไม่ cache orders/customers ลง localStorage**
  * Role → tabs (`selectAppTab`):
    * sales/admin → `sales`, `sales-outstation`, `dispatch`, `driver-ratings`, `chiangmai`, `driver-sop-report`, `reports`, `settings`
    * accounting → `driver-sop-report` (report-only)
    * driver → `driver`, `driver-prep`, `driver-vehicle`, `driver-sop`, `driver-dashboard`
    * store → `store-work`, `store-pickup`, `store-booking`, `store-online`, `store-dashboard`, `store-chiangmai-track`
    * pack → `pack-work`, `pack-pickup`, `pack-outstation`, `pack-booking`, `pack-online`, `pack-dashboard`
  * `authenticatedApiFetch` (useCallback) ห่อ `lib/authenticatedFetch` → ส่งต่อเป็น prop `apiFetch` ให้ทุก component
* **Realtime (`onSnapshot`, ใน effect ที่ล็อกด้วย auth):**
  * `orders` — driver: `driverId == did` + `lastDeliveryDriverId == did` + งานว่าง `queueStatus == "queued"`; staff: recent by `updatedAt` + `queueStatus in [preparing, ready, queued]` โดยเพดานมาจาก `lib/firestoreReadPolicy`
  * `route_tasks` — กรองตามคนขับ หรือทั้งหมดสำหรับ staff
  * `customers`, `driver_locations` (เฉพาะ non-driver), `chat_messages`
* **Actions แยกตามงาน:**
  * **ออเดอร์/ฝ่ายขาย** — `createOrder`, `confirmOrder` (`/api/orders/create`), `deleteOrder`, `updateOrder`, `assignDriver`, `resetAllOrders`, `resolveComplaint` (`/api/orders/workflow`), ค้นประวัติ `searchChiangmaiHistory` / `searchPickupHistory` / `searchOutstationHistory` / `openChiangmaiHistoryOrder` (`/api/orders/search`)
  * **ลูกค้า** — `saveCustomer` / `updateCustomer` (`/api/customers/upsert`), `deleteCustomer`, `loadAllHistoricalCustomers`, `loadCustomerOrderHistory`
  * **store/pack workflow** — `updatePreparationWorkflow` (`/api/orders/workflow`), `openWorkModal`, `validateWorkModal`, `confirmWorkModal`, `shareWorkToLine`, `captureWorkPhoto` / `removeWorkPhoto` / `clearWorkPhotos`, `archivePackOrder`, `loadCheckerLists` / `saveCheckerList`
  * **รายงานสโตร์** — `fetchStoreReports`, `saveStoreReports`, `addStoreDraftRow`, `saveStoreDrafts`, `startStoreReportConfirmation`, `confirmStoreReports`, `saveEditedStoreReport`, `openStoreReportDetail`, `deleteStoreReport`, `resubmitStoreReport`, `updateReportPackStatus`, `confirmSelectedPackReports`, `captureReportPhoto`, `shareReportToLine`; KPI — `buildStoreSummary`, `buildPackSummary`, `kpiActivitySummary`, `buildKpiActivityRows`, `reportToKpiOrder`, `comparisonLine`, `projectedEndOfDay`, `copyStoreSummary`, `shareStoreSummary`
  * **จัดคิว/dispatch** — `sharePendingOrderQueueToLine`, `shareOrderToLine`, `saveDriverSequence`, `moveDriverSequence`, `dropDriverSequence`
  * **คนขับ** — `acceptDriverDeliveryOrder`, `cancelDriverDeliveryOrder`, `completeDriverDeliveryOrder`, `persistDriverOrderPatch`, `uploadPod` / `clearPodPhotos`, `getCurrentLocationOnce`, `recordDriverCheckInLocation`, `recordRouteTaskCheckInLocation`, `upsertDriverLocationToFirestore`, `submitDriverDailyAssessment` / `submitDriverWeeklyAssessment`
  * **ใบปิดกล่องต่างจังหวัด + QR** — `loadOutstationLabelJobs`, `reopenOutstationLabelJob`, `applyOutstationQrScan`, `loadOutstationSenderSettings` / `saveOutstationSenderSettings`
  * **รถ/เลขไมล์/น้ำมัน** — `submitDailyVehicleStart`, `submitVehicleUsageEvent`, `submitFuelBill`
  * **รอบเชียงใหม่/งานวิ่ง** — `assignChiangmaiRound`, `createRouteTask`, `updateRouteTask`, `checkInRouteTaskStop`, `addRouteTaskMidwayCheckIn`, `uploadRouteTaskPhoto`, `shareRouteTaskStopToLine`, `completeRouteTask`
  * **รายงาน/export** — `generateDailyReport`, `summarizeOrders`, `appendDriverOrderSummary`, `buildServiceDateReport`, `buildServiceDateRangeReport`, `serviceDateRangeKeys`, `buildDriverDailyWorkReport`, `exportServiceDateReport`, `exportSelectedServiceReport`, `ordersToCsvText`, `escapeCsvCell`, `downloadTextFile`, `copyToClipboard`
  * **แชททีม** — `sendChat`, `finalizeChatSend`, `updateChatSummary`, `updateTyping`, `sendEmergency`, `scrollChatToBottom`, `getLastReadChatCount`, `markChatReadToCount`, `markChatReadUpToLatest`, `playNotificationSound`
  * **Push** — `requestNotifyPermission`, `ensureWebPushForDriver` (`/api/push/register`), `setAppBadgeSafe`, `getOrCreateDeviceId`
  * **ตั้งค่า/admin** — `createStaffAccount`, `loadStaffAccounts`, `toggleStaffAccountActive` (`/api/admin/users`), `setupDailyDeliverySheet`, `loadBackupList` / `runBackupNow` / `runRestoreBackup`, จัดการ driver identity (`/api/admin/driver-identities`)
* **Deps:** `lib/firebaseClient`, `lib/vehicleMaster`, `lib/firestoreReadPolicy`, `lib/authenticatedFetch`, `lib/outstationLabels`, `lib/outstationQr`, `lib/preparationWorkflow`, `lib/orderReview`; components ทั้ง 6 ตัวที่ถูก render; React hooks (`useState` ×158), `lucide-react`

### 📄 `app/layout.jsx`
* **บทบาท:** root layout เดียวของทุก route
* **Flow:** `metadata` (title `Hillkoff Delivery System`, `manifest: /manifest.webmanifest`, appleWebApp `black-translucent`), `icons` (`/delivery-logo.svg`, `/icon-192.png`, `/icon-512.png`, apple-touch 180×180), `viewport` (`themeColor #17351f`, `viewportFit: cover`), render `<html lang="th">`
* **Deps:** `./globals.css`

### 📄 `app/globals.css` — 2,970 บรรทัด
* **บทบาท:** stylesheet เดียวของระบบ (ไม่ใช้ CSS Modules / Tailwind)
* **Flow:**
  * Base reset + `body` bg `#f7f8f3`, ink `#172019`, font `Arial, "Noto Sans Thai"` — ไม่มี `@keyframes`
  * Palette "Fresh Leaf Workspace" ที่ `:root` บรรทัด ~1816: `--app-ink #183d2c`, `--app-green #31865c`, `--app-canvas #f4f9f1`, `--app-mint #e0f2dc`, `--app-shadow`
  * กลุ่ม class ตามงาน: `login-*`, `sidebar`/`brand`/`nav-count-badge`, `dispatch-*`, `driver-*`/`driver-sequence-*`, `ops-*` (ใหญ่สุด — kpi-dashboard-v2, pack-work, store-outstation, report-groups, progress-card, recent-orders), `daily-accordion-*`, `outstation-label-*`, `track-*`, `customer-*`, `history-search-*`, `monthly-analytics`/`month-bar-*`, `kpi-grid`/`metric`, `modal-*`/`panel`/`card`, utility `muted`/`empty`/`field-label`/`danger-text`/`no-print`
  * Breakpoints ~20 บล็อก: `max-width` 1180/1080/900/720/560/380px + `max-height: 800px`
  * **Print (บรรทัด ~2511):** `@page A4 portrait; margin: 0` → ซ่อน `body *` แล้วเปิดเฉพาะ `.outstation-label-preview*`; `.outstation-label-print-page` ขนาด 210mm × 297mm, padding 7mm, `page-break-after: always`, `print-color-adjust: exact`

### 📄 `app/track/page.jsx` — 120 บรรทัด
* **บทบาท:** [PUBLIC] ลูกค้าเช็กสถานะจากเบอร์โทร ไม่ต้องล็อกอิน
* **Flow:** state `phone/loading/error/order/searched`; input กรองด้วย `replace(/[^\d+\-\s]/g,"")`, `inputMode="tel"` → `searchOrder` GET `/api/public/track?phone=` → การ์ดผลลัพธ์ `.status-pill` = `done` เมื่อ `status === "ส่งแล้ว"` มิฉะนั้น `active`; `formatDate` ใช้ `Intl.DateTimeFormat("th-TH", tz Asia/Bangkok)`
* **Deps:** `/api/public/track`, `.track-*` ใน globals.css, `/delivery-logo.svg`

### 📄 `app/order-review/page.jsx` — 94 บรรทัด
* **บทบาท:** [PUBLIC] ฟอร์มให้ดาวหลังส่งของ เปิดจาก QR ของออเดอร์
* **Flow:** อ่าน token จาก `?t=` → state machine `loading | ready | submitted | error`; GET `/api/public/order-review?t=` เติมค่าจาก `data.latestReview`; `submitReview` POST `{token, rating, feedback}`; ปุ่ม 5 ระดับจาก `STAR_LABELS = ["แย่มาก","ควรปรับปรุง","พอใช้","ดี","ดีมาก"]`; แบนเนอร์เปลี่ยนเป็นสีเหลือง `#fff7ed` เมื่อ `deliveryCompleteness === "incomplete"` (รีวิวซ้ำได้หลังส่งรอบใหม่); `feedback` จำกัด 2000 ตัวอักษร

### 📄 `app/outstation-qr/route.js`
* **บทบาท:** [PUBLIC] ตรวจ token QR กล่องแล้ว redirect ผู้สแกนไป LINE OA
* **Flow:** `runtime = "nodejs"`; `GET` อ่าน `?t=` → `parseOutstationQrPayload(token)` → สำเร็จ redirect 302 ไป `HILLKOFF_LINE_URL`; ล้มเหลวคืน 400 `"Invalid outstation QR"` เป็น text/plain
* **Deps:** `lib/outstationDispatch`, `lib/outstationQr`

---

## 4. API Routes — `app/api/**/route.js`

> ทุก route ที่เขียนข้อมูลเรียก `requireProfile(request, [roles])` จาก `lib/workflowAuth.js` ก่อน
> error ทุกตัวถูกจัดรูปด้วย `errorResponse(error)` (5xx ถูก mask เป็น `"Unexpected server error"`)

### 4.1 Admin

#### 📄 `app/api/admin/users/route.js`
* **บทบาท:** CRUD บัญชีพนักงาน `store` / `pack` (Firebase Auth + โปรไฟล์ Firestore) — **admin เท่านั้น**
* **Flow:**
  * `GET` — อ่าน `users` where `role in ["store","pack"]` limit 200, ตัด field `password` ออก
  * `POST` — username ต้องตรง `/^[a-z0-9._-]{3,32}$/`, password ≥ 8 ตัว, role `store|pack`; สร้าง email สังเคราะห์ `<username>@staff.hillkoff.local`; `auth.createUser` หรือถ้าเจอ `auth/email-already-exists` → `getUserByEmail` + `updateUser` (รีเซ็ตรหัส + เปิดใช้งานใหม่); upsert `users/{uid}` เป็น `status: "approved"`, `active: true`
  * `PATCH` — อัปเดต `active`/`name` แล้ว mirror ไป Firebase Auth (`disabled`, `displayName`)
* **Deps:** `lib/firebaseAdmin` (`getAdminAuth`), `lib/workflowAuth`; collection `users`

#### 📄 `app/api/admin/driver-identities/route.js`
* **บทบาท:** ตรวจ/ย้ายข้อมูลตัวตนคนขับให้เป็น `identityVersion: 2` — **admin เท่านั้น**
* **Flow:**
  * `GET` — `loadDrivers(db)` อ่าน `users_by_phone` where `role == "driver"` limit 500 → `summary()` นับ total / migrated / pending / missingCurrentUid
  * `POST` — **dry run เป็นค่าเริ่มต้น** (`body.dryRun !== false`); รันจริงจะ batch write `driverIdentityPatch(data, uid)` + `identityMigratedBy`, ข้ามคนที่ไม่มี `uidLast`/`uid`
  * เขียน `audit_logs` action `driver_identity_migration`
* **Deps:** `lib/workflowAuth`, `lib/driverIdentity`; collections `users_by_phone`, `audit_logs`

#### 📄 `app/api/admin/reset-orders/route.js`
* **บทบาท:** ⚠️ ลบ collection `orders` ทั้งหมด — **admin + ต้องยืนยันด้วยข้อความ**
* **Flow:** `POST` ต้องมี `confirm === "YES_DELETE_ALL_ORDERS"` → นับด้วย `.count().get()` → `db.recursiveDelete(orders)` → คืน `{ ok, deleted }`

#### 📄 `app/api/admin/delivery-sheet/setup/route.js`
* **บทบาท:** provision Google Sheet ใบส่งของครั้งแรก — **admin เท่านั้น**
* **Flow:** `POST` → `setupDeliverySheet()`; คืน 502 เมื่อ `result.ok === false`
* **Deps:** `lib/deliverySheetSync`

### 4.2 Auth

#### 📄 `app/api/auth/google/start/route.js`
* **บทบาท:** ขั้น 1 ของ Google + Email OTP — ตรวจ Google ID token, เช็ก allowlist, rate limit, สร้าง OTP session แล้วส่งอีเมล
* **Flow:**
  * `POST` — ต้องมี `idToken`; role ต้องเป็น `sales|driver|admin|accounting`; **driver ถูกปฏิเสธเสมอ** (`DRIVER_GOOGLE_LOGIN_DISABLED`, 403)
  * `isAllowed(role, email)` — sales → `isHillkoffEmail`, accounting → `isApprovedAccountingEmail`, admin → `isAdminEmail`
  * `reserveOtpRequest` transaction บน `otp_rate_limits/{uid}`: เว้น ≥ 60 วินาที และไม่เกิน 8 ครั้ง/60 นาที (429)
  * สร้าง doc ใน `otp_sessions` จาก `createOtpSessionPayload` → `sendOtpEmail`; ส่งไม่สำเร็จ → `delivery: "failed"` + 503 `OTP_EMAIL_DELIVERY_FAILED` ยกเว้นเมื่อ non-production และ `OTP_DEV_MODE=true` (คืน `devOtp`)
  * บันทึก `audit_logs` action `otp_requested`
* **Deps:** `lib/otp`, `lib/otpEmail`, `lib/workflowAuth`, `lib/firebaseAdmin`; collections `otp_rate_limits`, `otp_sessions`, `users_by_phone`, `audit_logs`

#### 📄 `app/api/auth/google/verify/route.js`
* **บทบาท:** ขั้น 2 — ตรวจรหัส 6 หลัก แล้วสร้าง/รีเฟรชโปรไฟล์
* **Flow:**
  * `POST` ต้องมี `idToken`, `sessionId`, `otp` (`/^\d{6}$/`), optional `deviceId`
  * Transaction บน `otp_sessions/{sessionId}` — ตรวจ uid ตรงกัน, `usedAt`, `isOtpExpired`, attempts < 5, email ตรงกัน; เทียบ `hashOtp(otp, salt)` ด้วย `otpHashesEqual`; ผิดเพิ่ม `attempts`, ถูกตั้ง `usedAt`
  * Role: `isAdminEmail(email) ? "admin" : session.role`; ปฏิเสธ driver, `ROLE_MISMATCH`, `DRIVER_NOT_APPROVED`
  * Batch เขียน `users_by_phone/{phoneDigits}` (หรือ `users/{uid}` เมื่อไม่มีเบอร์) + `users/{uid}` + `login_events` (`provider: "google_otp"`)
* **Deps:** `lib/otp`, `lib/driverIdentity`, `lib/workflowAuth`

#### 📄 `app/api/auth/login/route.js`
* **บทบาท:** login เบอร์โทร + รหัสผ่าน — **คนขับเท่านั้น** (`role !== "driver"` → 403 `PASSWORD_LOGIN_NOT_ALLOWED_FOR_ROLE`) พร้อมอัปเกรด PIN เดิมและจัดการ trusted device
* **Flow:**
  * ตรวจ `idToken`, normalize เบอร์เป็นตัวเลข 9–15 หลัก
  * อ่าน `users_by_phone/{phone}` — ปฏิเสธ `ACCOUNT_NOT_APPROVED`, role ไม่ตรง, `ACCOUNT_DISABLED`, `PASSWORD_NOT_SET`
  * `passwordMatches` รองรับ `scrypt-v1` และ sha256 เดิม เทียบด้วย `crypto.timingSafeEqual`; ผิดพลาดผ่าน `login_rate_limits/{phone}` → **5 ครั้ง/15 นาที ล็อก 15 นาที** (429 `TOO_MANY_LOGIN_ATTEMPTS`)
  * สำเร็จ → rehash เป็น `scrypt-v1`, `FieldValue.delete()` ทิ้ง `pinSalt`/`pinHash`/`pinHashVersion`, ต่อ `hashDeviceId(deviceId)` (HMAC ด้วย `OTP_SECRET` ≥ 32 ตัว) เข้า `trustedDeviceHashes` (เก็บ 8 ล่าสุด) เมื่อ `rememberDevice`
  * Batch: set `users_by_phone`, set `users/{uid}`, ลบ `login_rate_limits`, เพิ่ม `login_events` (`provider: "password"`)

#### 📄 `app/api/auth/validate/route.js`
* **บทบาท:** ตรวจความถูกต้องของ session ทุก role — คืน 200 พร้อม `valid: true|false` เสมอ
* **Flow:** ตรวจ token → อ่าน `users/{uid}` (fallback query `users_by_phone` where `uidLast == uid`) → role ต้องอยู่ใน `admin|sales|driver|store|pack|accounting`; `PROFILE_NOT_FOUND` / `ACCOUNT_DISABLED`; **บังคับ single session** สำหรับ driver/sales — `users_by_phone.uidLast` ต้องเท่ากับ uid ไม่งั้น `SESSION_REPLACED`

### 4.3 Orders & Workflow

#### 📄 `app/api/orders/create/route.js`
* **บทบาท:** สร้างออเดอร์ + จองเลขใบสั่งจอง + idempotency + sync Sheet + แจ้งเตือน — `sales`, `admin`, `store` (store จะถูกทำเครื่องหมาย `store_assist`)
* **Flow:**
  * `order.id` ต้องตรง `/^[A-Za-z0-9._-]{1,120}$/`
  * เลขใบสั่งจอง: dedupe, ≤ 20 เลข, ทุกเลขต้องตรง `BOOKING_NUMBER_PATTERN` (`PREFIX-1234`)
  * ลูกค้าต้องมีอยู่ใน `customers/{id}` หรือ `customer_search/{id}` (`resolveCustomerRecord`) — ไม่มี → 404, ไม่มีชื่อ → 409; `boxes` ≤ 10,000, `cod` ≤ 1e9, `serviceDate` ผ่าน `validDateKey` (default = วันนี้ Bangkok)
  * `deliveryMethod` ∈ `grab_pickup | customer_pickup | outstation` มิฉะนั้น `company_driver` → `initialPreparationStatuses` กำหนด `workflowType`, `status`, `storeStatus`, `packStatus`, `queueStatus`, `urgentDelivery`; `resolveOptionalChiangmaiRound` + `resolveNextRoundDate` เติมรอบเชียงใหม่
  * **Transaction:** ถ้า `orders/{id}` มีอยู่แล้วและ `createdByUid`+`customerId`+`bookingNumber` ตรงกัน → คืน `alreadyExists: true` (replay ปลอดภัย) ไม่ตรง → 409; ทุก `booking_month_registry/{bookingRegistryId}` ต้องว่าง (ชนกัน → `bookingConflictMessage`); แล้ว create order + `activity` แรก + upsert `customer_search` + registry ต่อเลข
  * **หลัง commit:** `syncDeliveryOrderToSheet`; ถ้า `queueStatus === "queued"` ส่ง FCM multicast ไป `push_tokens` where `role == "driver"` (limit 500) พร้อมลบ token เสีย; `pushLineText(buildLineMessage(...))` แล้ว log ลง `notifications`
* **Deps:** `lib/workflowAuth`, `lib/lineOa`, `lib/deliverySheetSync`, `lib/customerSearchIndex`, `lib/bookingRegistry`, `lib/preparationWorkflow`, `lib/firebaseAdmin`

#### 📄 `app/api/orders/workflow/route.js` ⭐
* **บทบาท:** **state machine กลางของออเดอร์** — `PATCH` เดียวที่แยกทางตาม `(profile.role, action)` สำหรับ `sales`, `store`, `pack`, `driver`, `admin`
* **Flow:**
  * โหลด `orders/{orderId}` → สร้าง `history` entry + `patch` ที่มี `updatedAt` และ `workflowHistory` (เก็บ 100 รายการล่าสุด)
  * **driver** — `driver_cancel` (ต้องเป็น `driverId` ตัวเอง, จาก `กำลังส่ง|กำลังจัดส่ง` เท่านั้น, ต้องมีเหตุผล → คืนเข้าคิว + `complaintStatus: "open"`), `driver_rework` (ต้อง `deliveryCompleteness === "incomplete"` + `driverNote`, ใช้ `driverReworkPatch`, จำกัด `podPhotoCount` 0–5), `driver_complete` (ตั้ง `ส่งสำเร็จ`/`completed`, `deliveredAt`, เพิ่ม `deliveryAttemptNumber`, บันทึก `lastDeliveryDriverId/Name/At`, `sharedToLine: true`, merge `resolveDeliveryVehicleSnapshot`)
  * **store** — `store_update`: `storeStatus` ∈ `working|checked|partial|waiting|returned`, ต้องมีชื่อผู้ตรวจเมื่อ `checked|partial|waiting`; แก้เลขใบสั่งจองจะจอง/ปล่อย `booking_month_registry` (409 เมื่อชน); เขียน `storeWorkDetails`; ส่งต่อ `packStatus` และดัน rework เป็น `waiting_pack`
  * **pack** — `pack_update`: ต้องผ่านสโตร์ก่อน (`direct_pack` หรือสโตร์ `checked|partial`) ไม่งั้น 409; เมื่อ `checked|partial` ตั้ง `queueStatus` เป็น `grab_ready` / `outstation_ready` / `ready` ตาม `deliveryMethod`; `returned` ส่งกลับสโตร์ (ห้ามใน `direct_pack` และ `outstation`); `pack_archive` ต้องมีเหตุผล และห้ามเมื่อเข้าคิว/มีคนขับแล้ว
  * **sales/admin** — `grab_pickup` (ต้อง `queueStatus === "grab_ready"`), `queue` (สโตร์+แพ็ค `checked|partial`, ไม่มี rework ค้าง, ไม่ใช่ pickup/outstation), `complaint_resolve`
  * **Commit แบบ optimistic concurrency:** `batch.update(ref, patch, { lastUpdateTime: snap.updateTime })` + `activity` doc + booking registry; Firestore error 9/10 → 409 `"Order changed concurrently"`; แล้ว `syncDeliveryOrderToSheet` (ไม่ fatal) และเมื่อ `action === "queue"` ส่ง FCM ไปคนขับ
* **Deps:** `lib/workflowAuth`, `lib/deliverySheetSync`, `lib/bookingRegistry`, `lib/preparationWorkflow`, `lib/operationsReporting`, `lib/firebaseAdmin`

#### 📄 `app/api/orders/delete/route.js`
* **บทบาท:** ลบออเดอร์ + คืนเลขใบสั่งจอง — `sales`, `store`, `admin` (non-admin ลบได้เฉพาะงานเตรียมของที่ยังไม่เข้าคิวและคนขับยังไม่แตะ)
* **Flow:** ไม่มีออเดอร์ → `{ ok: true, alreadyDeleted: true }`; guard non-admin ตรวจ **สองครั้ง** (ก่อนและใน transaction): ห้ามเมื่อมี `driverId`, `queueStatus` ไม่ใช่ `preparing|ready`, `status` ∈ `รอคนขับรับ|กำลังส่ง|กำลังจัดส่ง|ส่งสำเร็จ`, หรือไม่มี `workflowType`; อ่าน `activity` ≤ 400 doc ล่วงหน้า → transaction ลบ activity + order + `booking_month_registry` ที่ `source === "orders"` และ `sourceId === orderId` + เขียน `audit_logs` `order_deleted` พร้อม `orderSnapshot` เต็ม

#### 📄 `app/api/orders/search/route.js`
* **บทบาท:** ค้นออเดอร์ตาม id หรือข้อความ — `sales`, `store`, `pack`, `admin`
* **Flow:** `?id=` คืน order + `activity` (order by `at asc`, limit 1000); `?q=` ≥ 2 ตัวอักษร, `?scope=` รับเฉพาะ `store_pickup` / `outstation`; ไล่หน้า `orders` order by `updatedAt desc` ทีละ 500 (`startAfter`) ถึง `MAX_SCANNED_ORDERS = 5000`, match กับ haystack (id, เลขใบสั่งจอง, ชื่อ/เบอร์ลูกค้า, โซน, ที่อยู่, note, status ทั้ง 3 ชั้น), หยุดที่ `MAX_SEARCH_RESULTS = 100`

#### 📄 `app/api/orders/dispatch-dashboard/route.js`
* **บทบาท:** รวมข้อมูล dashboard จัดคิวของวันที่เลือก — `sales`, `admin`
* **Flow:** `dispatchDashboardReadPlan(selectedDate)` → รันทุก spec ขนานกัน (`.limit(1000)`) → dedupe ด้วย `Map` → `buildDispatchDashboard(orders, selectedDate)`

#### 📄 `app/api/orders/report-range/route.js`
* **บทบาท:** ดึงแถวรายงานตามช่วงวัน — `sales`, `admin`
* **Flow:** `dailyOrdersReadPlan({from, to})`; ช่วงจำกัด `MAX_RANGE_DAYS = 92` (เกิน → 400); query เดียว `limit(5000)`; `projectOrder` ตัดเหลือ `REPORT_FIELDS`: `serviceDate, status, cod, driverId, driverName, zone, deliveryMethod, customerName, complaint, complaintStatus, deliveredAt`

#### 📄 `app/api/orders/chiangmai-rounds/route.js`
* **บทบาท:** กำหนดรอบส่งเชียงใหม่ให้ออเดอร์เดียว — `sales`, `admin`
* **Flow:** `PATCH` → `validateChiangmaiRound(order, roundCode)` + `resolveNextRoundDate(orderCreatedDateKey(order), roundCode)` → merge `chiangmaiRoundCode/Date/AssignedAt/By` + `workflowHistory` entry `assign_chiangmai_round` + `activity` doc

#### 📄 `app/api/orders/chiangmai-rounds/queue/route.js`
* **บทบาท:** ส่งออเดอร์ทั้งรอบ (หรือที่เลือก) เข้าคิวคนขับพร้อมกัน — `sales`, `admin`
* **Flow:** อ่าน `orders` where `chiangmaiRoundDate == roundDate` (limit 201) → กรอง `chiangmaiRoundCode` และตัดสถานะจบงาน; **เพดาน 200 ออเดอร์** (เกิน → 409), รอบว่าง → 404; `selectedIds` ที่ไม่อยู่ในรอบ → 409 + `missingOrderIds`; transaction อ่านซ้ำทุกออเดอร์ ถ้าชุดเปลี่ยน → 409 + `blockingOrderIds`, ปฏิเสธออเดอร์ที่ไม่ผ่าน `isReadyOrderWaitingForDispatch`; แต่ละตัวตั้ง `queueStatus: "queued"`, `status: "รอคนขับรับ"` + `activity` `queue_round_bulk` ที่ใช้ `batchId` ร่วมกัน (`round_<date>_<epoch>`); เขียน `audit_logs` แล้วส่ง FCM `type: "chiangmai_round_ready"`

#### 📄 `app/api/orders/sync-sheet/route.js`
* **บทบาท:** สั่ง sync ออเดอร์เดียวขึ้น Google Sheet ด้วยมือ — `sales`, `store`, `pack`, `driver`, `admin`
* **Flow:** `POST { orderId }` → `syncDeliveryOrderToSheet(db, orderId)`; คืน 502 เมื่อ `result.ok === false`

### 4.4 Customers

#### 📄 `app/api/customers/upsert/route.js`
* **บทบาท:** สร้าง/แก้ลูกค้า + ตรวจซ้ำจากชื่อและเบอร์ — `sales`, `admin`, `store`
* **Flow:** `customer.id` ต้องตรง `/^[A-Za-z0-9._-]{1,120}$/`; `cleanCustomer` normalize + ตัดความยาว + สร้าง `nameKey` และ `phoneDigits`; `isSafeHttpUrl` จำกัด `mapUrl` เป็น http/https; สร้าง query ตรวจซ้ำ **สูงสุด 6 ชุด** (`customers.nameKey`, `customers.phoneDigits`, `customer_search.nameKey/.phoneDigits/.terms`) รันใน `runTransaction` — ชนกัน → 409 พร้อมข้อความไทยและ `{duplicateId, duplicateName, duplicateField}` (`เบอร์โทร` หรือ `ชื่อลูกค้า`); ไม่ชน → set `customers/{id}` + `customer_search/{id}` ผ่าน `customerSearchRecord`

#### 📄 `app/api/customers/search/route.js`
* **บทบาท:** ค้นลูกค้าจาก index `customer_search` — `sales`, `admin`, `store`
* **Flow:** `?all=true` โหลด ≤ 1000 doc order by `updatedAt desc`; ไม่งั้น `?q=` ต้อง normalize ได้ ≥ 3 ตัวอักษร; **cache ใน process 5 นาที** (Map ≤ 100 key) + `pending` map รวม request ซ้ำ; ทางหลัก `where("terms","array-contains", q)` limit 50 → fallback `where("searchKeys","array-contains", compactCustomerSearch(q).slice(0,3))` limit 250 แล้ว match ในหน่วยความจำ; ผลลัพธ์ ≤ 50

#### 📄 `app/api/customers/history/route.js`
* **บทบาท:** คืนข้อมูลลูกค้า + ออเดอร์ย้อนหลังทั้งหมด — `sales`, `admin`
* **Flow:** อ่าน `customers/{id}` fallback `customer_search/{id}` (ไม่มีทั้งคู่ → 404); `addQuery` ยิง `orders` ขนานกัน **5 แบบ** (`customerId`, `customerPhoneDigits`, `customerPhone`, `phone`, `customerName`, limit 1000 ต่อชุด) เพื่อครอบออเดอร์เก่าที่ยังไม่มี `customerId`; dedupe ตาม doc id → กรอง false positive ชื่อซ้ำเบอร์ต่างด้วย `normalizeCustomerSearch` → sort ตาม `orderTimestamp` (`updatedAt` → `createdAt` → `deliveredAt`) desc

#### 📄 `app/api/customers/delete/route.js`
* **บทบาท:** ลบลูกค้าและ index — `sales`, `admin`
* **Flow:** ตรวจ `customerId` (ไม่ว่าง ≤ 200 ไม่มี `/`) → batch ลบ `customers/{id}` + `customer_search/{id}`

### 4.5 Store Reports

#### 📄 `app/api/store/reports/route.js` — ไฟล์ใหญ่สุดใน api
* **บทบาท:** CRUD + workflow ยืนยันของห้องแพ็ค สำหรับรายงานเตรียมของ (`booking` / `online`) — `GET`: `store|pack|admin`, `POST`/`PUT`/`DELETE`: **store เท่านั้น**, `PATCH`: `store|pack`
* **Flow:**
  * `GET` โหมดต่าง ๆ — `?alerts=true` (store เท่านั้น) รวมยอด `status in [waiting, partial]` และ `packStatus in [waiting, partial, returned]` ต่อประเภท; `?id=` คืนรายงาน + `history` (`at desc`, limit 1000) + สรุปออเดอร์ที่ผูกไว้; ปกติคืนรายการกรองตาม `type` และช่วงวัน Bangkok (`utcRangeForBangkokDate` + `startAt`/`endAt`) หรือ `kpi=true` + `fromDate` (limit 1000 vs 250) กรองด้วย `isStoreReportVisibleToRole` แล้ว batch โหลดออเดอร์ด้วย `db.getAll` (≤ 500 id)
  * `POST` — 1–50 แถว; type `booking` ต้องผ่าน `BOOKING_NUMBER_PATTERN` ทุกแถว; เลขซ้ำใน payload → 409; transaction จอง `booking_month_registry` ต่อแถว — **ถ้าเลขนั้นถูก `source === "orders"` ถือไว้แล้ว จะ "ผูก" รายงานเข้ากับออเดอร์นั้น** (`linkedOrderId`, `registryShared: true`) และต่อรายละเอียดเข้า `storeBookingSupplements` ของออเดอร์ (เก็บ 30 ล่าสุด) + `workflowHistory` `store_booking_detail_added` + `activity`
  * `PATCH` — pack: `bulk_confirm` (≤ 50 id, ต้องมีชื่อผู้ตรวจ, เฉพาะ `packStatus === "pending"`) หรือแก้เดี่ยว `packStatus ∈ [checked, partial, returned]` (`returned` ต้องมีเหตุผล); store: `resubmit` (จาก `returned|partial`) หรือ bulk `confirmed` ตาม type + วัน
  * `PUT` — เฉพาะผู้สร้าง (`createdByUid`); รายงานที่ยืนยันแล้วต้องมี `reason`; เลขเดิม+ผูกออเดอร์ → transaction แก้ supplement ในออเดอร์ด้วย; เปลี่ยนเลข → จอง registry ใหม่ (409 เมื่อชน)
  * `DELETE` — soft delete (`deletedAt`, `deletedBy`, `deleteReason`), เฉพาะผู้สร้าง, รายงานที่ยืนยันแล้วต้องมีเหตุผล; รายงานที่ผูกออเดอร์จะถอด supplement ออกด้วย
* **Deps:** `lib/workflowAuth`, `lib/bookingRegistry`, `lib/preparationWorkflow`

### 4.6 Outstation (ต่างจังหวัด)

#### 📄 `app/api/outstation-labels/jobs/route.js`
* **บทบาท:** สร้าง/ดู/ติดตามสถานะงานพิมพ์ใบปิดกล่อง — `sales`, `admin`
* **Flow:** `GET` ไม่มี `jobId` → list `outstation_label_jobs` (`createdAt desc`, limit 50); มี `jobId` (ผ่าน `cleanJobId` `/^[a-z0-9._-]{8,160}$/`) → job + `items` (`ordinal asc`, limit 10,000); `POST` → `sanitizePrintJob(payload)` โดยใช้ `idempotencyKey` เป็น doc id (**replay คืน `alreadyExists: true`**), transaction สร้าง summary (`status: "creating"`, `itemCount`, `pageCount = ceil(items/5)`, `orderCount`, `orderIds`) แล้วเขียน items ทีละ `WRITE_CHUNK_SIZE = 400` ที่ `items/{ordinal 6 หลัก}` → flip เป็น `status: "ready"` + `events` doc `created`; `PATCH` → `sanitizePrintStatusPatch` อัปเดต `status` + key แบบ dynamic (`<status>At`, `<status>ByUid`, `<status>ByName`) + `events`

#### 📄 `app/api/outstation-labels/recipients/route.js`
* **บทบาท:** สมุดที่อยู่ผู้รับต่างจังหวัดต่อลูกค้า — `sales`, `admin`
* **Flow:** `GET` → `outstation_recipient_addresses` where `customerId == id` limit 100, sort ในหน่วยความจำตาม `lastUsedAt`/`createdAt` desc; `POST` → `sanitizeRecipientRecord` โดย doc id = `addressRecordId()` = SHA-256 40 ตัวแรกของ `customerId + ชื่อผู้รับ + ที่อยู่ + phoneDigits` → **dedupe อัตโนมัติ**

#### 📄 `app/api/outstation-labels/settings/route.js`
* **บทบาท:** โปรไฟล์ผู้ส่งที่พิมพ์บนใบปิดกล่อง (doc เดียว) — `sales`, `admin`
* **Flow:** `GET` อ่าน `outstation_label_settings/default` fallback `DEFAULT_OUTSTATION_SENDER` ผ่าน `sanitizeSenderProfile`; `PUT` merge + `updatedAt/ByUid/ByName`

#### 📄 `app/api/outstation-dispatch/scan/route.js`
* **บทบาท:** สแกน QR กล่องเพื่อยืนยันส่งขึ้นขนส่ง — `sales`, `pack`, `admin`
* **Flow:** `parseOutstationQrPayload(body.qrPayload)` → `{orderId, boxIndex, ...}`; transaction บน `orders/{orderId}`: 404 เมื่อไม่มี, 409 เมื่อ `validateOutstationDispatchOrder` ไม่ผ่าน ("ยังไม่พร้อมส่งขนส่ง หรือปิดงานแล้ว"); `applyOutstationBoxScan` คืน `{patch, duplicate, complete, scannedCount, expectedCount}`; สแกนที่ไม่ซ้ำจะเพิ่ม `activity` `outstation_dispatch_scan` พร้อม `boxLabel: "<index>/<expected>"`; หลัง commit `syncDeliveryOrderToSheet`

### 4.7 Vehicle & Driver

#### 📄 `app/api/driver-assessments/submit/route.js`
* **บทบาท:** คนขับส่งผลตรวจรถรายวัน/รายสัปดาห์ — **driver เท่านั้น** (ยืนยันด้วย `resolveVerifiedDriver` ไม่ใช่ `requireProfile`)
* **Flow:** `payload.driverId` ถ้ามีต้องตรงกับที่ resolve ได้ (403 "Driver mismatch"); `assessmentType` `daily|weekly` — daily ต้องมี `DAILY_CHECK_IDS` ครบ (`coolant, engineOil, leakage, warningLights`) + รถที่ resolve ได้ + `odometerStart` ∈ (0, 10,000,000]; weekly ต้องมีข้อ `"0".."6"`; doc id = `${driverId}_${serviceDate}` และ `${driverId}_${weekKey}` (สัปดาห์เริ่มจันทร์); daily เขียนพร้อม `googleSyncStatus: "pending"` แล้ว `syncMileageToGoogle` (`action: "upsertDailyMileage"`) แล้วอัปเดตสถานะเป็น synced/skipped/failed

#### 📄 `app/api/driver-assessments/today/route.js`
* **บทบาท:** มุมมองฝ่ายขาย — คนขับทั้งหมดและผลตรวจของวันนั้น — `sales`, `admin`
* **Flow:** `POST` (ไม่ใช่ GET); `serviceDate` เป็น `YYYY-MM-DD` default = วันนี้ Bangkok; อ่านขนานกัน `users_by_phone` where `role == "driver"` + `driver_daily_assessments` where `serviceDate ==`; คืนรายชื่อคนขับ + assessment + `HILLKOFF_VEHICLES`

#### 📄 `app/api/vehicle-usage/submit/route.js`
* **บทบาท:** คนขับบันทึกการใช้รถ (`start` / `segment` / `end`) พร้อมปิดงานค้างอัตโนมัติ — **driver เท่านั้น**
* **Flow:**
  * `eventType` ∈ `start|segment|end`; `odometer` ∈ (0, 10,000,000]; `odometerStart` ∈ [0, 10,000,000]; สำหรับ `end` ต้อง `odometer >= odometerStart`
  * `start` → `findLatestPreviousVehicleEvent` สแกน `vehicle_usage_events` where `vehicleId ==` limit 100 (ตัด `autoClosed` และวันเดียวกัน/หลังกว่า) แล้ว sort ตาม `serviceDate` → `createdAt`; ถ้า event ล่าสุดไม่ใช่ `end` จะสร้าง doc ปิดงานอัตโนมัติ id `auto_end_<sourceEventId>_<startServiceDate>` (`autoCloseDocId`) แบบ **idempotent** (`usageType: "จบงานอัตโนมัติ"` + คำเตือนไทยเมื่อเลขไมล์ใหม่ต่ำกว่าเดิม)
  * เขียน event จริงพร้อม snapshot รถ/คนขับ + `googleSyncStatus: "pending"`
  * `scheduleGoogleSync` ใช้ `after()` จาก `next/server` ยิง `action: "appendUsageSegment"` แบบ out-of-band (timeout 6 วินาที) แล้วอัปเดตสถานะ sync

#### 📄 `app/api/fuel-bills/submit/route.js`
* **บทบาท:** คนขับส่งบิลน้ำมัน — **driver เท่านั้น**
* **Flow:** ต้อง resolve รถได้; ตรวจตัวเลข `odometer` (0, 1e7], `amount` (0, 1e7], `liters` (0, 10,000], `pricePerLiter` [0, 100,000]; `effectivePricePerLiter` fallback = `amount / liters` ปัด 2 ตำแหน่ง; สร้าง doc ใน `fuel_bills` พร้อม snapshot รถ + `station`, `receiptNo`, `note`, `googleSyncStatus: "pending"` → `syncFuelBillToGoogle` (`action: "appendFuelBill"`)

#### 📄 `app/api/vehicle-master/route.js`
* **บทบาท:** ข้อมูลหลักรถ — `GET`: `driver` + manager, เขียน: `MANAGER_ROLES = ["sales","admin","accounting"]`
* **Flow:** `GET` `?includeInactive=true` ต้องเป็น manager (ไม่งั้น 403) → `listVehicles(db, {includeInactive})`; `POST` (และ `PATCH = POST`) upsert `vehicle_master/{id}` (`assetCode`, `plate`, `vehicleType`, `brand`, `model`, `responsiblePerson`, `department`, `active`) + `audit_logs` `vehicle_created`/`vehicle_updated`; `DELETE` เป็น **soft disable** (`active: false`) + `audit_logs` `vehicle_disabled`

#### 📄 `app/api/driver-master/route.js`
* **บทบาท:** ข้อมูลหลักคนขับ (soft delete) — `sales`, `admin`, `accounting`
* **Flow:** `GET` อ่าน `users_by_phone` where `role == "driver"` limit 500; `POST` (และ `PATCH = POST`) เบอร์ต้อง ≥ 9 หลัก → upsert `users_by_phone/{phoneDigits}` (`driverId` default `driver_<phoneDigits>`) และ mirror ไป `users/{uidLast}` เมื่อมี + `audit_logs`; `DELETE` soft disable + `audit_logs` `driver_disabled`

#### 📄 `app/api/vehicle-report/query/route.js`
* **บทบาท:** สร้างรายงานรวมการใช้รถ/น้ำมัน/ตรวจสภาพ/งานส่ง — `sales`, `admin`, `accounting`
* **Flow:** `vehicleReportReadPlan({from, to})` คืน **6 spec** รันขนานกันด้วย `executeRead` (limit 5000): `vehicle_usage_events`, `fuel_bills`, `driver_daily_assessments` + `orders` 3 ชุด (`serviceDate`, วันที่ส่ง, `updatedAt`) ที่รวมกันด้วย `uniqueRows`; `listVehicles(db, {includeInactive: true})` รันไปพร้อมกัน → `buildVehicleReport(...)`

#### 📄 `app/api/vehicle-report/export/route.js`
* **บทบาท:** export รายงานรถเป็น CSV — สืบทอด role gate จาก query route
* **Flow:** clone request แล้วเรียก `POST as queryReport` จาก `../query/route` (auth เกิดที่นั้น); `selectedIds` กรอง `json.data.rows`; คืน `vehicleReportToCsv(rows)` เป็น `text/csv; charset=utf-8` ชื่อไฟล์ `vehicle-report-<from>-<to>.csv`

#### 📄 `app/api/vehicle-report/odometer/route.js`
* **บทบาท:** แก้เลขไมล์ start/end ที่บันทึกผิด พร้อม audit trail — `admin` หรือ `accounting` **และ** ต้องผ่าน `canCorrectVehicleOdometer(profile)`
* **Flow:** `PATCH`; transaction บน `vehicle_usage_events/{eventId}`: 404 เมื่อไม่มี, 409 เมื่อ `eventType` ไม่ใช่ `start`/`end`; อ่าน event พี่น้อง (`vehicleId` + `serviceDate` + `driverId`, limit 50) → หา `minimumOdometer` / `maximumOdometer` → `buildOdometerCorrection` คืน `{eventPatch, auditRecord}` → merge patch + เขียน `vehicle_odometer_audits`

### 4.8 Preparation, Push, LINE, Public, Backup, Legacy

#### 📄 `app/api/preparation/checkers/route.js`
* **บทบาท:** จัดการรายชื่อผู้ตรวจของสโตร์/ห้องแพ็ค — `store`, `pack`, `admin`
* **Flow:** `GET` อ่าน `app_settings/preparation_checkers` fallback `DEFAULT_CHECKERS` (store: เล็ก, ณัฐ, สุภาพ, ลืน, โจ้, สมนึก · pack: กิต, มาย, ยุทธ, หล้า, มุก); `PUT` แยกสิทธิ์ต่อรายการ — `canEditStore` = store|admin, `canEditPack` = pack|admin, role ที่ไม่มีสิทธิ์จะคงค่าเดิมไว้; `cleanNames` dedupe + ตัด 80 ตัวอักษร + ≤ 50 รายชื่อ

#### 📄 `app/api/push/register/route.js`
* **บทบาท:** ลงทะเบียน FCM web-push token — `driver` หรือ `sales` และ role ที่อ้างต้องตรงกับโปรไฟล์
* **Flow:** `token` ต้องมี ≤ 1500 ตัวและไม่มี `/` (ใช้เป็น doc id); `profile.role !== role` → 403 "Role mismatch"; upsert `push_tokens/{token}` (`role`, `phoneDigits`, `driverId`, `deviceId`, `userAgent` ≤ 500, `ownerUid`)

#### 📄 `app/api/line/push/route.js`
* **บทบาท:** ส่งข้อความไป LINE OA เป้าหมายที่ตั้งไว้ — `sales`, `admin`
* **Flow:** `text` ไม่ว่าง ≤ 5000 ตัว; ปลายทางจาก `LINE_DEFAULT_TO` (ไม่มี → 503); `pushLineText` → log ลง `notifications` (`channel: "line"`); ล้มเหลว → 502

#### 📄 `app/api/line/webhook/route.js`
* **บทบาท:** รับ webhook จาก LINE — public แต่ **ตรวจ signature**
* **Flow:** อ่าน raw body (> 1 MiB → 413) → `verifyLineSignature(rawBody, x-line-signature)` (ไม่ผ่าน → 401) → parse JSON, ตัด `events` เหลือ 100 → เขียน `line_webhook_events`

#### 📄 `app/api/public/track/route.js`
* **บทบาท:** [PUBLIC] ติดตามออเดอร์จากเบอร์โทร — ไม่มี auth, มี rate limit และ mask ข้อมูล
* **Flow:** rate limiter ในหน่วยความจำบน `globalThis.__hillkoffTrackAttempts` key ตาม `x-forwarded-for`/`x-real-ip`: **20 ครั้ง/10 นาที** → 429 + `Retry-After: 600` (map ตัดตัวเองเมื่อเกิน 2000 key); เบอร์ต้อง 8–15 หลัก; อ่าน `orders` where `customerPhoneDigits ==` order by `updatedAt desc` limit 10 เอาตัวใหม่สุด; `findDriver` อ่าน `users_by_phone` where `driverId ==`; `serializeOrder` เปิดเผยเฉพาะข้อมูล mask — `publicStatus` ยุบเหลือ `ส่งแล้ว`/`กำลังส่ง`, `maskCustomerName` = `คุณ <4 ตัวแรก> ******`, `driverPhone` เป็น `""` เสมอ, ที่อยู่เหลือแค่ `zone` ≤ 80 ตัว, รายการสินค้าสรุปเป็นจำนวนกล่อง; ทุก response `Cache-Control: no-store`

#### 📄 `app/api/public/order-review/route.js`
* **บทบาท:** [PUBLIC] รับรีวิวการจัดส่งผ่าน token ใน QR — ไม่มี role gate สิทธิ์ควบคุมด้วย token
* **Flow:** `GET` → `parseOrderReviewPayload(t)` → อ่าน order (404 ถ้าไม่มี, 409 ถ้า `canReviewOrder` false) → `serializeOrder` (public fields + `latestReview`); `POST` → `parseOrderReviewPayload(body.token)` + `normalizeOrderReviewInput({rating, feedback})`; transaction ตรวจซ้ำ → `latestDeliveryIdentity(order)` → คำนวณ `attempt` จาก `deliveryAttemptNumber` → create doc ใน subcollection `orders/{id}/delivery_reviews` + merge `latestDeliveryReview`, `deliveryReviewRating/Feedback/DriverId/DriverName/Attempt/SubmittedAt` และเพิ่ม `deliveryReviewCount`; error map เป็นข้อความไทยตาม status

#### 📄 `app/api/backup/now/route.js` · `list` · `[date]/metadata` · `restore`
* **บทบาท:** ควบคุม backup/restore — **admin ทั้งหมด**
* **Flow:**
  * `POST /now` → `createBackup(reason || "manual")`
  * `GET /list` → `listBackups()` + `getBackupMetadata(ตัวใหม่สุด)` (error ถูกกลบเป็น `null`) + `createBackupSummary(...)`
  * `GET /[date]/metadata` → `getBackupMetadata(date)`
  * `POST /restore` — `maxDuration = 300`; ต้อง `confirm === "YES_REPLACE_FIRESTORE_DATA"` เมื่อ `replace === true` มิฉะนั้น `"YES_MERGE_FIRESTORE_DATA"`; `collections` optional (≤ 100) → `loadBackup` → `restoreFirestoreBackup(data, selected, {replace})`

#### 📄 `app/api/google/route.js` · `app/api/sync/route.js` — ⚠️ ปิดใช้งานแล้ว
* **บทบาท:** legacy proxy ที่ยิง URL ตามที่ผู้ใช้ส่งมา (เสี่ยง SSRF / open proxy) — **ถูกปิดถาวร**
* **Flow:** ทั้ง `GET` และ `POST` คืน `disabled()` → HTTP **410** พร้อมข้อความให้ไปใช้ `/api/orders/sync-sheet` แทน

---

## 5. `lib/` — Business Logic

### 5.1 Firebase & Auth

#### 📄 `lib/firebaseAdmin.js`
* **บทบาท:** Admin SDK singleton
* **Exports:** `getFirebaseAdminApp()` (reuse app เดิม, parse `FIREBASE_SERVICE_ACCOUNT_JSON` ผ่าน `parseServiceAccount()` — un-escape `\n` ใน `private_key`, ต้องมี `project_id`/`client_email`/`private_key`, fallback `applicationDefault()`), `getAdminAuth()`, `getAdminDb()`, `getAdminMessaging()`, `getAdminStorage()`
* **Deps:** `firebase-admin/{app,auth,firestore,messaging,storage}`; env `FIREBASE_SERVICE_ACCOUNT_JSON`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `GOOGLE_APPLICATION_CREDENTIALS`

#### 📄 `lib/firebaseClient.js`
* **บทบาท:** Browser SDK singleton + ฟังก์ชัน sign-in ทั้งหมด
* **Exports:**
  * `getFirebaseApp()` (ตรวจ `NEXT_PUBLIC_FIREBASE_API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID` ผ่าน `requiredEnv` ที่ throw ทุกครั้งเมื่อขาด), `getFirebaseAuth()`, `getFirestoreDb()`, `onFirebaseAuthStateChanged`, `onFirebaseIdTokenChanged`
  * Messaging: `getFirebaseMessaging()` (คืน `null` เมื่อไม่รองรับ), `getFcmToken(swRegistration)` → `{ok, token}` (ต้องมี `NEXT_PUBLIC_FIREBASE_VAPID_KEY`)
  * Sign-in: `ensureRecaptcha(containerId)` (cache verifier บน `window.__hillkoffRecaptchaVerifier`), `startPhoneSignInE164`, `signInWithGoogle` (prompt `select_account`), `signInAnon`, `signInWithStaffCredentials(username, password)` → map เป็น `<username>@staff.hillkoff.local`, `fbLogout()`
  * `fb` — namespace object re-export Firestore SDK (`serverTimestamp`, `doc`, `setDoc`, `updateDoc`, `deleteDoc`, `getDoc`, `getDocs`, `addDoc`, `increment`, `collection`, `query`, `where`, `orderBy`, `limit`, `onSnapshot`)

#### 📄 `lib/workflowAuth.js` ⭐ ประตูเดียวของทุก API
* **บทบาท:** ตรวจ bearer ID token, โหลดโปรไฟล์, บังคับ role, จัดรูป error
* **Exports:**
  * `ADMIN_EMAIL = "online_marketing@hillkoff.com"`; `isAdminEmail(value)` (รับ `ADMIN_EMAIL_ALLOWLIST` CSV เพิ่ม), `isHillkoffEmail(value)` (suffix `@hillkoff.com`), `isApprovedAccountingEmail(value)` (ต้องเป็น Hillkoff email **และ** อยู่ใน `ACCOUNTING_EMAIL_ALLOWLIST`)
  * `requireProfile(request, allowedRoles = [])` — ดึง `Bearer` token (ไม่มี → 401) → `verifyIdToken(token, true)` **ตรวจ revocation** (ล้มเหลว → 401) → อ่าน `users/{uid}` fallback query `users_by_phone.where("uidLast","==",uid)` → บังคับ `role = "admin"` เมื่อเป็น admin email → **ตรวจ session freshness** ของ driver/sales (ต้องเป็น `uidLast`/`uid` ปัจจุบัน, driver ยอมรับ `legacyUids`) ไม่ผ่าน → 401 `"Session has been replaced by a newer login"` → แล้วจึง 403 `"Profile not found"` / `"Account disabled"` / `"Forbidden"`; คืน `{profile, db, decoded}`
  * `errorResponse(error)` — map `error.status` (400–599 ไม่งั้น 500), **mask 5xx เป็น `"Unexpected server error"`**, `console.error` รายละเอียดจริง

#### 📄 `lib/driverIdentity.js`
* **บทบาท:** ดูแลประวัติ Firebase UID ของคนขับ (คนขับเปลี่ยนเครื่อง/สมัครใหม่ UID จะเปลี่ยน) และ resolve โปรไฟล์จาก token
* **Exports:** `driverIdentityPatch(existing, uid)` — merge `legacyUids` + `uidLast` + `uid` + uid ปัจจุบัน, dedupe, เก็บ 12 ล่าสุด (`MAX_LEGACY_UIDS`), ตั้ง `identityVersion: 2`, `migrationStatus: "identity_migrated"`; `resolveVerifiedDriver(db, decoded)` — ทางหลัก `users/{uid}` → `phoneDigits` → `users_by_phone/{phoneDigits}` แล้วรับเฉพาะเมื่อ `role === "driver"`, `active !== false`, และ uid ตรงกับ `uidLast`/`uid`/`legacyUids`; fallback query `where("uidLast","==",uid)`

#### 📄 `lib/authenticatedFetch.js`
* **บทบาท:** ห่อ `fetch` ฝั่ง client แนบ ID token และ retry หนึ่งครั้งเมื่อ auth ล้ม
* **Exports:** `authenticatedFetch(input, init, {getToken, fetchImpl})` — เรียก `getToken(true)` เอา token สด, ตั้ง `Authorization: Bearer`, บังคับ `cache: "no-store"`; `isAuthorizationFailure` ถือว่า 401 คือ fail และ 409 คือ fail เฉพาะเมื่อ body match `/authorization token|expired authorization/i`; **retry ครั้งเดียว ไม่วนลูป**; token ว่าง → throw `"กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"`

#### 📄 `lib/otp.js`
* **บทบาท:** สร้าง/hash OTP และ payload ของ session
* **Exports:** `normalizeEmail`, `normalizePhoneDigits`, `createOtpCode()` (6 หลักจาก `crypto.randomInt`), `hashOtp(code, salt)` (HMAC-SHA256 บน `salt:code` — throw `"OTP_SECRET must be at least 32 characters"` เมื่อ secret สั้นเกิน), `otpHashesEqual` (`timingSafeEqual`), `createOtpSessionPayload({...})` (salt hex 16 ไบต์, `attempts: 0`, `usedAt: null`, **TTL 5 นาที**), `isOtpExpired(session)`

#### 📄 `lib/otpEmail.js`
* **บทบาท:** ส่งอีเมล OTP ผ่าน SMTP (nodemailer)
* **Exports:** `getSmtpConfig()` (port default 465, secure default true, `from` fallback = `SMTP_USER`), `hasSmtpConfig()`, `sendOtpEmail({to, code, expiresAt})` — คืน `{ok: false, skipped: true, reason}` เมื่อไม่มี config หรืออีเมลไม่ถูกต้อง (regex + ≤ 254 ตัว); timeout connection/greeting 10s, socket 15s; subject `"Hillkoff Delivery OTP"`

### 5.2 Workflow & Reporting

#### 📄 `lib/preparationWorkflow.js` ⭐
* **บทบาท:** state machine สโตร์/ห้องแพ็ค + ตารางรอบส่งเชียงใหม่ + การส่งงานกลับไปแก้ (rework)
* **Exports:**
  * จำแนกออเดอร์ — `isOutstationOrder`, `isChiangmaiPreparationOrder`, `isSalesWaitingAlert`, `isNormalChiangmaiOrder`, `isReadyOrderWaitingForDispatch` (pack `checked`/`partial` + queue `""`/`preparing`/`ready` + ไม่มีคนขับ + ไม่ใช่ rework), `isDriverDeliveryOrder(order, driverId)`, `isStoreReportVisibleToRole(report, role, includeDeleted)`
  * รอบส่ง — `CHIANGMAI_ROUND_CODES = ["tuesday","wednesday","friday"]`, `resolveNextRoundDate(createdDate, roundCode)` (คำนวณ weekday แบบ UTC), `validateChiangmaiRound`, `resolveOptionalChiangmaiRound`, `buildChiangmaiRoundGroups(orders)` → `{key, roundCode, roundDate, orders, total, ready, selectableIds}`
  * เส้นทางเตรียมของ — `resolvePreparationRoute(deliveryMethod, workflowType)`, `initialPreparationStatuses(...)` → `{workflowType, storeStatus, packStatus, queueStatus, status, urgentDelivery}`
  * Rework — `resolveDriverReworkRoute(order)`, `requiresDriverDeliveryNote(deliveryCompleteness)`, `driverReworkPatch(order, actor, note, now)` (เคลียร์คนขับ, `status: "ติดปัญหา"`, `queueStatus: "preparing"`, เพิ่ม `deliveryAttemptNumber`, ตั้ง `reworkStatus` เป็น `waiting_store` หรือ `waiting_pack`, note บังคับ ≤ 2000 ตัว)
* **Deps:** ไม่ import อะไร (มี `TRANSFERRED_QUEUE_STATUSES` Set ภายในไฟล์)

#### 📄 `lib/operationsReporting.js` ⭐
* **บทบาท:** ชั้นจำแนกวันที่/สถานะ/พื้นที่ ที่ทุก dashboard และรายงานใช้ร่วมกัน
* **Exports:**
  * `TERMINAL_QUEUE_STATUSES` (Set: `completed`, `outstation_ready`, `grab_completed`, `grab_picked_up`, `pack_archived`, `driver_archived`, `cancelled`), `bangkokDateKey(value)`
  * Read plans — `vehicleReportReadPlan({from,to})` คืน 6 descriptor, `dailyOrdersReadPlan({from,to})` คืน 1 descriptor; ทั้งคู่ throw `"Invalid report date range"`
  * Date keys — `orderCreatedDateKey(order)` (ใช้ `createdServiceDate` ก่อน), `orderDeliveryDateKey(order)` (ใช้ `deliveryServiceDate` ก่อน แล้วแปลง `deliveredAt` รูปแบบเก่า `D/M/YYYY` **ลบ 543 เมื่อปี > 2400** — รองรับปี พ.ศ.)
  * สถานะ/พื้นที่ — `isTerminalDeliveryOrder`, `classifyOrderArea` (`"outstation"` / `"city"`), `isChiangmaiWaitingForDate`, `isChiangmaiBacklogForDate`, `isOutstationWaitingForDate`
  * จับคู่รถ — `resolveDeliveryVehicleSnapshotFromEvents(events, serviceDate)` คืน `deliveryVehicleSource: "driver-usage-exact"` **เฉพาะเมื่อมีรถตรงเพียงคันเดียว** ไม่งั้น `"unresolved"`; `resolveDeliveryVehicleSnapshot(db, {driverId, deliveryServiceDate})` query `vehicle_usage_events` limit 200
* **Deps:** `./preparationWorkflow.js` (`isOutstationOrder`), `./vehicleMaster.js` (`vehicleDisplayName`)

#### 📄 `lib/dispatchDashboard.js`
* **บทบาท:** read plan + คำนวณ dashboard จัดคิวจาก orders ดิบ
* **Exports:** `dispatchDashboardReadPlan(selectedDate)` (ตรวจ `YYYY-MM-DD` แล้วคืน 2 descriptor: `serviceDate ==` และ `queueStatus in [preparing, ready, queued]`); `buildDispatchDashboard(orders, selectedDate)` — หา `availableDates` (120 วันที่สร้างล่าสุด), กรองตามวันที่เลือก, จัดกลุ่มต่อคนขับเป็น `driverLoads` (`total`, `waiting`, `active`, `delivered`, `city`, `outstation`) เรียงตาม `total` desc, และคืน **8 cards**: `created`, `waitingDriver`, `activeDelivery`, `delivered`, `routeTasks`, `chiangmaiWaiting`, `chiangmaiBacklog`, `outstationWaiting`

#### 📄 `lib/firestoreReadPolicy.js`
* **บทบาท:** ค่าคงที่คุมจำนวน read และรอบ refresh (คุมค่าใช้จ่าย Firestore)
* **Exports:** `INITIAL_RECENT_ORDERS_LIMIT` 100, `DRIVER_RECENT_ORDERS_LIMIT` 200, `ORDERS_LOAD_MORE_STEP` 200, `MAX_RECENT_ORDERS_LIMIT` 600; `REPORT_REFRESH_INTERVALS` (frozen) — `issues` 5 นาที, `kpi` 15 นาที, `reports` 10 นาที; `recentOrdersLimit(requested, role)` (พื้น 200 สำหรับ driver, 100 สำหรับอื่น, เพดาน 600), `nextOrdersLimit(current)`

### 5.3 Vehicle

#### 📄 `lib/vehicleReport.js`
* **บทบาท:** join usage events + fuel bills + assessments + ออเดอร์ที่ส่งแล้ว → แถวรายงาน "ต่อวัน × ต่อรถ × ต่อคนขับ"
* **Exports:** `buildVehicleReport({from, to, vehicleId, driverId, usageEvents, fuelBills, assessments, orders, vehicles})`
* **Flow:** key = `date|vehicleId|driverId` (default `unallocated`/`unknown`); usage events ตั้ง `odometerStart` (min ของ `start`) และ `odometerEnd` (max ของ `end`) พร้อม event id, `distanceKm = max(0, end - start)`, propagate `autoClosed`; fuel bills รวม `fuelLiters`/`fuelAmount`; assessments พลิก `inspectionStatus` เป็น `"completed"`; ออเดอร์ผูกรถผ่าน `deliveryVehicleId` (`vehicleLinkStatus: "exact"`) หรือ usage event เดียวที่ตรง (`"historical-single-vehicle"`) — **ไม่งั้นไปอยู่ใน `dataQuality.ambiguousOrders` / `unallocatedOrders` และไม่ถูกนับ**; คืน `{rows, summary, dataQuality, vehicles}`

#### 📄 `lib/vehicleReportCsv.js`
* **บทบาท:** แปลงแถวรายงานเป็น CSV ที่ Excel ไทยอ่านได้และปลอดภัย
* **Flow:** `HEADERS` map 15 field เป็น label ไทย (`serviceDate`→`วันที่` … `vehicleLinkStatus`→`สถานะเชื่อมรถ`); `safeCell(value)` เติม `'` หน้าค่าที่เริ่มด้วย `=`, `+`, `-`, `@` (**กัน CSV/formula injection**) แล้วครอบ quote; `vehicleReportToCsv(rows)` join ด้วย `\r\n` และนำหน้าด้วย BOM `﻿`

#### 📄 `lib/vehicleMaster.js`
* **บทบาท:** รายชื่อรถบริษัท 21 คันแบบ hard-coded (ใช้เป็น fallback ของ Firestore)
* **Exports:** `HILLKOFF_VEHICLES` (21 record: `no`, `assetCode`, `plate`, `vehicleType`, `brand`, `model`, `responsiblePerson`, `department` + `id = assetCode`, `active: true`), `findVehicleById(vehicleId)`, `findDefaultVehicleForDriver(driver)` (fuzzy match ชื่อกับ `responsiblePerson` แบบ NFKC + ตัดช่องว่าง + lowercase + substring fallback, default = คันแรก), `vehicleDisplayName(vehicle)` → `` `${plate} · ${brand} ${model}` `` หรือ `"ยังไม่เลือกรถ"`

#### 📄 `lib/vehicleRepository.js`
* **บทบาท:** อ่านรถจาก Firestore ก่อน แล้ว fallback ไป static list อย่างนุ่มนวล
* **Exports:** `listVehicles(db, {includeInactive})` — อ่าน `vehicle_master` ทั้ง collection, กรอง active, sort ตาม `plate`/`assetCode` ด้วย collation ไทย; **ว่างหรือ error → `console.warn` แล้วคืน `HILLKOFF_VEHICLES`**; `resolveVehicle(db, vehicleId, {includeInactive})` — อ่าน doc, fallback `findVehicleById`, คืน `null` เมื่อ id ว่างหรือรถ inactive

#### 📄 `lib/vehicleOdometerCorrection.js`
* **บทบาท:** สิทธิ์และตัว build patch สำหรับแก้เลขไมล์พร้อม audit
* **Exports:** `APPROVED_ODOMETER_ACCOUNTING_EMAIL = "acc.ap@hillkoff.com"`; `canCorrectVehicleOdometer(profile)` — อนุญาต `role === "admin"` หรือ `accounting` ที่อีเมลตรงตัวนี้เท่านั้น; `buildOdometerCorrection({event, odometer, minimumOdometer, maximumOdometer, reason, actor, now})` — ตรวจ event id, odometer finite ∈ (0, 10,000,000], ความสอดคล้องเชิงทิศทาง (`end` ต่ำกว่า start ไม่ได้, `start` สูงกว่า end ไม่ได้), `reason` บังคับ ≤ 1000; คืน `{eventPatch, auditRecord}` (audit เก็บ `previousOdometer`, `nextOdometer`, `serviceDate`, `vehicleId`, `driverId`, `eventType`, `correctedByUid/Email/Role`)

### 5.4 Outstation & Review

#### 📄 `lib/outstationLabels.js`
* **บทบาท:** domain model ของใบปิดกล่อง — ค่าเริ่มต้น, แตกเป็นรายกล่อง, แบ่งหน้า A4
* **Exports:** `OUTSTATION_LABELS_PER_PAGE = 4`, `GREEN_MAIL_TRACKING_DEFAULT = "BU003931"`, `DEFAULT_OUTSTATION_SENDER` (frozen — ที่อยู่สาขาเชียงใหม่), `getDefaultTrackingCode(carrier)` (คืนรหัสเมล์เขียวเฉพาะ carrier `เมล์เขียว`), `normalizeLabelDraft(input)` (trim/cap ทุก field, sender 3 บรรทัด, recipient 4 บรรทัด, `codAmount` เป็นจำนวนไม่ติดลบ), `buildLabelSnapshot(order, draft)` (default `codEnabled` จาก `order.cod > 0`, ออก `boxIndex`, `boxTotal`, `boxLabel`), `expandOrderToLabelItems(order, draftOverrides)`, `replaceOrderLabelItems(items, orderId, nextBoxTotal)`, `paginateLabelItems(items, pageSize)`, `validateLabelDraft(input)` → `{ok, errors}` (keys `recipientName`, `recipientAddress`, `carrier`)

#### 📄 `lib/outstationLabelStorage.js`
* **บทบาท:** sanitizer/validator ทุกอย่างที่ label API เขียนลง Firestore
* **Exports:** `normalizeIdempotencyKey(value)` (lowercase + slugify `[a-z0-9._-]`, ≥ 8 ตัว, ≤ 160), `sanitizeSenderProfile(input)` (ต้องมี `name` + ที่อยู่ ≥ 1 บรรทัด), `sanitizeRecipientRecord(input)` (ต้องมี `customerId` ตาม `SAFE_ID_PATTERN` + `recipientName`, ที่อยู่ ≤ 4 บรรทัด, derive `phoneDigits`), `sanitizePrintJob(input)` (`MAX_JOB_ITEMS = 10,000`, ห้ามงานว่าง; ภายในเรียก `sanitizePrintItem` ที่ re-validate ด้วย `normalizeLabelDraft`/`validateLabelDraft` และบังคับ `boxLabel === "${boxIndex}/${boxTotal}"` ตรงตัว), `sanitizePrintStatusPatch(input)` (`status` ∈ `printed | reprinted | cancelled`, `reason` บังคับสำหรับ `reprinted`/`cancelled`)

#### 📄 `lib/outstationDispatch.js`
* **บทบาท:** โปรโตคอล QR สแกนกล่อง (`HKO1`) + state transition แบบ pure
* **Exports:** `createOutstationQrPayload(item)` → `HKO1|<orderId>|<boxIndex>|<boxTotal>`, `parseOutstationQrPayload(value)` (รับทั้ง payload ตรงและ URL `/outstation-qr?t=`, ตรวจ `boxIndex <= boxTotal`), `validateOutstationDispatchOrder(order)` (`deliveryMethod === "outstation"`), `getOutstationScanOutcome(result)` → `"duplicate" | "complete" | "scanned"`, `applyOutstationBoxScan(order, payload, actor, now)` — dedupe ตาม `boxIndex`, ปฏิเสธ box total ไม่ตรงกับใบแรก, คืน `{duplicate, complete, scannedCount, expectedCount, patch, scan}`; **เมื่อสแกนครบทุกกล่อง patch จะตั้ง `status: "ส่งสำเร็จ"`, `queueStatus: "completed"`, `outstationDispatchedAt/By`**

#### 📄 `lib/outstationQr.js`
* **บทบาท:** ตัวเลือกการ render QR, URL สแกน และ config กล้อง html5-qrcode
* **Exports:** `HILLKOFF_LINE_URL` (หน้าเพิ่มเพื่อน LINE OA), `outstationQrRenderOptions` = `{errorCorrectionLevel: "H", margin: 4, width: 240}`, `createOutstationQrUrl(origin, payload)`, `createOutstationCameraScanConfig(qrCodeFormat)` = `{fps: 10, qrbox: 280×280, formatsToSupport: [...]}`

#### 📄 `lib/orderReview.js`
* **บทบาท:** QR รีวิวลูกค้า (`HKO2`), validate input, และสรุปคะแนนต่อคนขับ
* **Exports:** `ORDER_REVIEW_QR_PREFIX = "HKO2"`, `ORDER_REVIEW_PATH = "/order-review"`, `MAX_ORDER_REVIEW_FEEDBACK_LENGTH = 2000`; `isValidOrderReviewOrderId`, `createOrderReviewPayload(orderId)` → `HKO2|<orderId>`, `createOrderReviewUrl(origin, orderId)`, `parseOrderReviewPayload(value)` (throw `"Invalid order review QR payload"`), `normalizeOrderReviewInput({rating, feedback})` (rating integer 1–5), `latestDeliveryIdentity(order)` (ใช้ `lastDeliveryDriverId/Name` ก่อน), `canReviewOrder(order)` (ต้องมีคนขับ + timestamp การส่ง + status `ส่งสำเร็จ` หรือ `deliveryCompleteness === "incomplete"` และไม่ใช่ `ยกเลิก`), `getLatestOrderReview(order)`, `aggregateLatestDriverReviews(orders)` → `{id, name, count, total, average, latestFeedback, latestFeedbackAt}` เรียงตาม average → count → name

### 5.5 Data Integrity & Integration

#### 📄 `lib/bookingRegistry.js`
* **บทบาท:** helper pure สำหรับกันเลขที่ใบสั่งจองซ้ำภายในเดือนเดียวกัน
* **Exports:** `BOOKING_NUMBER_PATTERN = /^[^-\s]{1,20}-\d{4}$/`, `normalizeBookingNumber` (uppercase + ตัดช่องว่าง), `bookingMonthKey(serviceDate)` → `YYYY-MM`, `bookingRegistryId(serviceDate, bookingNumber)` → `` `${month}__${normalized}` ``, `bookingRegistryRecord({...})`, `bookingConflictMessage(record)` (ข้อความไทย)

#### 📄 `lib/customerSearchIndex.js`
* **บทบาท:** สร้าง prefix/trigram สำหรับค้นหา และ document ของ index
* **Exports:** `normalizeCustomerSearch` (lowercase + ตัดช่องว่าง), `compactCustomerSearch` (ตัด `-_.(),/\` เพิ่ม), `customerSearchTerms(customer)` (prefix ยาว 3–40 จาก name/contact/phone/zone/address, ≤ 200 รายการ), `customerSearchKeys(customer)` (trigram เลื่อน 3 ตัว, ≤ 200), `customerSearchRecord(customer)` (payload เต็มพร้อม `nameKey`, `phoneDigits`, `terms`, `searchKeys`), `resolveCustomerRecord(customer, indexedCustomer)`

#### 📄 `lib/deliverySheetSync.js`
* **บทบาท:** ส่งออเดอร์ขึ้น Google Sheet ใบส่งของรายวัน และบันทึกสถานะ sync กลับที่ออเดอร์
* **Exports:** `syncDeliveryOrderToSheet(db, orderId, suppliedOrder = null)` — อ่านออเดอร์ถ้าไม่ได้ส่งมา (`{ok: false, error: "Order not found"}`), POST `{action: "upsertDailyDeliveryOrder", order}` แล้ว merge `sheetSyncStatus` (`synced`/`skipped`/`failed`), `sheetSyncError` (≤ 500 ตัว), `sheetSyncedAt` กลับที่ออเดอร์; `setupDeliverySheet()` → `{action: "setupDeliveryWorkbook"}`

#### 📄 `lib/googleAppsScript.js`
* **บทบาท:** ตัวส่ง HTTP กลางไป Apps Script พร้อม shared secret และ timeout
* **Exports:** `getMileageSheetUrl()` (`GOOGLE_MILEAGE_WEB_APP_URL` → `GOOGLE_SHEETS_WEB_APP_URL` → `""`), `getDeliverySheetUrl()` (`GOOGLE_DAILY_DELIVERY_WEB_APP_URL` → fallback เดียวกัน), `postToGoogleAppsScript(url, payload, {timeoutMs = 8000})` — ไม่มี URL → `{ok: true, skipped: true}`, ไม่มี `GOOGLE_SHEETS_SHARED_SECRET` → `{ok: false, skipped: true}`, ไม่งั้น POST `text/plain;charset=utf-8` แนบ `sharedSecret` + `AbortSignal.timeout`

#### 📄 `lib/lineOa.js`
* **บทบาท:** integration LINE Official Account
* **Exports:** `getLineConfig()`, `verifyLineSignature(rawBody, signature)` (HMAC-SHA256 base64 เทียบด้วย `timingSafeEqual`, คืน `false` เมื่อ throw), `pushLineText({to, text, metadata})` — POST `https://api.line.me/v2/bot/message/push` timeout 10s, คืน `{ok: false, skipped: true, reason}` เมื่อไม่มี token/ปลายทาง/ข้อความ, ปฏิเสธข้อความเกิน 5000 ตัว

### 5.6 `lib/backup/`

#### 📄 `lib/backup/backupService.js`
* **บทบาท:** จัดการ snapshot ลงดิสก์ (+ อัปโหลด cloud ถ้าเปิด), list, load แบบตรวจ checksum, และล้างของเก่า
* **Exports:**
  * `createBackup(reason = "manual")` — สร้าง `BACKUP_DIR/<backupId>` (id `YYYY-MM-DD_HH-MM-SS-mmm`, `mkdir` แบบไม่ recursive เพื่อให้ชนกันแล้ว fail) → `fetchAllData()` → เขียนไฟล์ JSON ต่อ collection พร้อม `{size, rows, checksum}` → `backup-metadata.json` (version `"3.0"`, `totalSize`, `durationMs`, `authNote` เรื่องรหัสผ่านที่กู้ไม่ได้) → `uploadToStorage` เมื่อ `BACKUP_UPLOAD_TO_CLOUD === "true"` → `cleanupOldBackups()`; **error ใด ๆ จะลบโฟลเดอร์ทิ้ง**
  * `listBackups()` (ชื่อโฟลเดอร์ที่ตรง `BACKUP_ID_PATTERN` ใหม่สุดก่อน, `[]` เมื่อ ENOENT), `getBackupMetadata(backupId)`, `getBackupTableData(backupId, collectionName)` — ป้องกัน path traversal ด้วย `safeBackupPath` + `safeCollectionName` (`/^[A-Za-z0-9_-]{1,1500}$/`)
  * `loadBackup(backupId, collectionNames = null)` — **ตรวจ SHA-256 ทุกไฟล์** → throw `Checksum mismatch: <name>` หรือ `Collection not found in backup: <name>`
  * `cleanupOldBackups()` (ลบเก่ากว่า `BACKUP_RETENTION_DAYS`, default 30, ต่ำสุด 1), `formatBytes(bytes)`

#### 📄 `lib/backup/firestoreBackup.js`
* **บทบาท:** export/import Firestore + Auth โดยรักษาชนิดข้อมูลดั้งเดิม
* **Flow:** `encodeValue`/`decodeValue` แปลง `Timestamp`, `GeoPoint`, `DocumentReference`, bytes (base64), ตัวเลข non-finite ผ่าน discriminator `__firestoreType`; `fetchAllData()` — `db.listCollections()` เรียงตาม id, export ทุก root collection เป็น `{path, data}` แล้ว merge ผล `collectionGroup` ของ `activity` และ `history` เข้า array ของ collection แม่ + ต่อ `result.auth_users` จาก `listAuthUsers()` (page 1000, เก็บ uid/email/displayName/phone/disabled/`customClaims`/`providerData`/`metadata`); `getTableStats(data)`; `restoreFirestoreBackup(backupData, collections, {replace = false})` — **ข้าม `auth_users`**, `recursiveDelete` ก่อนเมื่อ replace, ตรวจ `path` ว่าเริ่มด้วยชื่อ collection และมี segment เป็นเลขคู่, เขียนทีละ 400 doc ด้วย `merge: !replace`, คืน `{success, restored, collections, authUsersRestored: false}`

#### 📄 `lib/backup/storageBackup.js`
* **บทบาท:** อัปโหลดไฟล์ JSON ของ snapshot ไป Firebase Storage
* **Exports:** `uploadToStorage(backupPath, backupId)` — อัปโหลดเฉพาะไฟล์ปกติที่ลงท้าย `.json` ไปที่ `backups/snapshots/<backupId>/<file>` (`contentType: application/json`, `cacheControl: no-store`, `resumable: false`)

#### 📄 `lib/backup/cli.js`
* **บทบาท:** entrypoint CLI ของ backup (ไม่มี export — เป็น script)
* **Flow:** โหลด `.env.local` ผ่าน `dotenv.config` → อ่าน `process.argv[2]` (default `backup`), `argument(name)` ดึง `--flag value`; `backup` → `createBackup(--reason || "manual-cli")`; `list` → พิมพ์ `listBackups()`; `restore` → **ต้อง `--confirm YES_REPLACE_FIRESTORE_DATA`**, `--collections a,b` optional → `loadBackup` → `restoreFirestoreBackup(..., {replace: true})`; คำสั่งไม่รู้จัก → throw

#### 📄 `lib/utils/backupUtils.js`
* **บทบาท:** helper ทั่วไปสำหรับ checksum/วันที่/รายงาน (บางส่วนเป็นของเก่า)
* **Exports:** `generateChecksum(data)` (SHA-256 hex), `verifyChecksum(...)`, `getCurrentTimestamp()`, `formatDate(date)`, `parseDate(dateStr)`, `daysBetween(from, to)`, `formatBytes(bytes)`, `generateReport(metadata)`, `createBackupSummary(backups)` → `{totalBackups, dateRange, spanDays, avgPerDay}`
* **หมายเหตุ:** ดูหัวข้อ 11 (หนี้ทางเทคนิค) — `generateReport` อ่าน field ที่ `createBackup` ไม่ได้สร้าง

---

## 6. `app/components/` (8 ไฟล์)

#### 📄 `DispatchDashboard.jsx`
* **บทบาท:** dashboard จัดคิว — 8 KPI cards + รายการออเดอร์กรองได้ + ภาระงานต่อคนขับ
* **Props:** `{apiFetch, role, onDeleteOrder, onResetOrders}`
* **Flow:** state `selectedDate` (default วันนี้ Bangkok), `data`, `query`, `status`, `loading`; `load` (useCallback) POST `{selectedDate}` → `/api/orders/dispatch-dashboard`, throw `"โหลดแดชบอร์ดไม่สำเร็จ"` เมื่อพลาด; effect รันครั้งแรกแล้วทุก **5 นาที เฉพาะเมื่อ `document.visibilityState === "visible"`**; `cardLabels` (8 label ไทย) + `cardDescriptions`; memo กรองด้วย haystack (id, ลูกค้า, โซน, ที่อยู่, คนขับ) + สถานะ; ปุ่ม "รีเซ็ตออเดอร์" แสดงเมื่อ `role === "admin"` เท่านั้น
* **Deps:** `lucide-react` (`RefreshCw`, `Search`, `Trash2`)

#### 📄 `VehicleInspectionReport.jsx`
* **บทบาท:** workspace รายงานการใช้รถ/ตรวจสภาพ แบบมี tab + CSV export + แก้เลขไมล์ + CRUD ข้อมูลหลักรถและคนขับ
* **Props:** `{apiFetch, role, email = ""}` → `canCorrect = canCorrectVehicleOdometer({role, email})`
* **Flow:** `REPORT_VIEWS` 5 tab (`summary`, `daily`, `monthly`, `fuel`, `master`), `REPORT_VIEW_KEYS` (4 tab ที่กรองวันได้); ช่วงวัน default = ต้นเดือน→วันนี้ (Bangkok); `selectView(key)` reset state + `loadOptions()` (`GET /api/vehicle-master?includeInactive=true` และ `GET /api/driver-master` ขนานกัน); `updateFilter` ทำให้รายงานเดิม invalid → ไม่ยิง request จนกดปุ่ม "แสดงรายงาน"; `loadReport` POST `/api/vehicle-report/query`; `monthly` เป็น memo รวมค่าต่อ `YYYY-MM`; `exportCsv(selectedOnly)` POST `/api/vehicle-report/export` → download blob; `openCorrection` / `saveCorrection` PATCH `/api/vehicle-report/odometer` (ต้องมีเหตุผล, ปุ่มโชว์เมื่อ `canCorrect`); `saveMaster(type)` / `disableMaster` เรียก `/api/vehicle-master` หรือ `/api/driver-master` (DELETE = ปิดใช้งาน ไม่ลบประวัติ); หน้า summary แสดง `dataQuality.ambiguousOrders` / `unallocatedOrders` พร้อมหมายเหตุว่าระบบไม่เดาทะเบียน

#### 📄 `OutstationLabelPrintDialog.jsx`
* **บทบาท:** modal แก้ไข/พรีวิว/พิมพ์ใบปิดกล่อง ครบทั้งผู้ส่ง, ประวัติผู้รับ, จำนวนกล่อง, ขนส่ง/COD และการบันทึกงานพิมพ์แบบ idempotent
* **Props:** `{initialItems = [], initialJobId = "", apiFetch, onClose, onPrinted}` → `isReprint = Boolean(jobId)`
* **Flow:** effect 2 ตัว — `GET /api/outstation-labels/settings` เอา sender default ไปใส่ทุก item, `GET .../recipients?customerId=` โหลดผู้รับที่เคยใช้; `updateCurrent`, `updateSender` (ใส่ทุก item), `applyRecipientToOrder` (ทุกกล่องของออเดอร์นั้น), `updateOrderBoxTotal` (จำกัด 1–10,000, ใช้ `replaceOrderLabelItems`) — **ทุกตัวเคลียร์ `jobId`/`requestKey` เพื่อให้งานที่แก้แล้วถูกสร้างใหม่ ไม่ใช่พิมพ์ซ้ำ**; `saveSenderDefault` (`PUT`), `saveRecipientHistory` (`POST`), `openPreview` (validate sender แล้ว `validateLabelDraft` โดยกระโดดไปใบที่ผิดใบแรก), `printLabels` → POST `/api/outstation-labels/jobs` ด้วย `idempotencyKey: labels-<crypto.randomUUID()>` → `window.print()` → `PATCH` สถานะ `printed` หรือ `reprinted` (เหตุผล `"พิมพ์ซ้ำจากประวัติการพิมพ์"`) → `onPrinted?.(jobId)`; `CARRIERS` 10 รายสำหรับ datalist

#### 📄 `OutstationLabelPreview.jsx`
* **บทบาท:** เลย์เอาต์พรีวิวสำหรับพิมพ์ แบ่ง 4 ใบ/หน้า A4 (server component — ไม่มี `"use client"`)
* **Props:** `{items = [], onEditItem}`
* **Flow:** `paginateLabelItems(items)` → render `.outstation-label-print-page` ต่อหน้า พร้อม `data-page="n/total"`; `LabelItem` สร้าง QR จาก `createOutstationQrPayload(item)` แล้ว render `<OutstationQrCode caption="Add line Hillkoff">`; `SenderBlock` ยุบที่อยู่บรรทัด 2–3 เป็นบรรทัดเดียวคั่น `·`; `RecipientBlock` แสดงหัวข้อ `ผู้รับ` + ชื่อ + ที่อยู่ทุกบรรทัด + เบอร์; footer แสดง `"มีเอกสาร/บิล"` เมื่อ `boxLabel` เริ่มด้วย `"1/"` ไม่งั้นแสดง `item.note`; ปุ่มแก้ไขต่อใบมี class `no-print`

#### 📄 `OutstationQrScannerDialog.jsx`
* **บทบาท:** modal สแกนกล้อง + กรอกมือ บันทึกการส่งมอบกล่อง พร้อมเสียงและการสั่น
* **Props:** `{apiFetch, onClose, onScanned}`
* **Flow:** id ของ element กล้องมาจาก `useId()` ที่กรองเหลือ `[a-zA-Z0-9_-]`; `startCamera` dynamic `import("html5-qrcode")` จำกัดเฉพาะ `QR_CODE` เริ่มด้วย `facingMode: "environment"` + `createOutstationCameraScanConfig(...)`; effect dep ว่าง → **เปิดกล้องครั้งเดียว** (มี eslint-disable อธิบายว่า state ต้องไม่ทำให้ stream restart); `submitPayload(rawValue)` กัน payload ซ้ำภายใน 1400 ms ด้วย `lastPayloadRef` → POST `/api/outstation-dispatch/scan` → `getOutstationScanOutcome(data)` → ข้อความไทย `scannedCount/expectedCount` → `onScanned?.(data.order)`; `playScanFeedback(outcome)` สร้างเสียงด้วย WebAudio (`duplicate` 260/220 Hz, `complete` 660/880 Hz, อื่น ๆ 660 Hz) + `navigator.vibrate`; placeholder ของฟอร์มกรอกมือ = `HKO1|DO-...|1|3`

#### 📄 `OutstationQrCode.jsx`
* **บทบาท:** render QR ของกล่องหนึ่งใบ (เป็น URL ที่สแกนได้) พร้อม caption
* **Props:** `{payload, className = "", caption = ""}`
* **Flow:** effect ตาม `payload` → `createOutstationQrUrl(window.location.origin, payload)` ใน try/catch (fallback เป็น payload ดิบ) → render ด้วย `outstationQrRenderOptions`; ล้มเหลว → แสดงข้อความ `QR: <payload>`; ตั้ง `data-qr-payload` เสมอสำหรับ test/print

#### 📄 `OrderReviewQrCode.jsx`
* **บทบาท:** render QR รีวิวลูกค้าของออเดอร์เดียว
* **Props:** `{orderId, className = ""}`
* **Flow:** คำนวณ `payload` แบบ synchronous ด้วย `createOrderReviewPayload(orderId)` (**id ไม่ถูกต้องจะ throw ตอน render**); effect สร้าง data URL จาก `createOrderReviewUrl(window.location.origin, orderId)` (`errorCorrectionLevel: "H"`, `margin: 3`, `width: 220`) โดยมี flag `active` กัน race; fallback ข้อความ `QR: <payload>`; ตั้ง `data-review-qr-payload`; caption `"ลูกค้าสแกนเพื่อให้คะแนนคนขับ"`

#### 📄 `SalesRoundQueuePanel.jsx`
* **บทบาท:** panel ฝ่ายขายสำหรับส่งออเดอร์รอบเชียงใหม่เข้าคิวคนขับเป็นชุด หลังห้องแพ็คตรวจแล้ว
* **Props:** `{apiFetch, orders = [], onQueued}`
* **Flow:** `groups = useMemo(() => buildChiangmaiRoundGroups(orders))`, `selectedSet` เป็น memoized `Set`; `toggleOrder`, `toggleAllReady(group)` (เลือก/ยกเลิกทั้ง `group.selectableIds`); checkbox **disabled จนกว่า `isReadyOrderWaitingForDispatch(order)` จะเป็นจริง**; `queueSelected(group)` → `window.confirm` → POST `{roundCode, roundDate, selectedIds}` → `/api/orders/chiangmai-rounds/queue`, ต่อ `json.blockingOrderIds` เข้าข้อความ error เมื่อมี → `onQueued?.(ids, json.data)`; `ROUND_LABELS` map `tuesday`/`wednesday`/`friday` เป็นภาษาไทย; แต่ละกลุ่มเป็น `<details>` (กลุ่มแรกเปิด) พร้อม chip `พร้อม ready/total`

---

## 7. Firestore — Collections, Rules, Indexes

### 7.1 Collections (31 ตัว ที่โค้ดอ้างถึงจริง)

| กลุ่ม | Collection | เขียนโดย |
| --- | --- | --- |
| งาน | `orders` (+ subcollection `activity`, `items`, `delivery_reviews`) | `/api/orders/*`, `/api/store/reports`, `/api/outstation-dispatch/scan`, `/api/public/order-review` |
| | `route_tasks` | client (Rules จำกัด: คนขับสร้าง/แก้ของตัวเอง, `stops` ≤ 50) |
| | `booking_month_registry` | `/api/orders/create|workflow|delete`, `/api/store/reports` |
| ลูกค้า | `customers`, `customer_search` | `/api/customers/*`, `/api/orders/create` |
| | `delivery_reviews` (subcollection ของ order) | `/api/public/order-review` |
| ผู้ใช้ | `users`, `users_by_phone` | `/api/auth/*`, `/api/admin/*`, `/api/driver-master` |
| | `login_events`, `login_rate_limits`, `otp_sessions`, `otp_rate_limits` | `/api/auth/*` |
| รถ/คนขับ | `vehicle_master` | `/api/vehicle-master`, `scripts/seed-vehicle-master.mjs` |
| | `vehicle_usage_events`, `vehicle_odometer_audits` | `/api/vehicle-usage/submit`, `/api/vehicle-report/odometer` |
| | `fuel_bills` | `/api/fuel-bills/submit` |
| | `driver_daily_assessments`, `driver_weekly_assessments` | `/api/driver-assessments/submit` |
| | `driver_delivery_sequences` | `/api/orders/resequence` |
| | `driver_locations` | client (Rules: คนขับเขียนได้เฉพาะ doc ตัวเอง + ตรวจพิกัด) |
| ต่างจังหวัด | `outstation_label_settings`, `outstation_recipient_addresses` | `/api/outstation-labels/*` |
| | `outstation_label_jobs` (+ `items`, `events`) | `/api/outstation-labels/jobs` |
| รายงาน | `store_reports` (+ `history`) | `/api/store/reports` |
| | `events`, `activity` | server เท่านั้น |
| ระบบ | `app_settings` (doc `preparation_checkers`) | `/api/preparation/checkers` |
| | `audit_logs` | server เท่านั้น (admin actions, driver/vehicle CRUD, order delete, OTP) |
| | `notifications` | `/api/line/push`, `/api/orders/create` |
| | `push_tokens` | `/api/push/register` (อ่าน+ลบ token เสียโดย route ที่ส่ง FCM) |
| | `line_webhook_events` | `/api/line/webhook` |
| แชท | `chat_messages`, `chat_meta` | client (Rules ตรวจ sender ตรงกับโปรไฟล์) |

### 7.2 `firestore.rules` — 183 บรรทัด

**Helper functions:** `signedIn`, `hasProfile`/`profile` (อ่าน `users/{uid}`), `role`, `driverId`, `hasCurrentPhoneSession` (driver/sales ต้องตรงกับ `users_by_phone/{phoneDigits}.uidLast`), `activeProfile` (ไม่ `active: false` และ status ไม่ใช่ `disabled`/`rejected`), `hasRole(roles)`

| Match | Read | Write |
| --- | --- | --- |
| `/orders/{orderId}` | sales/admin/store/pack, หรือคนขับที่ `driverId`/`lastDeliveryDriverId` ตรง, หรือออเดอร์ว่างที่ `queueStatus == "queued"` | **update เท่านั้น** ผ่าน `salesOrderUpdate()` (sales/admin, key จำกัดที่ driverId, driverName, status, updatedAt) หรือ `driverOrderUpdate()` (driver, allowlist ~15 key, ต้องเป็นเจ้าของหรือรับงานว่าง, `driverId` ผลลัพธ์ ∈ [ตัวเอง, ""], `status` เป็น string ≤ 40 ตัว) — **create/delete ปิด** |
| `/orders/{orderId}/activity/{id}` | ปิดทั้งหมด | ปิดทั้งหมด |
| `/customers/{customerId}` | sales/admin | **ปิด** (server-only) |
| `/driver_locations/{locationId}` | sales/admin หรือคนขับที่ `locationId == driverId()` | create/update: คนขับเท่านั้น, doc id และ `driverId` ต้องเป็นของตัวเอง, `lat` ∈ [-90,90], `lng` ∈ [-180,180]; delete ปิด |
| `/route_tasks/{taskId}` | sales/admin หรือคนขับเจ้าของ | create: คนขับ, `driverId` ตัวเอง, `stops` ≤ 50; update: เจ้าของ, key จำกัด status/note/stops/completedAt/updatedAt; delete ปิด |
| `/chat_messages/{messageId}` | sales/admin/driver/store/pack | create: role เดียวกัน + key set ตรงเป๊ะ + `sender_role`/`sender_name`/`sender_phone` **ต้องตรงกับโปรไฟล์** + `type ∈ ["chat","emergency"]` + ข้อความ 1–2000 ตัว; update/delete ปิด |
| `/chat_meta/{metaId}` | sales/admin/driver/store/pack | create: เฉพาะ `metaId == "team"`, `activeProfile()`, key set ตรงเป๊ะ, `messageCount == 1`, text ≤ 160; update: `messageCount == resource.messageCount + 1`; delete ปิด |
| `/users/{uid}` | ปิด | ปิด (Admin SDK เท่านั้น) |
| `/users_by_phone/{phone}` | ปิด | ปิด |
| `/{document=**}` | ปิด | ปิด (catch-all) |

### 7.3 `firestore.indexes.json` — 6 composite indexes

```
orders:        driverId ASC,             updatedAt DESC
orders:        channel ASC,              updated_at DESC     ⚠️ snake_case
orders:        status ASC,               updated_at DESC     ⚠️ snake_case
orders:        customerPhoneDigits ASC,  updatedAt DESC
route_tasks:   driverId ASC,             updatedAt DESC
store_reports: type ASC,                 createdAt DESC
```

---

## 8. `scripts/` — Migration, Backfill, Seed, Audit

#### 📄 `scripts/backfill-firebase-integrity.mjs` — **dry-run เป็นค่าเริ่มต้น**
* **บทบาท:** ซ่อมความสมบูรณ์ข้อมูลหลายคอลเลกชัน (customers, orders, user mirrors)
* **Flow:** `--apply` คุมทุกอย่าง — `queueWrite()` สะสม, `flush()` return ทันทีถ้าไม่มี `applyChanges` ไม่งั้น commit ทีละ 400 doc; customers: ซ่อม `phoneDigits`/`nameKey` + doc `customer_search`; orders: derive `customerPhoneDigits` และ `serviceDate` จาก `createdAt`/`updatedAt` ด้วย `Intl.DateTimeFormat` Bangkok; users: mirror `users_by_phone` (driver/sales) ไป `users/{uid}` ผ่าน `publicProfile()` แล้ว normalize ค่า default (`uid`, `uidLast`, `phoneDigits`, `status`, `active`)
* **Output:** `{mode: "applied" | "dry-run", counters}`

#### 📄 `scripts/seed-vehicle-master.mjs` — **dry-run เป็นค่าเริ่มต้น**
* **บทบาท:** seed `vehicle_master` จาก static list
* **Flow:** log `{collection, proposed, apply}` ก่อน; ไม่มี `--apply` → พิมพ์ "Dry run only. Pass --apply after backup and authorization." แล้วออก; มี `--apply` → merge-write ทุก `HILLKOFF_VEHICLES` โดย **คง `createdAt`/`createdBy`/`seededAt` เดิม** + `updatedBy: "migration:seed-vehicle-master"` + `audit_logs` `vehicle_master_seeded` (`mergeOnly: true, deleted: 0`); **ไม่ลบรถ**

#### 📄 `scripts/migrate-driver-logins.mjs` — **audit เป็นค่าเริ่มต้น**
* **บทบาท:** ตรวจ/ย้ายบัญชีคนขับจาก PIN ไปเป็น username + password
* **Flow:** อ่าน `drivers`, `users_by_phone`, `login_rate_limits` + collection ประวัติ (`orders`, `route_tasks`, `driver_assessments`, `vehicle_usage`, `fuel_bills`, `driver_locations`) เพื่อกู้ชื่อคนขับจริง (`historicalNames`); จัดกลุ่มเป็น `ready` / `missing_phone` / `missing_account` / `missing_password` แล้ว `console.table` (เบอร์แบบ mask); `--apply` → batch เขียน `users_by_phone/{phone}` + `drivers/{driverId}` + `users/{uid}` ตั้ง `loginMethod: "username_password"`, `authProvider: "password"`, copy `pinHash` → `passwordHash`, `FieldValue.delete()` ทิ้ง `pinHash`/`pinSalt`/`pinHashVersion`; `--clear-locks` ลบทุก doc ใน `login_rate_limits`

#### 📄 `scripts/backfill-customer-phone-digits.mjs` — ⚠️ **เขียนทันที ไม่มี dry-run**
* **บทบาท:** เติม `customerPhoneDigits` บนออเดอร์ และสร้าง index `customer_search` ใหม่
* **Flow:** อ่าน `orders`, `customers`, `customer_search` ทั้งหมด; `enqueue()` สะสม merge-write และ auto-commit ทุก 400; ต่อออเดอร์: derive digits จาก `customerPhone` เขียนเมื่อยังไม่มี, เก็บลูกค้าเก่าเป็น `legacy-<docId>` ผ่าน `mergeLegacyCustomer`; index ลูกค้าจริง → ลูกค้า legacy → normalize doc index ที่ไร้เจ้าของ; `indexMatches`/`sameArray` ข้ามงานที่ไม่มีอะไรเปลี่ยน

#### 📄 `scripts/audit-vehicle-report.mjs` — **read-only 100%**
* **บทบาท:** dump ผลการรวมรายงานรถเพื่อตรวจคุณภาพข้อมูล
* **Flow:** `read(name, limit = 5000)` ดึงขนานกันจาก `vehicle_usage_events`, `fuel_bills`, `driver_daily_assessments`, `orders`; เลือก 3 `serviceDate` (แรก/กลาง/ท้าย) รัน `buildVehicleReport` ต่อวัน + อีกรอบทั้งช่วง; พิมพ์ JSON `{readOnly: true, counts, dateRange, dataQuality, samples}` — **ไม่มี flag ไม่มีการเขียน**

#### 📄 `scripts/backfillVehicleUsageToSheet.cjs` — มี `--dry-run`
* **บทบาท:** push `vehicle_usage_events` ขึ้น Apps Script sheet
* **Flow:** CommonJS; ตรวจ `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_MILEAGE_WEB_APP_URL`/`GOOGLE_SHEETS_WEB_APP_URL`, `GOOGLE_SHEETS_SHARED_SECRET` (URL/secret จำเป็นเฉพาะเมื่อไม่ใช่ dry-run); `shouldProcess()` เลือก doc ที่ sync status ว่าง/pending/failed/skipped; `--limit N` จำกัดจำนวน; `buildPayload()` → `postToSheet()` (POST text/plain, `AbortSignal.timeout` 8s) → สำเร็จตั้ง `googleSyncStatus: "synced"`, ล้มเหลวตั้ง `"failed"` + `googleSyncError` ที่ตัดสั้น; `--dry-run` แค่ log `[dry]`; **exit 1 ถ้ามีตัวใดล้มเหลว**

---

## 9. `tests/`

### 📄 `tests/firestore.rules.test.js` — `describe("Firestore role isolation")`, 11 scenario บน Emulator

1. ผู้ใช้ที่ authenticated แต่ไม่มีโปรไฟล์ที่อนุมัติ → ถูกปฏิเสธ
2. sales อ่านข้อมูล operations ได้ แต่เขียน `customers` ไม่ได้ (server-only)
3. accounting เป็น report-only — อ่าน operational data ตรง ๆ ถูกปฏิเสธ
4. มีเพียงคนขับที่ถูกมอบหมายเท่านั้นที่อ่านออเดอร์นั้นได้
5. คนขับที่ส่งรอบก่อนอ่านออเดอร์ที่รีวิวยังไม่สมบูรณ์ได้
6. คนขับรับงานที่เข้าคิวได้ แต่งานเตรียมของที่ซ่อนไว้ถูกบล็อก
7. คนขับเปลี่ยน field ที่ป้องกันไว้ไม่ได้
8. คนขับเขียน `driver_locations` ได้เฉพาะ doc ของตัวเองที่ผ่าน validation
9. กันการปลอมตัวผู้ส่งในแชท
10. session เบอร์เก่าถูกเพิกถอนเมื่อ UID ใหม่กลายเป็น `users_by_phone.uidLast`

### 📄 `tests/unit/` — 20 ไฟล์ (Vitest)

| ไฟล์ | ทดสอบอะไร |
| --- | --- |
| `accountingAuth.test.js` | accounting ต้องผ่านทั้ง domain Hillkoff และ allowlist |
| `chiangmaiRounds.test.js` | หา อ./พ./ศ. รอบถัดไป, กฎรอบเดียวที่ใช้ได้, รอบว่างยังเป็นงานปกติ, การจัดกลุ่ม |
| `core.test.js` | workflow เตรียมของ/จัดคิวของฝ่ายขาย, routing rework (store vs direct pack), driver note, รายงานใบสั่งจอง, `authenticatedFetch` retry token, `recentOrdersLimit` มีเพดาน |
| `dashboardLayout.test.js` | สแกน source ยืนยันว่าการ์ดสรุป 5 ช่องแบบเก่าไม่เหลืออยู่หน้าใด |
| `dispatchDashboard.test.js` | กรองตามวันที่สร้าง, 8 cards + driver loads, ออเดอร์ต่างจังหวัดหลุดจากคิวเมื่อ pack-ready, การ์ดเชียงใหม่นับเฉพาะรถบริษัท, ขอบเขต read plan |
| `operationsComponents.test.jsx` | SSR ของ `DispatchDashboard` และ `VehicleInspectionReport`, label การ์ดวันนี้ vs วันก่อน |
| `operationsReporting.test.js` | วันทำการแบบ Bangkok, 3 การ์ด dispatch, ตัด Grab/pickup, ไม่เดารถเมื่อวันนั้นมีหลายคัน, read ถูกจำกัดตามช่วงวัน |
| `orderReview.test.js` | payload/URL ของ QR รีวิวที่มี version, เงื่อนไขรีวิวได้, normalize rating 1–5, aggregation รีวิวล่าสุดต่อออเดอร์ |
| `orderReviewQr.test.jsx` | `OrderReviewQrCode` render payload ที่ผูกกับออเดอร์เดียว |
| `orderReviewRoute.test.js` | API รีวิวสาธารณะ GET/POST: ไม่หลุดข้อมูลลูกค้า, ปฏิเสธก่อนส่งของ, mirror รีวิวล่าสุด, รีวิวที่แก้แล้วแทนของเดิม |
| `outstationDispatch.test.js` | QR options/PNG ที่พิมพ์ได้, payload มี version + กล่อง, parse URL สาธารณะ, ยอดกล่องจากการสแกนครั้งแรก, ปฏิเสธซ้ำ/ยอดไม่ตรง, สถานะ feedback |
| `outstationLabelPreview.test.jsx` | 4 ใบ/หน้า A4, บรรทัดผู้รับชิดขวา, ตำแหน่ง tracking/COD, หมายเหตุเอกสารบนกล่องแรก, caption QR, scanner dialog, ปุ่มแก้ไข, ชื่อผู้รับใน selector |
| `outstationLabelStorage.test.js` | normalize ผู้ส่ง, customer key ปลอดภัย + snapshot ที่อยู่, ปฏิเสธ `boxLabel` ไม่สอดคล้อง/ผู้ส่งขาด, งานพิมพ์ไม่แตะ field workflow, allowlist ของ status patch, doc id จาก idempotency key |
| `outstationLabels.test.js` | ผู้ส่ง default 3 บรรทัด, 1 ใบต่อกล่อง (ไม่จำกัด 5 กล่อง), แบ่ง 4 ใบ/หน้า, rebuild เฉพาะออเดอร์นั้น, COD + tracking เมล์เขียว `BU003931`, รายงาน field ที่ขาด |
| `outstationQrRoute.test.js` | URL QR ที่ถูกต้อง redirect ไป LINE@, ที่ไม่ถูกต้องไม่ redirect |
| `salesRoundQueuePanel.test.jsx` | panel แสดงออเดอร์ที่มีรอบเป็น sublist ที่กางได้ และไม่รวมออเดอร์ปกติ |
| `vehicleOdometerCorrection.test.js` | เฉพาะ admin + อีเมล accounting ที่อนุมัติ, patch มีขอบเขต + audit record, ปฏิเสธค่าผิด/เหตุผลว่าง/end ต่ำกว่า start |
| `vehicleReport.test.js` | สรุประยะ/น้ำมัน/การตรวจ/โซนรายวัน, ออเดอร์กำกวมไม่ถูกผูก, งานที่ยัง active/ยกเลิกไม่นับว่าส่งสำเร็จ |
| `vehicleReportCsv.test.js` | CSV มี UTF-8 BOM และ neutralize สูตร spreadsheet |
| `vehicleRepository.test.js` | เลือกรถ active จาก Firestore ก่อน, fallback ไป static master เมื่อว่าง |

---

## 10. Config, Public Assets, Google Apps Script

### 10.1 Config

| ไฟล์ | สาระ |
| --- | --- |
| `package.json` | `type: module`, `engines.node: 22.x`; scripts `dev`/`build`/`start`, `lint` (`eslint . --max-warnings=0`), `test` (`vitest run tests/unit`), `test:rules` (emulator), `check` (lint→test→build), `customers:backfill-search`, `firebase:backfill-integrity`, `firebase:migrate-driver-logins`, `backup`/`backup:list`/`backup:restore`; deps `next 16.2.10`, `react 19.2.7`, `firebase 12.16.0`, `firebase-admin 13.6.0`, `nodemailer 9.0.3`, `qrcode`, `html5-qrcode`, `lucide-react`; `overrides` ตรึง `postcss 8.5.19` และ `uuid 11.1.1` ใน gaxios/google-gax/teeny-request |
| `next.config.mjs` | `const nextConfig = {}` — ไม่มี config พิเศษ (React Compiler ไม่ได้เปิด) |
| `jsconfig.json` | มีแค่ `baseUrl: "."` — **ไม่มี path alias** จึงใช้ relative import (`../../lib/...`) ทั้งโปรเจกต์ |
| `eslint.config.mjs` | flat config spread `eslint-config-next/core-web-vitals`; สำหรับ `app/**/*.{js,jsx}` ปิด `@next/next/no-img-element` + `react-hooks/*` 5 ข้อ (`set-state-in-effect`, `immutability`, `preserve-manual-memoization`, `purity`, `refs`) — comment ระบุว่าโผล่มาหลังตัด hooks ใน `app/page.jsx`; `globalIgnores`: `.next`, `out`, `build`, `node_modules`, `repo`, `repo.worktrees`, `google-apps-script` |
| `firebase.json` | Firestore เท่านั้น (rules + indexes); emulator Firestore port `8080`, UI ปิด, `singleProjectMode` — **ไม่มี hosting** |
| `.firebaserc` | default project `hillkoff-delivery` |
| `.gitignore` | `.next`, `node_modules`, `.env.local`, `out`, `.vercel`, `next-dev*.log`, `firestore-debug.log`, `firebase-debug.log`, `ui-debug.log`, `backups/` |
| `.env.example` | Firebase client 7 ตัว + `FIREBASE_SERVICE_ACCOUNT_JSON` · OTP/RBAC (`OTP_DEV_MODE`, `OTP_SECRET`, `ADMIN_EMAIL_ALLOWLIST`, `ACCOUNTING_EMAIL_ALLOWLIST`) · Apps Script (`GOOGLE_MILEAGE_WEB_APP_URL`, `GOOGLE_DAILY_DELIVERY_WEB_APP_URL`, `GOOGLE_SHEETS_WEB_APP_URL`, `GOOGLE_SHEETS_SHARED_SECRET`) · SMTP 6 ตัว · LINE 3 ตัว · Backup 3 ตัว |
| `deploy.bat` | ⚠️ git push แบบ one-shot บน Windows — `cd` ไปโฟลเดอร์ `repo` (ไม่ใช่ root), commit message hardcode ที่ยังพูดถึง Supabase |
| `git_status.js` | script ชั่วคราวใช้ `execSync` พิมพ์ `git log --oneline -10`, `git status --short`, `git diff --cached --stat` |

### 10.2 `public/`

| ไฟล์ | สาระ |
| --- | --- |
| `firebase-messaging-sw.js` | Service worker รับ push ตอนแอปปิด — config hardcode (project `hillkoff-delivery`, sender `396283391154`), `importScripts` firebase 10.12.5 `app-compat` + `messaging-compat`, **ห่อ try/catch ทั้งไฟล์เพื่อให้ SW ไม่พังตอน evaluate**; `onBackgroundMessage` แสดง notification (title default `"มีออเดอร์ใหม่"`, icon/badge `/icon-192.png`, `tag: new-order-<orderId>`, `renotify`, `requireInteraction`); `notificationclick` โฟกัสหน้าต่างเดิม ไม่มีก็ `clients.openWindow("/")` |
| `manifest.webmanifest` | PWA — `start_url`/`scope` `/`, `display standalone`, `orientation portrait`, `background_color #f7f8f3`, `theme_color #17351f`, icons 192/512 `purpose "any maskable"` |
| `delivery-logo.svg` | โลโก้รถส่งของ 512×512 (bg `#17351F`, ล้อ `#F7C948`, กล่อง `#EEF5EA`) — ใช้เป็น favicon และในหน้า `/track` |
| `icon-192.png` · `icon-512.png` · `apple-touch-icon.png` | icon PWA/home screen |

### 10.3 `google-apps-script/` (เป็น project แยก, ถูก ESLint ignore)

#### 📄 `Code.gs` — 1,786 บรรทัด
* **บทบาท:** Web App backend + ตัวสร้าง Spreadsheet ของ `Hillkoff Vehicle Usage System` (sheets: Vehicles, Daily Usage, Usage Segments, Fuel Bills, Daily/Monthly Summary, Dashboard, Sync Logs; spreadsheet id เก็บใน property `HILLKOFF_VEHICLE_USAGE_SPREADSHEET_ID`)
* **`doPost` actions** — ทุกตัวผ่าน `requireSharedSecret` (property `HILLKOFF_SYNC_SHARED_SECRET`) ภายใต้ `LockService` 30 วินาที: `setupDeliveryWorkbook`, `upsertDailyDeliveryOrder`, `upsertDailyMileage`, `appendFuelBill`, `appendUsageSegment`, `replaceUsageSegments`, `createBackup`, `setup`; action ไม่รู้จัก → throw; ทุกครั้งเขียน `logSync(ss, action, OK|FAILED, ...)` แล้ว `ensureSummarySheets`
* **`doGet`** — serve dashboard HTML (`include("Styles")`/`Index`); `serveSetupJson` มีอยู่แต่ setup ผ่าน GET สาธารณะถูกปิด
* **Client-callable:** `getWebDashboardData(filters)`, `refreshWebSummaries`, `saveDashboardFuelBill`, `saveDashboardUsageSegment`, `createDailyBackupFromMenu`, `getLastBackupInfo`, `installDailyBackupTrigger`
* **ชั้น aggregation:** `buildDaily/MonthlyVehicleSummary`, `buildDashboardSummary`, `summarizeWebRows/Period`, `buildWebKpis/Alerts/Rankings`, `rankFuelByVehicle`, `buildSystemHealth`, `buildDataQuality` + `map*Row` adapters; `getBangkokDateKey`/`normalizeServiceDate` คุมวันที่เป็น Asia/Bangkok; ฝั่งใบส่งของมี `ensureDeliveryDaySheet`, `findDeliveryOrderRow`, `deliveryStatusColor`, `deliveryOverallStatus`, `displayMissingItems`; validators `validateDailyMileagePayload`/`validateUsageSegmentPayload`/`validateFuelBillPayload`; `onOpen` ติดตั้งเมนูใน Sheets

#### 📄 `Index.html` (330 บรรทัด) · `ClientScript.html` (1,096) · `Styles.html` (671) · `appsscript.json` · `README.md`
* `Index.html` — shell ของ dashboard: `<base target="_top">`, Chart.js 4.4.7 จาก jsDelivr, topbar ไทย "Vehicle Control Dashboard" พร้อม `#updatedAt`/`#workflowStatus`/`#sheetLink`
* `ClientScript.html` — ตรรกะฝั่ง browser เรียก `google.script.run`: `refreshDashboard` → `renderAll` → `renderKpis`, `renderOverviewCharts`/`createChart`/`chartOptions`/`horizontalBarConfig`, `buildPeriodAnalytics`/`buildVehicleAnalytics`/`buildDataQualityRows`, `renderAlerts(Table)`, `renderRankings`, `populateTableFilters`/`clearUsage|FuelFilters`, `renderUsage|FuelTable`, `renderReports`/`renderReportSummaryCards`, `renderSystemHealth`, `createBackupNow`, `exportCsv`/`exportSelectedCsv`/`buildCsvReport`, `copyLineSummary`
* `Styles.html` — CSS ของ dashboard (แยกจาก `app/globals.css` ไม่เกี่ยวกัน)
* `appsscript.json` — `timeZone Asia/Bangkok`, `runtimeVersion V8`, scopes `script.external_request`, `spreadsheets`, `drive`
* `README.md` — runbook: paste `Code.gs` → รัน `doGet` เพื่อ authorize → Deploy > Web app (Execute as Me, Anyone with link) → ตั้ง `HILLKOFF_SYNC_SHARED_SECRET` → ตั้ง `GOOGLE_MILEAGE_WEB_APP_URL` + `GOOGLE_SHEETS_SHARED_SECRET` ใน Next.js; อธิบาย `upsertDailyMileage` (upsert key `serviceDate + vehicleId + driverId`), `appendFuelBill` (dedupe บน `id`), `appendUsageSegment`

---

## 11. หนี้ทางเทคนิคและจุดที่ควรระวัง

รายการที่พบจากการสแกนโค้ดรอบนี้ (ยังไม่ได้แก้ — บันทึกไว้เพื่อไม่ให้หลุด)

| # | จุด | รายละเอียด |
| --- | --- | --- |
| 3 | `firestore.indexes.json` | 2 index ของ `orders` ใช้ `updated_at` (snake_case) ขณะที่อีก 2 ตัวใช้ `updatedAt` — สงสัยว่าเป็นของเหลือจากยุค Supabase, index ที่ผิดชื่อจะไม่ถูกใช้เลย |
| 7 | `supabase-setup.sql` · `SUPABASE_SETUP.md` | เหลือจากยุค Supabase ไม่มีโค้ดอ้างถึงแล้ว |
| 8 | `app/page.jsx` 7,469 บรรทัด | `useState` 158 ตัวในไฟล์เดียว และ `eslint.config.mjs` ต้องปิด `react-hooks/*` 5 ข้อเพื่อให้ lint ผ่าน — ตัวเลือกในการแตกไฟล์คือแยกตาม role workspace |
| 10 | `google-apps-script/README.md` | ส่วน "Supported Actions" ตกหล่น action `setupDeliveryWorkbook`, `upsertDailyDeliveryOrder`, `replaceUsageSegments`, `createBackup` ที่ `Code.gs` รองรับอยู่ |

---

## 12. Cheat sheet — จะแก้อะไร ให้เปิดไฟล์ไหน

| อยากแก้ | ไฟล์ |
| --- | --- |
| เพิ่ม/แก้สถานะ workflow ของสโตร์-แพ็ค | `lib/preparationWorkflow.js` → `app/api/orders/workflow/route.js` |
| เปลี่ยนสิทธิ์ของ role | `lib/workflowAuth.js` (API) + `firestore.rules` (client read) |
| เพิ่ม KPI card ในหน้า dispatch | `lib/dispatchDashboard.js` (`buildDispatchDashboard`) + `app/components/DispatchDashboard.jsx` (`cardLabels`) |
| แก้เลย์เอาต์ใบปิดกล่อง | `lib/outstationLabels.js` (model) + `app/components/OutstationLabelPreview.jsx` + `@media print` ใน `globals.css` |
| เปลี่ยนวันรอบส่งเชียงใหม่ | `lib/preparationWorkflow.js` → `CHIANGMAI_ROUND_CODES`, `resolveNextRoundDate` |
| เพิ่มคอลัมน์ในรายงานรถ | `lib/vehicleReport.js` (row) + `lib/vehicleReportCsv.js` (`HEADERS`) + `VehicleInspectionReport.jsx` |
| เพิ่มรถ/เปลี่ยนผู้รับผิดชอบ | `vehicle_master` ผ่าน UI (tab `master`) — `lib/vehicleMaster.js` เป็น fallback เท่านั้น |
| แก้ข้อความ/ขั้นตอน SOP คนขับ | constants ต้นไฟล์ `app/page.jsx` (`DRIVER_*`) |
| เปลี่ยนเพดานจำนวน read | `lib/firestoreReadPolicy.js` |
| เพิ่ม action ของ Google Sheet | `google-apps-script/Code.gs` (`doPost`) + `lib/googleAppsScript.js` / `lib/deliverySheetSync.js` |
| เปลี่ยนข้อความที่ลูกค้าเห็นตอน track | `app/api/public/track/route.js` (`serializeOrder`, `publicStatus`, `maskCustomerName`) |

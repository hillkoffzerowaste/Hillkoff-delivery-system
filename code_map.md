# 🗺️ SYSTEM CODE MAP

## 🏢 1. Folder Structure (ภาพรวมโครงสร้าง)
```text
.
├── app/                         # Next.js App Router: UI + API routes
│   ├── page.jsx                 # [ENTRY POINT] Main client app, state, Firestore realtime, UI tabs
│   ├── layout.jsx               # [APP SHELL] Metadata, PWA manifest, root HTML
│   ├── globals.css              # Global responsive dashboard styles
│   └── api/                     # [SERVER ROUTERS] Next.js route handlers
│       ├── admin/reset-orders/
│       ├── auth/login/
│       ├── auth/validate/
│       ├── backup/
│       ├── chat/gemini/
│       ├── driver-assessments/today/
│       ├── google/
│       ├── orders/create/
│       ├── push/register/
│       └── sync.js
├── lib/                         # Shared server/client adapters and backup modules
│   ├── firebaseAdmin.js         # Firebase Admin singleton
│   ├── firebaseClient.js        # Firebase browser SDK wrapper
│   ├── supabaseServer.js        # Supabase service-role client
│   ├── backup/                  # Supabase snapshot backup/restore flow
│   └── utils/backupUtils.js
├── public/                      # PWA icons, manifest, Firebase messaging SW
├── *.md                         # Project docs and operations notes
├── package.json                 # npm scripts + dependencies
├── supabase-setup.sql           # Legacy/current Supabase schema bootstrap
└── deploy.bat / git_status.js   # Local Git helper scripts
```

## 📝 2. File-by-File Breakdown (รายละเอียดแต่ละไฟล์)

### 📄 `.env.example`
* **Role:** Environment template for Firebase public config, Firebase Admin service account, and legacy login PIN values.
* **Key Components & Flow:**
  - `NEXT_PUBLIC_FIREBASE_*` -> used by `lib/firebaseClient.js` -> initializes browser Firebase Auth/Firestore/Messaging.
  - `FIREBASE_SERVICE_ACCOUNT_JSON` -> used by `lib/firebaseAdmin.js` -> enables server-side Auth/Firestore access.
* **Dependencies:** Read by Next.js runtime; copied to `.env.local` for real secrets.

### 📄 `.gitignore`
* **Role:** Git ignore rules for generated/runtime artifacts.
* **Key Components & Flow:**
  - `.next`, `node_modules`, `.env.local`, `out`, `.vercel` -> excluded from source control.
* **Dependencies:** Git only.

### 📄 `package.json`
* **Role:** Project manifest for Next.js app and dependency graph.
* **Key Components & Flow:**
  - `dev/build/start` -> run Next.js lifecycle.
  - `backup:*` -> references `lib/backup/cli.js`, but that file is not present in current tracked tree.
* **Dependencies:** Next.js, React, Firebase, Firebase Admin, Supabase JS, Gemini SDK, Lucide icons.

### 📄 `package-lock.json`
* **Role:** npm dependency lockfile.
* **Key Components & Flow:**
  - Locks exact versions resolved from `package.json`.
* **Dependencies:** npm install/build pipeline.

### 📄 `next.config.mjs`
* **Role:** Next.js config placeholder.
* **Key Components & Flow:**
  - `nextConfig = {}` -> no custom config currently applied.
* **Dependencies:** Next.js build/runtime.

### 📄 `jsconfig.json`
* **Role:** JS path resolution config.
* **Key Components & Flow:**
  - `baseUrl: "."` -> enables imports like `@/lib/...` from project root.
* **Dependencies:** Next.js compiler, editor tooling.

### 📄 `app/layout.jsx`
* **Role:** [APP SHELL] Root layout and metadata for PWA install behavior.
* **Key Components & Flow:**
  - `metadata` -> registers title, description, manifest, icons -> consumed by Next.js head generation.
  - `RootLayout` -> renders `<html lang="th"><body>{children}</body></html>` -> wraps `app/page.jsx`.
* **Dependencies:** Imports `app/globals.css`; references files in `public/`.

### 📄 `app/globals.css`
* **Role:** Global dashboard styling and responsive layout rules.
* **Key Components & Flow:**
  - `.sidebar`, `.workspace`, `.stats`, `.sales-grid`, `.driver-grid`, `.dispatch-grid`, `.report-grid` -> layout system for all tabs.
  - `@media max-width 1080/720` -> mobile collapse for nav, grids, forms, tables.
* **Dependencies:** Class names rendered mainly by `app/page.jsx`.

### 📄 `app/page.jsx`
* **Role:** [CLIENT ENTRY POINT] Main React application containing login, sales, dispatch, driver, driver SOP checklist/reporting, reports, settings, chat, AI assistant, and Firestore sync.
* **Key Components & Flow:**
  - `defaultState/readState` -> initializes auth/state from `localStorage` -> feeds `App` state.
  - `App` -> controls `displayTab` (`sales|dispatch|driver|reports|settings`) -> renders role-specific dashboards.
  - Firestore realtime `useEffect` -> subscribes to `orders`, `customers`, `driver_locations`, `chat_messages`, `chat_meta`, `typing_status`, `login_events` conditionally by active tab -> updates local React state.
  - `pinLogin/loginSales/loginDriver/logout` -> Firebase anonymous auth + `/api/auth/login` -> persists `hillkoff_auth` and sets role routing.
  - `createOrder/confirmOrder` -> builds order id/date/customer fields -> calls `/api/orders/create` -> server writes Firestore and sends FCM.
  - `updateOrder/assignDriver/deleteOrder/uploadPod` -> writes order status/assignment/proof fields directly to Firestore -> affects sales, dispatch, driver views.
  - `driver-sop` tab + `submitDriverDailyAssessment` -> shows morning notice, daily/weekly vehicle SOP, care basics, requires daily checks, writes `driver_daily_assessments/{driverId}_{serviceDate}`.
  - `driver-sop-report` tab + `exportDriverAssessmentReport` -> sales view for completed/missing driver assessments -> calls `/api/driver-assessments/today` and exports TXT/copy report.
  - `ensureWebPushForDriver/requestNotifyPermission` -> registers `firebase-messaging-sw.js`, gets FCM token -> calls `/api/push/register`.
  - `sendChat/sendEmergency/updateTyping/updateChatSummary` -> writes team chat and typing state to Firestore -> chat modal and badge update.
  - `sendToGemini/buildAiClientSummary/refreshAuthToken` -> streams `/api/chat/gemini` SSE -> sales-only AI summary panel.
  - `generateDailyReport/buildServiceDateReport/exportServiceDateReport` -> derives reports from local `orders` -> copy/download text output.
* **Dependencies:** Imports `lib/firebaseClient.js`, Lucide icons, calls API routes under `app/api/*`, reads/writes browser `localStorage`, writes Firestore `driver_daily_assessments`, uses OpenStreetMap URLs.

### 📄 `app/api/driver-assessments/today/route.js`
* **Role:** [API ROUTE] Sales-only report source for today's driver vehicle assessments.
* **Key Components & Flow:**
  - `POST` -> verifies Firebase `idToken`, checks `users_by_phone` role is sales -> returns driver roster and today's `driver_daily_assessments`.
  - `toServiceDateKey` -> normalizes Bangkok service date -> scopes assessment report to one day.
* **Dependencies:** `lib/firebaseAdmin.js`, Firestore `users_by_phone`, `driver_daily_assessments`; called by `driver-sop-report`.

### 📄 `app/api/auth/login/route.js`
* **Role:** [API ROUTE] Server-side login/PIN gate for sales and driver users.
* **Key Components & Flow:**
  - `POST` -> verifies Firebase `idToken` -> reads/writes `users_by_phone/{phone}` -> returns normalized auth profile.
  - `sha256Hex/normalizePhoneDigits` -> validates PIN and trusted devices -> controls `PIN_REQUIRED`, `PIN_NOT_SET`, `INVALID_PIN`.
* **Dependencies:** `lib/firebaseAdmin.js`, Node `crypto`, Firestore collections `users_by_phone`, `login_events`.

### 📄 `app/api/auth/validate/route.js`
* **Role:** [API ROUTE] Firebase ID token validation endpoint.
* **Key Components & Flow:**
  - `POST` -> verifies `idToken` -> reads `users/{uid}` -> returns `valid`, role, name, driverId.
* **Dependencies:** `lib/firebaseAdmin.js`, Firestore `users`.

### 📄 `app/api/admin/reset-orders/route.js`
* **Role:** [API ROUTE] Admin-only dashboard reset for Firestore orders.
* **Key Components & Flow:**
  - `POST` -> checks admin reset password -> loops `deleteCollectionBatch`.
  - `deleteCollectionBatch` -> deletes Firestore `orders` in batches of 300 -> returns deleted count.
* **Dependencies:** `lib/firebaseAdmin.js`, Firestore `orders`; called by Settings/Admin UI in `app/page.jsx`.

### 📄 `app/api/orders/create/route.js`
* **Role:** [API ROUTE] Server-side order creation and driver push notification.
* **Key Components & Flow:**
  - `POST` -> verifies Firebase `idToken` -> sanitizes `order` payload -> writes `orders/{id}`.
  - FCM block -> reads `push_tokens` where `role=driver` -> sends multicast data notification -> deletes stale tokens.
* **Dependencies:** `lib/firebaseAdmin.js`, `firebase-admin/messaging`, Firestore `orders`, `push_tokens`; called by `createOrder/confirmOrder`.

### 📄 `app/api/push/register/route.js`
* **Role:** [API ROUTE] Stores browser FCM tokens for future notifications.
* **Key Components & Flow:**
  - `POST` -> validates token, role, phoneDigits -> upserts `push_tokens/{token}` with device metadata.
* **Dependencies:** `lib/firebaseAdmin.js`, Firestore `push_tokens`; called by `ensureWebPushForDriver`.

### 📄 `app/api/chat/gemini/route.js`
* **Role:** [API ROUTE] Sales-only Gemini streaming assistant with aggregated Firestore order context.
* **Key Components & Flow:**
  - `POST` -> verifies Firebase token + `users_by_phone` role/uid -> enforces sales-only RBAC.
  - `sanitizeClientSummary/getFirestoreAggregateSummary` -> uses client summary or reads recent `orders` by `serviceDate` -> minimizes Firestore reads.
  - Gemini stream -> sends SSE `meta`, `delta`, `done` events -> consumed by `sendToGemini`.
  - `buildBasicChatbotAnswer` -> quota fallback response from aggregate stats.
* **Dependencies:** `@google/generative-ai`, `lib/firebaseAdmin.js`, env `GEMINI_API_KEY`, Firestore `users_by_phone`, `orders`.

### 📄 `app/api/google/route.js`
* **Role:** [API ROUTE] Generic proxy to Google Apps Script web app URL.
* **Key Components & Flow:**
  - `GET` -> proxies `?url=` to remote Apps Script.
  - `POST` -> extracts `webAppUrl`, sends remaining JSON as `text/plain` -> avoids browser CORS.
* **Dependencies:** Native `fetch`; legacy integration from `app/page.jsx`/old docs.

### 📄 `app/api/sync.js`
* **Role:** [API ROUTE] Legacy Google Apps Script sync proxy.
* **Key Components & Flow:**
  - `POST` -> form-encodes `customers/orders/drivers` -> posts to `webAppUrl`.
  - `GET` -> fetches `webAppUrl` JSON -> returns remote sync payload.
* **Dependencies:** Native `fetch`; superseded by Firestore flow in current UI.

### 📄 `app/api/backup/now.js`
* **Role:** [API ROUTE] Manual backup trigger.
* **Key Components & Flow:**
  - `POST` -> reads `reason` -> calls `createBackup` -> returns metadata.
* **Dependencies:** `lib/backup/backupService.js`.

### 📄 `app/api/backup/list.js`
* **Role:** [API ROUTE] Lists local backup snapshots.
* **Key Components & Flow:**
  - `GET` -> calls `listBackups` and `createBackupSummary` -> optionally loads latest metadata.
* **Dependencies:** `lib/backup/backupService.js`, `lib/utils/backupUtils.js`.

### 📄 `app/api/backup/restore.js`
* **Role:** [API ROUTE] Destructive restore from local backup JSON into Supabase.
* **Key Components & Flow:**
  - `POST` -> requires `confirm="YES_DELETE_ALL_DATA"` -> loads table files -> calls `restoreFromBackup`.
* **Dependencies:** `lib/backup/backupService.js`, `lib/backup/supabaseBackup.js`; targets Supabase tables.

### 📄 `app/api/backup/[date]/metadata.js`
* **Role:** [API ROUTE] Reads metadata for one backup date.
* **Key Components & Flow:**
  - `GET` -> reads route `date` param -> dynamic imports `getBackupMetadata` -> returns `backup-metadata.json`.
* **Dependencies:** `lib/backup/backupService.js`, local backup folder.

### 📄 `lib/firebaseClient.js`
* **Role:** Browser Firebase adapter for Auth, Firestore, Messaging, and phone/anonymous auth helpers.
* **Key Components & Flow:**
  - `getFirebaseApp/getFirebaseAuth/getFirestoreDb` -> singleton browser Firebase app services.
  - `getFcmToken/getFirebaseMessaging` -> obtains web push token with VAPID key.
  - `fb` -> exported Firestore function bundle used throughout `app/page.jsx`.
  - `startPhoneSignInE164/signInAnon/fbLogout` -> auth helpers for login/logout flow.
* **Dependencies:** `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/messaging`, `NEXT_PUBLIC_FIREBASE_*`.

### 📄 `lib/firebaseAdmin.js`
* **Role:** Server Firebase Admin singleton for API routes.
* **Key Components & Flow:**
  - `parseServiceAccount` -> parses `FIREBASE_SERVICE_ACCOUNT_JSON`, normalizes private key newlines.
  - `getFirebaseAdminApp` -> initializes Admin SDK from service account or ADC.
  - `getAdminAuth/getAdminDb` -> shared server Auth/Firestore accessors.
* **Dependencies:** `firebase-admin/app`, `firebase-admin/auth`, `firebase-admin/firestore`.

### 📄 `lib/supabaseServer.js`
* **Role:** Server-side Supabase service-role client factory.
* **Key Components & Flow:**
  - `getSupabaseAdmin` -> validates Supabase env vars -> returns non-persistent service client.
* **Dependencies:** `@supabase/supabase-js`; currently not imported by tracked API routes.

### 📄 `lib/backup/backupService.js`
* **Role:** Local JSON snapshot orchestrator for Supabase data.
* **Key Components & Flow:**
  - `createBackup` -> fetches Supabase data/stats -> writes table JSON + metadata -> optional cloud upload -> cleanup old backups.
  - `listBackups/getBackupMetadata/getBackupTableData` -> read backup directories/files.
  - `cleanupOldBackups` -> deletes snapshots older than retention.
* **Dependencies:** `lib/backup/supabaseBackup.js`, `lib/backup/storageBackup.js`, `lib/utils/backupUtils.js`, Node `fs/promises`, `path`.

### 📄 `lib/backup/supabaseBackup.js`
* **Role:** Supabase table fetch/restore module for backup system.
* **Key Components & Flow:**
  - `fetchAllData` -> selects all rows from `customers`, `orders`, `drivers`, `chat_messages`, `driver_locations`.
  - `restoreFromBackup` -> deletes existing rows then inserts backup rows.
  - `getTableStats/verifySchema` -> table count/schema checks.
* **Dependencies:** `@supabase/supabase-js`, env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

### 📄 `lib/backup/storageBackup.js`
* **Role:** Supabase Storage upload/download/delete for backup snapshots.
* **Key Components & Flow:**
  - `uploadToStorage` -> uploads every local backup JSON to `backups/snapshots/{date}/`.
  - `downloadFromStorage/listStorageBackups/deleteStorageBackup` -> cloud restore/list/delete helpers.
* **Dependencies:** `@supabase/supabase-js`, Node `fs/promises`, `path`, Supabase Storage bucket `backups`.

### 📄 `lib/utils/backupUtils.js`
* **Role:** Shared backup utility functions.
* **Key Components & Flow:**
  - `generateChecksum/verifyChecksum` -> MD5 integrity checks.
  - `formatDate/parseDate/daysBetween/formatBytes` -> date/size helpers.
  - `generateReport/createBackupSummary` -> human-readable backup reporting.
* **Dependencies:** Node `crypto`; used by backup API/service modules.

### 📄 `public/firebase-messaging-sw.js`
* **Role:** [SERVICE WORKER] Firebase Cloud Messaging background notification handler.
* **Key Components & Flow:**
  - `firebase.initializeApp` -> hardcoded public Firebase config for SW context.
  - `messaging.onBackgroundMessage` -> shows new-order notification.
  - `notificationclick` -> focuses existing app window or opens `/`.
* **Dependencies:** Firebase compat CDN scripts, FCM payloads from `/api/orders/create`.

### 📄 `public/manifest.webmanifest`
* **Role:** PWA manifest.
* **Key Components & Flow:**
  - `display: standalone`, `start_url: "/"`, icons -> mobile install behavior.
* **Dependencies:** Referenced by `app/layout.jsx`; icons in `public/`.

### 📄 `public/delivery-logo.svg`
* **Role:** SVG app/brand icon.
* **Key Components & Flow:**
  - Static truck mark -> used as favicon/brand asset.
* **Dependencies:** Referenced by `app/layout.jsx` and UI assets.

### 📄 `public/icon-192.png`
* **Role:** PWA icon and notification badge source.
* **Key Components & Flow:**
  - 192px app icon -> manifest + service worker notifications.
* **Dependencies:** `public/manifest.webmanifest`, `public/firebase-messaging-sw.js`.

### 📄 `public/icon-512.png`
* **Role:** High-resolution PWA install icon.
* **Key Components & Flow:**
  - 512px app icon -> manifest install surfaces.
* **Dependencies:** `public/manifest.webmanifest`, `app/layout.jsx`.

### 📄 `public/apple-touch-icon.png`
* **Role:** iOS home-screen icon.
* **Key Components & Flow:**
  - Apple touch icon -> registered in `metadata.icons.apple`.
* **Dependencies:** `app/layout.jsx`.

### 📄 `supabase-setup.sql`
* **Role:** Supabase schema bootstrap for legacy backup/storage flows.
* **Key Components & Flow:**
  - Creates/updates `customers`, `orders`, `drivers`, `driver_locations`, `chat_messages`, auth/session tables.
  - Enables RLS with permissive policies and creates `pod-photos` storage bucket policy.
* **Dependencies:** Supabase SQL editor; current main app uses Firestore for live data but backup modules still target Supabase.

### 📄 `deploy.bat`
* **Role:** Local Windows Git deploy helper.
* **Key Components & Flow:**
  - `cd ...\repo` -> stages, commits fixed message, pushes `origin main`, prints status/log.
* **Dependencies:** Nested `repo/` folder; not aligned with current project root workflow.

### 📄 `git_status.js`
* **Role:** Local Git diagnostic helper.
* **Key Components & Flow:**
  - Runs `git log --oneline -10`, `git status --short`, `git diff --cached --stat`.
* **Dependencies:** Node `child_process`, local Git.

### 📄 `README.md`
* **Role:** Project overview and operational documentation.
* **Key Components & Flow:**
  - Documents sales/driver workflows, deployment, backup commands, Supabase setup.
  - Some content still describes Supabase as primary DB while current app code uses Firebase/Firestore live path.
* **Dependencies:** Human-facing docs; links to `WORKFLOW.md`, `BACKUP_SYSTEM.md`, `SUPABASE_SETUP.md`.

### 📄 `WORKFLOW.md`
* **Role:** User workflow documentation for sales, driver, reports, and admin operations.
* **Key Components & Flow:**
  - Step-by-step operational guide -> maps business process to UI tabs.
* **Dependencies:** Human-facing docs for `app/page.jsx` UX.

### 📄 `BACKUP_SYSTEM.md`
* **Role:** Backup architecture and recovery documentation.
* **Key Components & Flow:**
  - Describes snapshot retention, manual backup, restore, cloud storage, troubleshooting.
* **Dependencies:** Backup API routes and `lib/backup/*`.

### 📄 `SUPABASE_SETUP.md`
* **Role:** Supabase setup and schema guide.
* **Key Components & Flow:**
  - Explains env vars, SQL setup, tables, storage, RLS, and reset flow.
* **Dependencies:** `supabase-setup.sql`, backup modules, legacy Supabase flow.

### 📄 `IMPLEMENTATION_SUMMARY.md`
* **Role:** Implementation/change summary document.
* **Key Components & Flow:**
  - Captures delivered features and integration notes from previous development work.
* **Dependencies:** Human-facing project history.

# Hillkoff Integration Setup

## Google Login + OTP (Firebase)

1. Firebase Console -> Authentication -> Sign-in method -> enable Google.
2. Add the app domain to Firebase Authorized domains.
3. Set these environment variables:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
4. For local Chrome testing only, set `OTP_DEV_MODE=true`. The login screen will show the generated 6-digit OTP after Google sign-in.
5. For production, keep `OTP_DEV_MODE=false` and connect an email/SMS sender to `app/api/auth/google/start/route.js`.

Flow:

1. User selects role.
2. User signs in with Google.
3. Server verifies Firebase ID token and creates an `otp_sessions` document with 5-minute expiry.
4. User enters OTP.
5. Server marks OTP used, writes `users`, `users_by_phone`, `login_events`, and lets the app continue.

Rules prepared:

- Sales must use an email ending in `@hillkoff.com`.
- Drivers may use personal Google accounts, but driver role still needs a phone number to bind profile data.
- Admins must be listed in `ADMIN_EMAIL_ALLOWLIST` as comma-separated emails.

## LINE Official Account

Set these environment variables:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_DEFAULT_TO`

Endpoints:

- Webhook: `/api/line/webhook`
- Manual push: `/api/line/push`

Order creation now sends a best-effort LINE OA push through `LINE_DEFAULT_TO`. If LINE env vars are missing, order creation still succeeds and the notification result is stored as skipped in Firestore `notifications`.

LINE webhook events are verified with `x-line-signature` and stored in Firestore `line_webhook_events`.

## Google Sheets: ระบบส่งของเชียงใหม่ประจำวัน

1. Open the existing Apps Script project and replace its `Code.gs` with [google-apps-script/Code.gs](google-apps-script/Code.gs).
2. Deploy a new Web App version that runs as the script owner and is accessible to the Next.js server.
3. Set this production environment variable to the deployed Web App URL:

   ```text
   GOOGLE_DAILY_DELIVERY_WEB_APP_URL=https://script.google.com/macros/s/.../exec
   ```

4. Sign in as `online_marketing@hillkoff.com`, open **การตั้งค่า**, and select **ตั้งค่า Sheet ระบบส่งของเชียงใหม่** once.

The setup action creates `ระบบส่งของเชียงใหม่ประจำวัน` only once and saves its Spreadsheet ID in Apps Script properties as `HILLKOFF_DAILY_DELIVERY_SPREADSHEET_ID`. Every later sync opens that locked ID. If it is missing or inaccessible, sync fails instead of creating a replacement file.

Each order is upserted by order number into a tab named by `serviceDate` such as `2026-07-13`. The `สถานะรวม` column is color-coded automatically.

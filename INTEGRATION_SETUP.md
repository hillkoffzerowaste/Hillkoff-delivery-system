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

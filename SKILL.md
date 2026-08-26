---
name: hillkoff-delivery-system
description: Maintain the Hillkoff Delivery System safely, especially its order workflow, driver mobile flows, and protected Firestore API writes.
---

# Hillkoff Delivery System

Use this skill for changes to this repository's delivery workflow, role-based UI, Firestore access, or operational reports.

## Understand the affected flow first

- Read the relevant section of `README.md` and the complete affected area of `app/page.jsx` before changing behavior. `app/page.jsx` combines the UI, state, and business logic for all roles.
- Treat driver actions—accepting a job, checking in, completing delivery, POD capture, vehicle checks, and mileage/fuel entry—as field-critical mobile workflows. Preserve their existing rollback, disabled, duplicate-submission, and failure states unless the request explicitly changes them.
- Keep role boundaries intact. Drivers must only see the work permitted for their identity; accounting remains report-only.

## Preserve data and authorization boundaries

- Send writes to protected business data (`orders`, `customers`, workflow records, reports, and vehicle data) through the appropriate `app/api/**` route, which verifies the Firebase ID token and role. Do not add direct client-side Firestore writes for those resources.
- Use a Firestore transaction for check-then-write operations that could race. Follow the existing API route patterns.
- When reserving booking numbers in `booking_month_registry`, write `source` from `ORDER_REGISTRY_SOURCE` and read it through `isOrderRegistrySource` (`lib/bookingRegistry.js`). A hardcoded string here silently orphans reservations: the delete routes never release the number and the Store report path returns 409 instead of linking back to the order.
- Any driver-ownership check must require a non-empty `driverId` before comparing, not just equality. Orders closed by sales keep `driverId: ""`, so a bare comparison lets a driver profile without a `driverId` overwrite their delivery history.
- A booking reservation can be *borrowed*: a pack-assist order shares a `store_reports`-owned registry doc instead of creating its own. Release a reservation only through `canReleaseStoreReportReservation`, which requires an empty `sharedWithOrderIds`. Releasing without that check allows the same booking number to be issued twice.
- Rate-limit and lockout checks belong *before* the credential comparison. Checking them only on the failure path lets a correct credential through while locked, and makes the lockout window a free unlimited guessing oracle.
- In `firestore.rules`, every `profile()` / `driverId()` call is a document `get()`, and the `orders` read rule already sits near the 10-access ceiling. Bind `let did = driverId()` once per rule and compare against it; a helper that takes a value and calls `driverId()` internally adds one `get()` per invocation and makes legitimate driver reads fail with an evaluation error. Run `npm run test:rules` after any rules change — it catches exactly this.
- Never return a raw Firestore doc from an API route. `users_by_phone` and `users` carry `passwordHash`, `passwordSalt`, and `trustedDeviceHashes`; whitelist the response fields the way `publicDriverRecord` and `publicProfile` do. Spreading `...doc.data()` into a response is how driver password hashes reached every sales and accounting user.
- A route that serves both create and update (`export const PATCH = POST`) with `set(..., { merge: true })` must not derive a flag from `body.x !== false`. When the field is absent the expression yields the default, which silently overwrites stored state — this is how editing a name re-enabled disabled drivers, vehicles, and staff accounts. Set such fields only when the body supplies the value, or when the document is new.
- A `limit(n)` without `orderBy` returns documents in key order, so filtering or picking "the latest" afterwards in memory breaks silently once a group exceeds `n`. Push the filter and the ordering into the query. Equality-only multi-field queries need no composite index; adding a range or `orderBy` on a second field does.
- `npm run booking:audit-registry` audits `booking_month_registry` for reservations whose owner is gone and rebuilds `sharedWithOrderIds` from live order data. It is dry-run by default; `--apply` writes. Applied on 2026-08-26 after a full backup: normalised 10 legacy `source` values, wrote 2,697 borrower lists, released 18 orphaned booking numbers. A clean re-run should report all zeroes — a non-zero count means something is stranding reservations again.
- Do not run data scripts with `--apply`, change Firestore rules or indexes, modify role allowlists, alter environment variables, or deploy without the user's explicit authorization.

## Make focused, verifiable changes

- Keep the change within the requested behavior; avoid broad refactors and premature abstractions.
- Follow existing UI conventions in `app/globals.css`. Before creating or changing UI markup, CSS, or design tokens, read `C:\Users\Office14\DESIGN.md`.
- For UI changes, verify the relevant role in a real browser, with special attention to the driver mobile experience and the 375px viewport.
- Before committing a code change, run `npm run check`. Run `npm run test:rules` too when Firestore rules change.

## Delivery

Report the affected workflow, files changed, verification performed, and any checks that could not run. Create a new commit for verified task-related changes; push only when the user explicitly asks. อัพเดท skill ทุกครั้งที่ รันโปรเจค แก้ไชล่าสุด

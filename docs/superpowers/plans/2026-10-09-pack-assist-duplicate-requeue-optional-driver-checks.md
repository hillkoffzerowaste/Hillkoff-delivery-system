# Flexible Pack Assist Requeue and Optional Driver Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ห้องแพ็คอัปเดตออเดอร์ซ้ำของวันนี้ที่ยังไม่มีคนขับรับงาน ส่งออเดอร์เวอร์ชันล่าสุดกลับเข้าคิวคนขับ เพิ่มลูกค้าใหม่ได้ และเปิดให้คนขับกรอกเลขไมล์/ประเมินรถภายหลังโดยไม่ถูก modal ขวางการใช้งาน

**Architecture:** ใช้ policy helper แบบ pure function แยกเกณฑ์ duplicate/update/driver-accepted ออกจาก route จากนั้นให้ `orders/create` อ่านและเขียนออเดอร์/booking registry ใน transaction เดียว พร้อมคืน patch ของออเดอร์เดิมให้ client ใช้ปรับ state ทันที ส่วน UI เดิมใน `app/page.jsx` จะเพิ่มทางเลือกอัปเดตสำเร็จและเปิดฟอร์มลูกค้าใหม่สำหรับ role `pack`; การลดข้อบังคับคนขับเป็นการเอา startup gate ออกโดยคง validation ของการบันทึกข้อมูลที่ผู้ใช้เลือกทำไว้

**Tech Stack:** Next.js App Router, React 19, Cloud Firestore Admin SDK, Firebase Auth, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-10-09-pack-assist-duplicate-requeue-optional-driver-checks-design.md`

## Global Constraints

- เขียนข้อมูล Firestore ผ่าน API route ที่ตรวจ Firebase ID token และ role ผ่าน `lib/workflowAuth.js` เท่านั้น
- ออเดอร์ที่แก้ทับได้ต้องเป็น `serviceDate` วันนี้ และต้องไม่มี `driverId`, `acceptedAt` หรือสถานะ `กำลังส่ง`/`กำลังจัดส่ง`
- ถ้าคนขับรับออเดอร์วันนี้แล้ว route ต้องตอบ 409 และห้ามเขียนข้อมูลใด ๆ
- ออเดอร์คนละวันไม่ถูกแก้ทับและไม่บล็อกการสร้างออเดอร์ใหม่
- การอัปเดต duplicate และ booking registry ต้องอยู่ใน Firestore transaction เดียว
- ห้องแพ็คเพิ่มลูกค้าใหม่ได้ผ่าน `/api/customers/upsert`; ห้าม client เขียน Firestore ตรง
- ไม่แก้ Firestore Rules, indexes, environment variables, migration/backfill หรือ deploy production
- รักษาแก้ค้างเดิมใน worktree และ stage เฉพาะไฟล์ของงานนี้
- ทุก production behavior ต้องมี failing test ก่อน implementation และตรวจ `npm run lint`, `npm test`, `npm run build` ก่อนสรุป

## Review Focus

- ออเดอร์วันนี้ที่มี `driverId` หรือ `acceptedAt` แม้ `queueStatus` จะไม่ใช่ `queued` ต้องไม่ถูกแก้ไข — ให้ route regression test ครอบคลุม
- ถ้ามี duplicate วันนี้หลายรายการ ต้องเลือกออเดอร์ที่ยังแก้ได้ล่าสุด และต้องให้ accepted order ทำหน้าที่เป็น hard block — ให้ policy/route tests ครอบคลุม
- booking number ใหม่ชน registry ของออเดอร์อื่น ต้อง rollback ทั้ง update และ queue patch — ให้ route transaction test ครอบคลุม
- role `pack` ต้องเพิ่มลูกค้าใหม่ได้ แต่ยังห้ามเปลี่ยนชื่อไปทับลูกค้าเดิม — ให้ customer upsert route tests ครอบคลุม
- การเอา startup gate ออกต้องไม่ทำให้ validation ของการบันทึกเลขไมล์/แบบประเมินที่ผู้ใช้กดเองหายไป — ให้ UI contract และ route/source tests ครอบคลุม

---

### Task 1: Define Pack Duplicate Policy

**Files:**
- Modify: `lib/packAssistOrder.js`
- Modify: `tests/unit/packAssistOrder.test.js`

**Interfaces:**
- Produces `classifyPackAssistDuplicate(orders, { customerId, todayServiceDate }) -> { type: "none" | "updatable" | "driver_accepted", order: object | null }`.
- Produces `buildPackAssistExistingOrderPatch(existing, latest, actor, now) -> { patch: object, history: object }`.
- `classifyPackAssistDuplicate` compares `order.serviceDate` to `todayServiceDate`, matches `customerId`, treats `driverId`, `acceptedAt`, `กำลังส่ง`, and `กำลังจัดส่ง` as accepted, and chooses the latest eligible unaccepted order by `updatedAt || queuedAt || createdAt`.
- `buildPackAssistExistingOrderPatch` preserves identity/history fields outside the latest keyed fields, sets `packStatus: "checked"`, adds the actor audit fields, and includes `buildDriverQueuePolicyPatch(now)` plus `queuedBy`.

- [ ] **Step 1: Write failing policy tests**

  Add tests that assert: a same-day unaccepted order is `updatable`; a same-day accepted order is `driver_accepted`; yesterday's order is `none`; an accepted order wins over an eligible duplicate; the latest eligible duplicate is selected; and the patch contains current queue date/time, `queueStatus: "queued"`, `status: "รอคนขับรับ"`, `packStatus: "checked"`, latest keyed fields, and an audit history result.

- [ ] **Step 2: Run the focused policy tests and verify RED**

  Run: `npm test -- tests/unit/packAssistOrder.test.js`

  Expected: FAIL because the new classifier and patch builder do not exist yet.

- [ ] **Step 3: Implement the two policy functions**

  Keep the existing validation/share-booking helpers intact. Add bounded date/status predicates and reuse `buildDriverQueuePolicyPatch` instead of duplicating queue constants. The patch builder must not mutate `existing` and must only copy the latest order fields that the pack form is allowed to update.

- [ ] **Step 4: Run the focused policy tests and verify GREEN**

  Run: `npm test -- tests/unit/packAssistOrder.test.js`

  Expected: all policy tests pass.

- [ ] **Step 5: Commit the policy unit**

  ```bash
  git add lib/packAssistOrder.js tests/unit/packAssistOrder.test.js
  git commit -m "feat(pack): define safe duplicate requeue policy"
  ```

### Task 2: Atomically Update and Requeue Existing Pack-Assisted Orders

**Files:**
- Create: `tests/unit/orderCreateRoute.test.js`
- Modify: `app/api/orders/create/route.js`

**Interfaces:**
- Consumes Task 1's `classifyPackAssistDuplicate` and `buildPackAssistExistingOrderPatch`.
- `POST /api/orders/create` continues to accept `{ order }`; for an eligible duplicate it returns `{ ok: true, data: { id, updatedExisting: true, ...patch } }`.
- For a same-day accepted duplicate it returns HTTP 409 with a stable Thai message containing `ออเดอร์ซ้ำ` and `คนขับรับ` and does not write the order.
- New-order behavior for non-pack roles and non-duplicate pack orders remains unchanged.

- [ ] **Step 1: Build route test fixtures and write failing route tests**

  Mock auth, Firebase Admin messaging, LINE, sheet sync, and Firestore collections with an in-memory transaction/batch fixture. Add tests that assert:

  - an eligible same-day pack duplicate updates the existing order's latest boxes/note/booking data, keeps its original `createdAt`, sets `packStatus: "checked"`, refreshes the driver queue, returns `updatedExisting: true`, and appends a `pack_assist_update` activity;
  - a duplicate with `driverId`, `acceptedAt`, or active delivery status returns 409 and leaves the stored order and registry unchanged;
  - a duplicate from a different `serviceDate` creates a new order instead of updating the old one;
  - a new booking number already owned by another order rejects the transaction without a partial update;
  - a pack-created direct-pack order still follows the existing create path.

- [ ] **Step 2: Run the route tests and verify RED**

  Run: `npm test -- tests/unit/orderCreateRoute.test.js`

  Expected: FAIL because the create route still blocks all unfinished pack duplicates and has no existing-order update response.

- [ ] **Step 3: Implement the transaction branch in `app/api/orders/create/route.js`**

  Query the customer's orders inside the existing transaction. Before any write, classify accepted/updatable/none for today's Bangkok service date. For `driver_accepted`, throw 409. For `updatable`, compare desired/current booking registry entries, create/delete only entries owned by this order, preserve allowed shared Store booking behavior, write the patch and one activity record, and return the patch. Keep the current order-id idempotency and new-order registry logic intact for the normal branch.

- [ ] **Step 4: Run route and policy tests and verify GREEN**

  Run: `npm test -- tests/unit/orderCreateRoute.test.js tests/unit/packAssistOrder.test.js`

  Expected: all duplicate, registry, and normal-create tests pass.

- [ ] **Step 5: Commit the API unit**

  ```bash
  git add app/api/orders/create/route.js tests/unit/orderCreateRoute.test.js
  git commit -m "feat(pack): update and requeue safe duplicate orders"
  ```

### Task 3: Let Pack Create Customers and Reflect Duplicate Updates in the UI

**Files:**
- Modify: `app/api/customers/upsert/route.js`
- Modify: `tests/unit/customerUpsertRoute.test.js`
- Modify: `app/page.jsx`
- Create: `tests/unit/packAssistUiContract.test.js`

**Interfaces:**
- `/api/customers/upsert` allows `sales`, `admin`, `store`, and `pack`; duplicate-name protection is unchanged.
- `confirmOrder` consumes `json.data.updatedExisting` and merges the returned patch into the matching local order instead of adding a new order. It reports that the latest data was sent back to the driver queue.
- Pack's urgent-order modal renders the existing customer form and calls `saveCustomer`; it no longer hides that form for `auth.role === "pack"`.

- [ ] **Step 1: Write failing permission/UI tests**

  Extend the customer route fixture to run as `pack` and assert a new customer upsert succeeds while a duplicate name still returns 409. Add source/contract tests that assert the pack form is rendered, `confirmOrder` handles `updatedExisting`, and the response message distinguishes “อัปเดตออเดอร์เดิม” from creating a new order.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `npm test -- tests/unit/customerUpsertRoute.test.js tests/unit/packAssistUiContract.test.js`

  Expected: FAIL because the API allowlist excludes `pack`, the modal hides the customer form for pack, and the UI only adds newly created orders.

- [ ] **Step 3: Implement pack customer permission and UI merge behavior**

  Add `pack` to the route allowlist. In the existing modal, render the same name/phone/contact/zone/customer fields for pack, keep the shared duplicate-phone confirmation, and preserve the direct-pack/company-driver controls. Update `confirmOrder` to merge `json.data` into the order with the returned `id` when `updatedExisting` is true; keep normal creation behavior unchanged and make the accepted-duplicate 409 message actionable.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `npm test -- tests/unit/customerUpsertRoute.test.js tests/unit/packAssistUiContract.test.js tests/unit/orderCreateRoute.test.js`

  Expected: all customer, UI contract, and create-route tests pass.

- [ ] **Step 5: Commit the pack UI/permission unit**

  ```bash
  git add app/api/customers/upsert/route.js tests/unit/customerUpsertRoute.test.js app/page.jsx tests/unit/packAssistUiContract.test.js
  git commit -m "feat(pack): allow customer entry and duplicate order updates"
  ```

### Task 4: Make Driver Vehicle Setup Optional at App Entry

**Files:**
- Modify: `app/page.jsx`
- Create: `tests/unit/driverVehicleOptional.test.js`

**Interfaces:**
- Driver workspace renders without the `needsDailyVehicleStart` overlay.
- `submitDailyVehicleStart`, `submitVehicleUsageEvent`, and assessment submission keep their own input validation when invoked; removing the startup gate must not make invalid manual submissions succeed.
- Driver SOP copy describes vehicle/odometer/assessment as optional follow-up work and does not claim they are required to enter the app.

- [ ] **Step 1: Write failing UI contract tests**

  Read `app/page.jsx` as a source contract and assert there is no rendered startup modal gated by `needsDailyVehicleStart`, the driver app can render its normal work tab without that condition, the manual submit functions still contain validation, and the SOP copy says the data can be completed later.

- [ ] **Step 2: Run the focused contract test and verify RED**

  Run: `npm test -- tests/unit/driverVehicleOptional.test.js`

  Expected: FAIL because the current page contains the blocking overlay and pre-submit guard.

- [ ] **Step 3: Remove only the startup gate and update copy**

  Remove the `needsDailyVehicleStart` gate/overlay and its assessment precondition, keep the explicit validation inside each save action, and update the morning notice/banner/button text to say the driver can return later to fill the optional data. Do not change vehicle usage API validation or any report calculation.

- [ ] **Step 4: Run the focused contract test and verify GREEN**

  Run: `npm test -- tests/unit/driverVehicleOptional.test.js`

  Expected: all optional-entry assertions pass.

- [ ] **Step 5: Commit the driver UI unit**

  ```bash
  git add app/page.jsx tests/unit/driverVehicleOptional.test.js
  git commit -m "fix(driver): make vehicle checks optional at app entry"
  ```

### Task 5: Whole-Branch Verification and Browser UAT

**Files:**
- Verify only: `app/page.jsx`, `app/api/orders/create/route.js`, `app/api/customers/upsert/route.js`, `lib/packAssistOrder.js`, and the feature tests.

- [ ] **Step 1: Run complete automated verification**

  Run: `npm run lint`

  Expected: exit 0 with zero warnings.

  Run: `npm test`

  Expected: exit 0 with all unit tests passing.

  Run: `npm run build`

  Expected: exit 0 with a successful Next.js production build.

- [ ] **Step 2: Run the dev server and inspect the real UI**

  Start `npm run dev`, sign in with a pack account, verify the urgent-order modal can search and add a new customer, submit a same-day unaccepted duplicate and see the original order updated/requeued, verify a driver-accepted duplicate is rejected, and verify a driver can open the app without filling odometer/assessment first. Stop the dev server after inspection.

- [ ] **Step 3: Review the final diff and preserve unrelated work**

  Run `git status --short`, `git diff --check`, and `git diff --stat`. Confirm only the feature commits are staged/committed and the pre-existing dirty files remain untouched.

- [ ] **Step 4: Commit any verification-only correction with TDD**

  If verification finds a feature defect, add/adjust a failing regression test first, fix the smallest code path, rerun the affected test and full suite, then commit only the correction. Do not amend earlier commits.

- [ ] **Step 5: Push `main` only after fresh verification evidence**

  Confirm `git log --oneline --decorate -8` and the clean feature diff, then run `git push origin main`. If push is rejected as non-fast-forward, stop; fetch/merge and repeat the complete verification before retrying, never force-push.

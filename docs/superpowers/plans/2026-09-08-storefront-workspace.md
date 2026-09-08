# Storefront Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restricted storefront role that tracks Grab/customer-pickup preparation and records handovers safely.

**Architecture:** Extend the existing Firebase staff credential/profile path with one additional role. Reuse the order workflow endpoint for an authorized, preconditioned handover transition, and add one fixed role workspace to the current page without changing existing role routes.

**Tech Stack:** Next.js 16 App Router, React 19, Firebase Authentication, Cloud Firestore, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-storefront-workspace-design.md`

## Global Constraints

- Keep scope limited to the `storefront` role and its handover flow.
- Preserve all existing driver, store, pack, sales, and admin workflow behaviors.
- All order mutation must use a server API authenticated by Firebase ID token; client Firestore writes remain prohibited.
- Use the existing teal Windows-enterprise visual tokens and responsive operational card styles.
- Do not edit Firestore rules. Storefront order data must come from a role-checked server route with a minimal DTO.
- Run focused tests in every red/green cycle, then `npm run check` and browser UI verification before commit and push.

---

### Task 1: Authorize and manage storefront staff accounts

**Files:**
- Modify: `app/api/auth/validate/route.js`
- Modify: `lib/workflowAuth.js`
- Modify: `app/api/admin/users/route.js`
- Modify: `app/page.jsx`
- Test: `tests/unit/adminUserPatch.test.js`

**Interfaces:**
- Consumes: Firebase-authenticated `users/{uid}` staff profiles with `role`, `active`, and `status`.
- Produces: `storefront` as a valid active role accepted by validation, API guards, and the existing username/password staff-account controls.

- [ ] **Step 1: Write failing tests**

Add route tests that create a `{ username: "front01", password: "front-pass", name: "หน้าร้าน 1", role: "storefront" }` profile and expect HTTP 200 with `role: "storefront"`; add a validation fixture that expects a storefront profile to be valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/adminUserPatch.test.js tests/unit/authValidate.test.js`

Expected: FAIL because role validation permits only store and pack staff roles.

- [ ] **Step 3: Write minimal implementation**

Add `storefront` to the explicit role allowlists in validation and `requireProfile`; extend admin user GET/POST role filtering and the existing account-form select label to include `หน้าร้าน`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/adminUserPatch.test.js tests/unit/authValidate.test.js`

Expected: PASS, including the existing disabled-account regression cases.

- [ ] **Step 5: Commit**

```powershell
git add -- app/api/auth/validate/route.js lib/workflowAuth.js app/api/admin/users/route.js app/page.jsx tests/unit/adminUserPatch.test.js tests/unit/authValidate.test.js
git commit -m "feat: authorize restricted storefront accounts"
```

### Task 2: Permit safe storefront handover through the workflow API

**Files:**
- Modify: `app/api/orders/workflow/route.js`
- Test: `tests/unit/orderWorkflowRoute.test.js`

**Interfaces:**
- Consumes: `POST /api/orders/workflow` body `{ orderId, action: "grab_pickup" }` and authenticated profile role.
- Produces: a conditional state transition to `queueStatus: "grab_picked_up"`, localized final status, `grabPickedUpAt`, `grabPickedUpBy`, and activity entry.

- [ ] **Step 1: Write failing tests**

Add four route cases: a storefront actor hands over a `grab_ready` `grab_pickup` order with `packStatus: "checked"`; a storefront actor is rejected while pack is `working`; a storefront actor is rejected for a company-driver order; and an already handed-over order is rejected. Assert the success patch and unchanged failure fixture data.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/orderWorkflowRoute.test.js`

Expected: FAIL because `grab_pickup` permits only sales/admin.

- [ ] **Step 3: Write minimal implementation**

Permit `storefront` only in the existing `action === "grab_pickup"` branch. Retain the route's snapshot precondition and existing pickup/ready checks; add the explicit pack-ready condition before the update.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/orderWorkflowRoute.test.js`

Expected: PASS, including all existing workflow routing cases.

- [ ] **Step 5: Commit**

```powershell
git add -- app/api/orders/workflow/route.js tests/unit/orderWorkflowRoute.test.js
git commit -m "feat: record storefront pickup handovers safely"
```

### Task 3: Render the restricted storefront workspace

**Files:**
- Modify: `app/page.jsx`
- Test: `tests/unit/storefrontWorkspace.test.jsx`

**Interfaces:**
- Consumes: authenticated `state.auth.role === "storefront"` and `GET /api/orders/storefront`.
- Produces: fixed `storefront-pickup` workspace with filtered Grab/customer-pickup work cards and `submitWorkflow(order.id, { action: "grab_pickup" })` handover action.

- [ ] **Step 1: Write failing test**

Render/export the smallest reusable storefront status/card helper and assert that a ready customer-pickup fixture renders the store, pack, and handover timeline labels, while an unready fixture exposes no enabled handover action.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/storefrontWorkspace.test.jsx`

Expected: FAIL because the storefront component/helper does not exist.

- [ ] **Step 3: Write minimal implementation**

Add the fixed role-tab guard, fetch the dedicated minimal pickup DTO, render the operational cards with checkpoint labels/timeline, and use the existing pending-request state to disable duplicate handover submissions. Exclude floating chat and all navigation outside this workspace for `storefront`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/storefrontWorkspace.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- app/page.jsx tests/unit/storefrontWorkspace.test.jsx
git commit -m "feat: add storefront pickup tracking workspace"
```

### Task 4: Add the minimal storefront read route and verify the user flow

**Files:**
- Create: `app/api/orders/storefront/route.js`
- Test: `tests/unit/storefrontOrdersRoute.test.js`

**Interfaces:**
- Consumes: a valid `storefront` Firebase profile and the `orders` collection.
- Produces: a minimal DTO for active pickup orders and proof that other roles cannot call the route.

- [ ] **Step 1: Write failing route tests**

Mock `requireProfile` and return pickup, company-driver, and completed pickup fixtures. Assert that the route returns only active Grab/customer-pickup DTO fields and returns 403 for a non-storefront caller.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/storefrontOrdersRoute.test.js`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the minimal route**

Query the active pickup orders, filter the results server-side, and serialize only the handover fields consumed by the workspace. Require `storefront` or `admin`; never return full user profiles or arbitrary order history.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/storefrontOrdersRoute.test.js`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm run check`

Expected: exit code 0 for lint, unit tests, and production build.

- [ ] **Step 6: Verify visually**

Run: `npm run dev`, open the storefront workspace in a browser, and verify the no-navigation layout, waiting/ready/handed-over states, disabled action, and single-submit behavior.

- [ ] **Step 7: Commit and push the completed feature**

```powershell
git add -- [only storefront-role production files, tests, and docs]
git commit -m "feat: give storefront staff a safe pickup handover workspace"
git push origin main
```

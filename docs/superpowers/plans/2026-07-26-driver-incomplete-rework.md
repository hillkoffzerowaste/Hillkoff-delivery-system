# Driver Incomplete Delivery Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add route-aware incomplete-delivery rework without changing the existing completed-delivery path.

**Architecture:** Keep route policy in `lib/preparationWorkflow.js`, validate and persist the new driver rework action in `app/api/orders/workflow/route.js`, and render the required driver/sales/store/pack notices in the existing `app/page.jsx` screens. Existing status transitions remain unchanged unless the new rework fields are present.

**Tech Stack:** Next.js 16, React 19, Firebase/Firestore, Vitest.

## Global Constraints

- “ครบ” must preserve the existing `driver_complete` behavior.
- `store_route` rework returns to store first; `direct_pack` rework skips store.
- No new listener, dependency, migration, or unrelated file change.
- POD files remain device-only; only photo count and workflow metadata persist.

### Task 1: Add tested rework routing policy

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Modify: `tests/unit/core.test.js`

**Interfaces:**
- Produce `resolveDriverReworkRoute(order): "store_route" | "direct_pack"`
- Produce `driverReworkPatch(order, actor, note, now): object`

- [ ] **Step 1: Add failing tests** for store-route and direct-pack routing, required note rejection, and sales alert visibility.
- [ ] **Step 2: Run** `npm.cmd test -- --run tests/unit/core.test.js`; confirm the new imports/expectations fail because the policy is missing.
- [ ] **Step 3: Implement** the smallest pure policy that returns route-specific store/pack statuses and additive rework fields.
- [ ] **Step 4: Run** the focused test again; confirm it passes.

### Task 2: Add backend driver incomplete action

**Files:**
- Modify: `app/api/orders/workflow/route.js`

**Interfaces:**
- Consume `driverReworkPatch` from Task 1.
- Add action `driver_rework` for the assigned driver only.

- [ ] **Step 1: Add the route branch** beside the existing `driver_cancel` and `driver_complete` branches.
- [ ] **Step 2: Validate** active delivery status, `deliveryCompleteness === "incomplete"`, and a non-empty note.
- [ ] **Step 3: Persist** route-aware store/pack statuses, clear driver assignment for requeue, append activity history, and retain sheet sync.
- [ ] **Step 4: Run** focused unit tests and `npm.cmd run lint`.

### Task 3: Update driver completion UI order

**Files:**
- Modify: `app/page.jsx`

- [ ] **Step 1: Add** per-order completeness selection and required note state.
- [ ] **Step 2: Disable** POD capture until completeness and note are present; keep cancel behavior unchanged.
- [ ] **Step 3: Submit** either the existing complete action or new rework action before sharing the same POD/LINE payload.
- [ ] **Step 4: Render** clear route-aware rework status on completed/rework cards.
- [ ] **Step 5: Run** `npm.cmd test` and lint.

### Task 4: Add role-specific rework visibility

**Files:**
- Modify: `app/page.jsx`

- [ ] **Step 1: Add** rework alerts to existing sales and Chiang Mai waiting panels.
- [ ] **Step 2: Add** store alert only for `store_route` and pack alerts for both routes, with read-only waiting text where store must act first.
- [ ] **Step 3: Keep** existing store/pack action buttons and queue filters unchanged for ordinary orders.
- [ ] **Step 4: Run** the full test suite.

### Task 5: Final verification

**Files:**
- Review only task files.

- [ ] **Step 1: Run** `npm.cmd test`.
- [ ] **Step 2: Run** `npm.cmd run lint`.
- [ ] **Step 3: Run** `npm.cmd run build`.
- [ ] **Step 4: Run** `git diff --check` and inspect `git diff --stat`.

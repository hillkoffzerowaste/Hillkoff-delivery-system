# Sales Order Reroute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow sales/admin to correct an order's delivery destination and preparation route while it is still safely reversible, with server-side state normalization, audit history, and queue/label safeguards.

**Architecture:** Add a pure transition policy in `lib/preparationWorkflow.js` that validates the current state and derives the target preparation statuses. Expose it through a dedicated `reroute` action in `/api/orders/workflow` using a Firestore transaction and mandatory reason. Add a small sales/admin UI modal that only offers eligible orders and shows the reset/reprint consequences.

**Tech Stack:** Next.js 16 App Router, React 19, Firebase Admin/Firestore, Vitest, ESLint.

## Global Constraints

- No migration or background mutation of existing orders.
- No direct client-side write of routing/status fields; reroute goes through the authenticated server route.
- Only sales/admin may reroute, and every reroute requires a reason.
- Do not reroute assigned driver work, active delivery, completed work, Grab already picked up, outstation QR-scanned work, or archived work.
- Do not include `.env*`, `.claude/`, caches, generated artifacts, or the existing untracked queue-expiry design in the task commit.

---

### Task 1: Define the reroute transition policy

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Test: `tests/unit/core.test.js`

**Interfaces:**
- Produce `canRerouteOrder(order, target)` returning `{ ok: boolean, reason?: string }`.
- Produce `buildReroutePatch(order, target, actor, reason, now)` returning a server-ready patch plus audit metadata, or throwing for an invalid transition.
- Accept targets `{ deliveryMethod: "company_driver" | "grab_pickup" | "customer_pickup" | "outstation", workflowType?: "store_route" | "direct_pack" | "direct_driver", shippingCarrier?: string, chiangmaiRoundCode?: string }`.

- [ ] **Step 1: Write failing tests** for company-driver → outstation, outstation → company-driver, Grab → outstation, rejection after driver assignment/QR scan/completion, clearing Chiang Mai fields, resetting preparation statuses, and preserving old route in audit metadata.
- [ ] **Step 2: Run `npm test -- --run tests/unit/core.test.js` and verify the new tests fail because the policy functions do not exist.**
- [ ] **Step 3: Implement the smallest pure policy.** Normalize target route with `initialPreparationStatuses`; require a carrier for outstation; clear incompatible fields; reset driver/Grab/outstation dispatch fields; keep current order id/customer/booking data unchanged; return `history` with `fromDeliveryMethod`, `toDeliveryMethod`, `fromWorkflowType`, `toWorkflowType`, and reason.
- [ ] **Step 4: Run the focused test and verify it passes.**

### Task 2: Add the authenticated reroute API

**Files:**
- Modify: `app/api/orders/workflow/route.js`
- Test: `tests/unit/core.test.js` for action-independent policy behavior; route behavior will be covered by existing server test conventions if available.

**Interfaces:**
- Accept `PATCH /api/orders/workflow` with `{ orderId, action: "reroute", target, reason }`.
- Return `{ ok: true, data: patch }` on success; return 400/403/409 for invalid input, role, or state.

- [ ] **Step 1: Add policy-driven API acceptance cases to the test fixture/route test if a route harness exists; otherwise keep all deterministic validation in Task 1 and verify the route by lint/build plus manual static inspection.**
- [ ] **Step 2: Implement a sales/admin-only branch before store/pack actions.** Validate a non-empty reason, validate target allowlists, load the order in a transaction with `lastUpdateTime`, call `buildReroutePatch`, append embedded `workflowHistory`, write the activity document, and update the order atomically.
- [ ] **Step 3: Sync the merged order to the delivery sheet after commit.** Preserve the existing warning behavior for sync failure but return the committed Firestore update; set label invalidation metadata when leaving or entering outstation so UI can require a fresh label.
- [ ] **Step 4: Run focused tests and lint the changed route.**

### Task 3: Add sales/admin reroute controls

**Files:**
- Modify: `app/page.jsx`
- Test: `tests/unit/operationsComponents.test.jsx` or the closest existing component test file if a focused render test can be added without coupling to the whole page.

**Interfaces:**
- Add a reusable `openRerouteModal(order)` client flow that posts the `reroute` action through the existing authenticated fetch helper.
- Show eligible targets based on current order and disable the action for blocked terminal/assigned states.

- [ ] **Step 1: Add a render/selector regression test for the eligibility copy if the existing page test harness supports it; otherwise document the UI checks in the verification pass.**
- [ ] **Step 2: Add a compact modal state for target delivery method, preparation route, carrier, and mandatory reason.** Keep target choices valid: outstation requires carrier; company-driver may select `store_route`, `direct_pack`, or `direct_driver` only when the target state is not already released to a driver; Grab/customer-pickup use `store_route`.
- [ ] **Step 3: Render “แก้เส้นทาง/ย้ายงาน” on sales/admin active order cards and history search details only when `canRerouteOrder` conditions are met.** Show warnings for reset inspection, invalidated labels, or QR data.
- [ ] **Step 4: After success, merge returned patch into realtime local state and close the modal; show the order’s new destination/route immediately.**

### Task 4: Verification and release gate

**Files:**
- Review: `lib/preparationWorkflow.js`, `app/api/orders/workflow/route.js`, `app/page.jsx`, tests, and the final diff.

- [ ] **Step 1: Run `npm test` and verify all unit tests pass.**
- [ ] **Step 2: Run `npm run lint` and verify zero errors/warnings.**
- [ ] **Step 3: Run `npm run build` and verify the production build completes.**
- [ ] **Step 4: Check `git diff --check`, `git status --short --branch`, and confirm only task-related tracked files are staged.**
- [ ] **Step 5: Commit the verified task files and push the current `codex/` branch; do not include secrets or unrelated untracked files.**

## Acceptance Matrix

| Scenario | Expected result |
|---|---|
| Open company-driver → outstation/direct-pack | Carrier required; Chiang Mai round cleared; store skipped; pack pending; history recorded |
| Open company-driver → outstation/store-route | Carrier required; store pending; pack blocked; history recorded |
| Open outstation → company-driver/store-route | Carrier and outstation fields cleared; store pending; pack blocked; no Chiang Mai round unless explicitly selected |
| Open Grab → company-driver | Allowed only before Grab pickup; Grab fields cleared; preparation route/status recalculated |
| Store/pack has started | Allowed only through controlled reset; previous inspection remains in history and target queue is rechecked |
| Driver assigned/active/completed | Rejected with 409 |
| Outstation QR scan exists | Rejected or requires admin exception; never silently reused |
| Printed outstation label exists | Mark invalidated and require a new label before dispatch |
| Concurrent update | Reroute fails with 409 and does not overwrite newer work |

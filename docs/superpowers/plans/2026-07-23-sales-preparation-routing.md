# Sales Preparation Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show read-only store waiting alerts to sales, keep outstation orders out of Chiang Mai, and allow each outstation order to go direct to pack or through store first.

**Architecture:** Put order classification and route/status resolution in pure functions under `lib/preparationWorkflow.js`. Both the page and create API consume those functions so sidebar counts, page routing, UI confirmation, and server persistence use one contract. Existing realtime listeners, Firestore schema, and role permissions remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, Firebase/Firestore, Vitest, ESLint.

## Global Constraints

- Sales warning information is read-only.
- Direct-to-pack is the default for outstation orders.
- Outstation `store_route` starts at store pending / pack blocked.
- No new Firestore listener, schema, migration, dependency, or permission change.
- Only task files are staged; `repo/` and `repo.worktrees/` remain untouched.

---

### Task 1: Central preparation classification policy

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Modify: `tests/unit/core.test.js`

**Interfaces:**
- Produces: `isOutstationOrder(order): boolean`
- Produces: `isChiangmaiPreparationOrder(order): boolean`
- Produces: `isSalesWaitingAlert(order): boolean`
- Preserves: `isReadyOrderWaitingForDispatch(order): boolean`

- [ ] **Step 1: Write failing classification tests**

Add cases proving canonical and legacy outstation orders are excluded from Chiang Mai, waiting/partial active orders create alerts, and terminal records do not:

```js
expect(isOutstationOrder({ deliveryMethod: "outstation" })).toBe(true);
expect(isOutstationOrder({ workflowType: "direct_pack", shippingCarrier: "Flash" })).toBe(true);
expect(isChiangmaiPreparationOrder({ deliveryMethod: "outstation", workflowType: "store_route", queueStatus: "preparing" })).toBe(false);
expect(isSalesWaitingAlert({ workflowType: "store_route", deliveryMethod: "company_driver", storeStatus: "waiting", packStatus: "blocked", queueStatus: "preparing" })).toBe(true);
expect(isSalesWaitingAlert({ workflowType: "store_route", storeStatus: "partial", queueStatus: "completed", status: "ส่งสำเร็จ" })).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: FAIL because the new classifier exports do not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Use explicit terminal queue statuses and exclude outstation from dispatch readiness:

```js
const TRANSFERRED_QUEUE_STATUSES = new Set(["queued", "completed", "outstation_ready", "grab_completed", "grab_ready", "grab_picked_up", "pack_archived", "driver_archived"]);

export function isOutstationOrder(order) {
  return order?.deliveryMethod === "outstation"
    || (order?.workflowType === "direct_pack" && Boolean(String(order?.shippingCarrier || "").trim()));
}

export function isChiangmaiPreparationOrder(order) {
  return Boolean(order?.workflowType)
    && !isOutstationOrder(order)
    && !TRANSFERRED_QUEUE_STATUSES.has(String(order?.queueStatus || ""));
}

export function isSalesWaitingAlert(order) {
  if (!order?.workflowType || isOutstationOrder(order) || order?.status === "ส่งสำเร็จ") return false;
  if (TRANSFERRED_QUEUE_STATUSES.has(String(order?.queueStatus || "")) || order?.packStatus === "returned") return false;
  return ["waiting", "partial"].includes(order?.storeStatus) || ["waiting", "partial"].includes(order?.packStatus);
}
```

Update `isReadyOrderWaitingForDispatch` to return false when `isOutstationOrder(order)` is true.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: all unit tests pass.

---

### Task 2: Outstation route selection and server normalization

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Modify: `tests/unit/core.test.js`
- Modify: `app/api/orders/create/route.js`

**Interfaces:**
- Produces: `resolvePreparationRoute(deliveryMethod, workflowType): "direct_driver" | "direct_pack" | "store_route"`
- Produces: `initialPreparationStatuses(deliveryMethod, workflowType): { workflowType, storeStatus, packStatus, queueStatus, status, urgentDelivery }`
- Consumes from Task 1: `isOutstationOrder(order)`

- [ ] **Step 1: Write failing route/status tests**

```js
expect(resolvePreparationRoute("outstation", "")).toBe("direct_pack");
expect(resolvePreparationRoute("outstation", "store_route")).toBe("store_route");
expect(initialPreparationStatuses("outstation", "store_route")).toMatchObject({
  workflowType: "store_route",
  storeStatus: "pending",
  packStatus: "blocked",
  queueStatus: "preparing"
});
expect(initialPreparationStatuses("outstation", "direct_pack")).toMatchObject({
  storeStatus: "skipped",
  packStatus: "pending"
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: FAIL because route resolution functions do not exist.

- [ ] **Step 3: Implement route/status resolution**

```js
export function resolvePreparationRoute(deliveryMethod, workflowType) {
  if (deliveryMethod === "outstation") return ["direct_pack", "store_route"].includes(workflowType) ? workflowType : "direct_pack";
  if (deliveryMethod === "company_driver" && workflowType === "direct_driver") return "direct_driver";
  return workflowType === "direct_pack" ? "direct_pack" : "store_route";
}

export function initialPreparationStatuses(deliveryMethod, requestedWorkflowType) {
  const workflowType = resolvePreparationRoute(deliveryMethod, requestedWorkflowType);
  const directDriver = deliveryMethod === "company_driver" && workflowType === "direct_driver";
  return {
    workflowType,
    storeStatus: directDriver || workflowType === "direct_pack" ? "skipped" : "pending",
    packStatus: directDriver ? "skipped" : workflowType === "direct_pack" ? "pending" : "blocked",
    queueStatus: directDriver ? "queued" : "preparing",
    status: directDriver ? "รอคนขับรับ" : "รอจัดเตรียมสินค้า",
    urgentDelivery: directDriver
  };
}
```

- [ ] **Step 4: Apply the resolver in the create API**

Replace the forced outstation `direct_pack` expression with `initialPreparationStatuses(deliveryMethod, order.workflowType)`. Persist its returned workflow and statuses in `next`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: all tests pass, including default direct-pack and selected store-route cases.

---

### Task 3: Sales confirmation UI and workflow enforcement

**Files:**
- Modify: `app/page.jsx:2647-2729`
- Modify: `app/page.jsx:7122-7174`

**Interfaces:**
- Consumes from Task 2: `initialPreparationStatuses(deliveryMethod, workflowType)`
- Produces: confirmed order payload that preserves the selected outstation route.

- [ ] **Step 1: Use shared status resolution when preparing and confirming an order**

In both `prepareOrder` and `confirmOrder`, compute:

```js
const preparation = initialPreparationStatuses(order.deliveryMethod, order.workflowType);
const orderToCreate = { ...order, ...preparation };
```

Remove `pendingOrder.deliveryMethod === "outstation" ? "direct_pack" : ...` so confirmation cannot overwrite the selected `store_route`.

- [ ] **Step 2: Unlock the route selector for outstation**

Keep the selector enabled and show only valid choices:

```jsx
<select value={pendingOrder.workflowType} onChange={event => setPendingOrder(order => ({ ...order, workflowType: event.target.value }))}>
  <option value="direct_pack">ส่งตรงห้องแพ็ค</option>
  <option value="store_route">ผ่านสโตร์ก่อน แล้วส่งห้องแพ็ค</option>
  {pendingOrder.deliveryMethod === "company_driver" && <option value="direct_driver">🚨 ส่งตรงคนขับทันที (เร่งด่วน)</option>}
</select>
```

When delivery method changes to outstation, set `workflowType: "direct_pack"` as the explicit UI default while still allowing the user to change it afterward.

- [ ] **Step 3: Show selected route in the confirmation summary**

Render **ส่งตรงห้องแพ็ค** or **ผ่านสโตร์ก่อน แล้วส่งห้องแพ็ค** beside the outstation carrier so sales can verify the choice before saving.

- [ ] **Step 4: Preserve pack gate for via-store outstation**

Modify `app/api/orders/workflow/route.js:132` so `deliveryMethod === "outstation"` bypasses store only when `workflowType === "direct_pack"`. A `store_route` outstation order must have store status `checked` or `partial` before pack can update it.

- [ ] **Step 5: Run focused tests**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: all unit tests pass.

---

### Task 4: Sales alerts and deterministic page routing

**Files:**
- Modify: `app/page.jsx:1814-1913`
- Modify: `app/page.jsx:4570-4576`
- Modify: `app/page.jsx:5335-5341`
- Modify: `app/page.jsx:5487-5524`
- Modify: `tests/unit/core.test.js`

**Interfaces:**
- Consumes from Task 1: all classification functions.
- Produces: shared derived arrays for Chiang Mai, waiting alerts, active outstation, and ready outstation.

- [ ] **Step 1: Replace inline page filters with policy functions**

Derive:

```js
const chiangmaiPreparationOrders = orders.filter(isChiangmaiPreparationOrder);
const salesWaitingOrders = orders.filter(isSalesWaitingAlert).sort(byLatestUpdate);
const salesOutstationOrders = orders.filter(order => isOutstationOrder(order) && !["outstation_ready", "pack_archived"].includes(order.queueStatus));
const salesOutstationHistory = orders.filter(order => isOutstationOrder(order) && order.queueStatus === "outstation_ready");
```

- [ ] **Step 2: Add the sales sidebar warning badge**

On **เตรียมออเดอร์เชียงใหม่**, retain the active count and add a red/orange warning badge using `salesWaitingOrders.length`. The aria label must identify it as waiting/incomplete work.

- [ ] **Step 3: Add the read-only warning panel to Chiang Mai**

Reuse the existing sales dashboard card fields: order ID, customer, service date, store status, pack status, `missingItems`, and update time. Place the panel above the preparation cards and add no update buttons.

- [ ] **Step 4: Keep dispatch controls status-gated**

Render **ส่งเข้าคิวคนขับ** only through the existing preparation-ready predicate. Waiting/blocked orders in the alert section never receive the button.

- [ ] **Step 5: Label outstation route on sales cards**

Show **ส่งตรงห้องแพ็ค** for `direct_pack` and **ผ่านสโตร์ก่อน** for `store_route` in both active and ready/history cards.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/core.test.js`

Expected: classifiers prevent both outstation variants from entering Chiang Mai and warning counts exclude terminal orders.

---

### Task 5: Full verification and release

**Files:**
- Review all task files; do not edit unrelated files.

- [ ] **Step 1: Run all unit tests**

Run: `npm.cmd test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm.cmd run lint`

Expected: exit code 0 with zero warnings.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`

Expected: Next.js compiles and generates all routes successfully.

- [ ] **Step 4: Validate and review scope**

Run: `git diff --check` and `git diff --stat`.

Expected: no whitespace errors; only `app/page.jsx`, `app/api/orders/create/route.js`, `app/api/orders/workflow/route.js`, `lib/preparationWorkflow.js`, and `tests/unit/core.test.js` contain implementation changes.

- [ ] **Step 5: Commit and push**

```powershell
git add -- app/page.jsx app/api/orders/create/route.js app/api/orders/workflow/route.js lib/preparationWorkflow.js tests/unit/core.test.js docs/superpowers/plans/2026-07-23-sales-preparation-routing.md
git commit -m "fix sales preparation routing and alerts"
git push origin main
```

Expected: local `main` and `origin/main` point to the same new commit; unrelated `repo/` and `repo.worktrees/` remain untracked.

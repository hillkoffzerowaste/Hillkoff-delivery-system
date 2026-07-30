# Forward Driver Queue Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a forward-only queue-expiry policy so newly queued, unaccepted orders disappear from Driver after their Bangkok queue date and become explicitly requeueable by Sales, without mutating legacy or assigned active work.

**Architecture:** Add a small pure policy module that owns version-2 queue fields and visibility selectors. Server queue-entry paths write the policy fields, while Driver and Sales consume the selectors. Legacy documents keep the current behavior because only `driverQueuePolicyVersion: 2` enters the new branches.

**Tech Stack:** Next.js 16, React 19, Firebase Admin/Web SDK, Firestore, Vitest.

## Global Constraints

- Do not migrate, backfill, delete, or rewrite any existing Firestore order.
- Apply expiry only when `driverQueuePolicyVersion === 2`.
- Use `Asia/Bangkok` date semantics.
- Assigned `กำลังส่ง` and `กำลังจัดส่ง` work must remain visible across days.
- All queue-entry paths must write the same version-2 contract.
- Follow red-green-refactor and preserve unrelated `.claude/` user files.

---

### Task 1: Pure forward queue policy

**Files:**
- Create: `lib/driverQueuePolicy.js`
- Create: `tests/unit/driverQueuePolicy.test.js`

**Interfaces:**
- Produces: `DRIVER_QUEUE_POLICY_VERSION`, `buildDriverQueuePolicyPatch(now)`, `isDriverQueueVisibleToDriver(order, today)`, `isExpiredDriverQueueForSales(order, today)`, and `refreshVersionedDriverQueuePatch(order, now)`.

- [ ] **Step 1: Write failing selector and patch tests**

Cover these literal fixtures:

```js
const today = "2026-07-29";
const versioned = {
  driverQueuePolicyVersion: 2,
  driverQueueDate: "2026-07-28",
  queueStatus: "queued",
  status: "รอคนขับรับ",
  driverId: ""
};

expect(isDriverQueueVisibleToDriver(versioned, today)).toBe(false);
expect(isExpiredDriverQueueForSales(versioned, today)).toBe(true);
expect(isDriverQueueVisibleToDriver({ ...versioned, driverId: "driver-1", status: "กำลังส่ง" }, today)).toBe(true);
expect(isDriverQueueVisibleToDriver({ ...versioned, driverQueuePolicyVersion: undefined }, today)).toBe(true);
```

Also assert that `buildDriverQueuePolicyPatch("2026-07-29T01:00:00.000Z")`
returns policy version 2, `driverQueueDate: "2026-07-29"`, the original ISO
timestamp as `queuedAt`, `queueStatus: "queued"`, and `status: "รอคนขับรับ"`.

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js`

Expected: FAIL because `lib/driverQueuePolicy.js` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Use `bangkokDateKey` from `lib/operationsReporting.js`. Require a valid
`YYYY-MM-DD` `today` input in selectors. Expiry applies only to version-2,
unassigned, queued orders. Legacy orders return visible-to-driver and
not-expired-for-Sales.

`refreshVersionedDriverQueuePatch` returns an empty object for legacy orders
and the normal version-2 patch for version-2 orders.

- [ ] **Step 4: Run the new test and verify GREEN**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js`

Expected: PASS.

### Task 2: Write policy fields on every future queue entry

**Files:**
- Modify: `app/api/orders/create/route.js`
- Modify: `app/api/orders/workflow/route.js`
- Modify: `app/api/orders/chiangmai-rounds/queue/route.js`
- Test: `tests/unit/driverQueuePolicy.test.js`

**Interfaces:**
- Consumes: `buildDriverQueuePolicyPatch(now)` and `refreshVersionedDriverQueuePatch(order, now)`.
- Produces: consistent version-2 fields for direct-driver creation, individual queue/requeue, round queue, and version-2 driver cancellation.

- [ ] **Step 1: Add failing queue-entry contract tests**

Add exported pure payload builders only where route behavior cannot be tested
without Firebase. Assert:

```js
expect(buildDriverQueuePolicyPatch(now)).toMatchObject({
  driverQueuePolicyVersion: 2,
  driverQueueDate: "2026-07-29",
  queuedAt: now,
  queueStatus: "queued",
  status: "รอคนขับรับ"
});
expect(refreshVersionedDriverQueuePatch({}, now)).toEqual({});
expect(refreshVersionedDriverQueuePatch({ driverQueuePolicyVersion: 2 }, now))
  .toMatchObject({ driverQueueDate: "2026-07-29" });
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js`

Expected: FAIL on the missing queue-entry integration behavior.

- [ ] **Step 3: Apply minimal server writes**

- In create route, merge `buildDriverQueuePolicyPatch(now)` only when the new
  order starts with `queueStatus === "queued"`.
- In individual Sales queue/requeue, merge the full patch every time.
- In round queue transaction, merge the full patch into each selected order.
- In driver cancel, merge `refreshVersionedDriverQueuePatch(order, now)` so
  legacy orders remain untouched.
- Keep the existing Firestore precondition (`lastUpdateTime`) and round
  transaction checks for concurrency safety.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js tests/unit/core.test.js tests/unit/chiangmaiRounds.test.js`

Expected: PASS.

### Task 3: Driver and Sales visibility

**Files:**
- Modify: `app/page.jsx`
- Test: `tests/unit/driverQueuePolicy.test.js`

**Interfaces:**
- Consumes: `isDriverQueueVisibleToDriver(order, today)` and `isExpiredDriverQueueForSales(order, today)`.
- Produces: Driver hides only expired version-2 unaccepted work; Sales shows a dedicated version-2 expired queue with explicit requeue.

- [ ] **Step 1: Add failing visibility regression tests**

Assert all of the following:

```js
expect(isDriverQueueVisibleToDriver(version2YesterdayUnassigned, today)).toBe(false);
expect(isExpiredDriverQueueForSales(version2YesterdayUnassigned, today)).toBe(true);
expect(isDriverQueueVisibleToDriver(version2YesterdayAssignedActive, today)).toBe(true);
expect(isExpiredDriverQueueForSales(version2YesterdayAssignedActive, today)).toBe(false);
expect(isDriverQueueVisibleToDriver(legacyYesterdayUnassigned, today)).toBe(true);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js`

Expected: FAIL until every selector branch exists.

- [ ] **Step 3: Apply selectors to the UI**

- Import the selectors in `app/page.jsx`.
- Add the driver selector to the "รับออเดอร์ใหม่" filter.
- Compute `expiredDriverQueueOrders` for Sales from the realtime `orders`.
- Render a Sales panel titled `คิวหมดอายุ—รอฝ่ายขายส่งใหม่`.
- Show order ID, customer, service date, previous queue date, and a
  `ส่งเข้าคิวใหม่` button that invokes `updatePreparationWorkflow(order, "queue")`.
- Do not alter `driverDeliveryOrders`; assigned active work remains selected by
  `isDriverDeliveryOrder`.

- [ ] **Step 4: Run targeted tests and verify GREEN**

Run: `npx vitest run tests/unit/driverQueuePolicy.test.js tests/unit/core.test.js`

Expected: PASS.

### Task 4: Integrated verification and release

**Files:**
- Review all task-related files.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verified commit on `main`.

- [ ] **Step 1: Review scope and diff**

Run:

```powershell
git diff --check
git diff --name-only
git status --short
```

Confirm `.claude/` is not staged and no legacy-data script was added.

- [ ] **Step 2: Run targeted and full unit tests**

Run:

```powershell
npx vitest run tests/unit/driverQueuePolicy.test.js tests/unit/core.test.js tests/unit/chiangmaiRounds.test.js
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run static, rules, and build verification**

Run:

```powershell
npm run lint
npm run test:rules
npm run build
```

Expected: all commands exit 0. If Firebase CLI authentication blocks rule tests,
report that exact environmental limitation and do not claim rule tests passed.

- [ ] **Step 4: Commit and push only verified task files**

Stage the plan, policy module, tests, routes, and `app/page.jsx`. Commit:

```powershell
git commit -m "feat: expire future unaccepted driver queues"
git push origin main
```

Do not include `.claude/` or any unrelated file.

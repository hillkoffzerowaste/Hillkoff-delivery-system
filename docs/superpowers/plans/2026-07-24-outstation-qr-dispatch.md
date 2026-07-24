# Outstation QR Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan any printed outstation label from either sales or pack, record each box once, and automatically complete its order after all boxes are scanned.

**Architecture:** A shared label-domain module owns the versioned QR payload and a dispatch-state helper. A protected scan API validates and atomically stores box scans on the matching Firestore order. A reusable client dialog uses the mobile rear camera and sends decoded values to that API; `app/page.jsx` exposes it on both outstation pages.

**Tech Stack:** Next.js App Router, React 19, Firestore Admin SDK, Firebase auth, `qrcode`, `html5-qrcode`, Vitest.

## Global Constraints

- QR payload is exactly `HKO1|<orderId>|<boxIndex>|<boxTotal>`.
- Only `sales`, `pack`, and `admin` profiles may scan.
- Duplicate box scans are idempotent and never increase progress.
- Completion means `status: ส่งสำเร็จ` and `queueStatus: completed`.
- The first accepted QR establishes `outstationDispatchBoxTotal`; subsequent QR payload totals must match it.
- Do not include unrelated untracked workspace files in commits.

---

### Task 1: QR payload and dispatch state domain

**Files:**
- Modify: `lib/outstationLabels.js`
- Create: `lib/outstationDispatch.js`
- Test: `tests/unit/outstationDispatch.test.js`

**Interfaces:**
- Produces `createOutstationQrPayload(item)`, `parseOutstationQrPayload(value)`, and `applyOutstationBoxScan(order, payload, actor, now)`.
- `applyOutstationBoxScan` returns `{ duplicate, complete, scannedCount, expectedCount, patch, scan }`.

- [ ] **Step 1: Write failing payload and idempotency tests**

```js
expect(parseOutstationQrPayload("HKO1|DO-260724-093803260-B81E54A1|1|3"))
  .toEqual({ orderId: "DO-260724-093803260-B81E54A1", boxIndex: 1, boxTotal: 3 });
expect(applyOutstationBoxScan({ boxes: 2, outstationDispatchScans: [] }, payload, actor, now).complete).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/outstationDispatch.test.js`

- [ ] **Step 3: Implement strict parsing and state transition**

```js
const valid = /^HKO1\|([^|/]{1,120})\|(\d{1,5})\|(\d{1,5})$/;
// persist the first payload total, reject later mismatches, append only a newly scanned box
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/unit/outstationDispatch.test.js`

- [ ] **Step 5: Commit domain changes**

```bash
git add lib/outstationLabels.js lib/outstationDispatch.js tests/unit/outstationDispatch.test.js
git commit -m "feat: add outstation QR dispatch domain"
```

### Task 2: Protected scan endpoint

**Files:**
- Create: `app/api/outstation-dispatch/scan/route.js`
- Modify: `tests/unit/outstationDispatch.test.js`

**Interfaces:**
- Consumes POST body `{ qrPayload: string }` and authenticated sales/pack/admin profile.
- Returns `{ ok: true, data: { order, duplicate, complete, scannedCount, expectedCount } }`.

- [ ] **Step 1: Write failing endpoint helpers tests**

```js
expect(validateOutstationDispatchOrder({ deliveryMethod: "outstation", queueStatus: "outstation_ready" })).toBe(true);
expect(validateOutstationDispatchOrder({ deliveryMethod: "company_driver" })).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/outstationDispatch.test.js`

- [ ] **Step 3: Implement endpoint with Firestore transaction**

```js
await db.runTransaction(async transaction => {
  const snap = await transaction.get(ref);
  const result = applyOutstationBoxScan(snap.data(), payload, profile, now);
  transaction.update(ref, result.patch);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/unit/outstationDispatch.test.js`

- [ ] **Step 5: Commit endpoint changes**

```bash
git add app/api/outstation-dispatch/scan/route.js tests/unit/outstationDispatch.test.js
git commit -m "feat: record outstation QR dispatch scans"
```

### Task 3: QR label and mobile scanner interface

**Files:**
- Modify: `package.json`, `package-lock.json`, `app/components/OutstationLabelPreview.jsx`, `app/page.jsx`, `app/globals.css`
- Create: `app/components/OutstationQrScannerDialog.jsx`
- Test: `tests/unit/outstationLabelPreview.test.jsx`

**Interfaces:**
- `OutstationQrScannerDialog({ apiFetch, onClose, onScanned })` calls `onScanned(order)` after an accepted scan.
- QR image uses `createOutstationQrPayload(item)`.

- [ ] **Step 1: Write failing render tests**

```jsx
expect(renderToStaticMarkup(<OutstationLabelPreview items={[label(1, 3)]} />)).toContain("outstation-label-qr");
expect(renderToStaticMarkup(<OutstationQrScannerDialog apiFetch={fetch} onClose={() => {}} />)).toContain("เปิดกล้องสแกน QR");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx`

- [ ] **Step 3: Install `qrcode` and `html5-qrcode`, then implement QR and scanner**

```js
const scanner = new Html5Qrcode("outstation-qr-camera");
await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 240 }, submitPayload);
```

- [ ] **Step 4: Add one scanner button to sales and pack outstation headers**

```jsx
<button className="secondary" onClick={() => setShowOutstationQrScanner(true)}>เปิดกล้องสแกน QR</button>
```

- [ ] **Step 5: Run targeted tests**

Run: `npm.cmd test -- tests/unit/outstationDispatch.test.js tests/unit/outstationLabelPreview.test.jsx`

- [ ] **Step 6: Commit UI changes**

```bash
git add package.json package-lock.json app/components/OutstationQrScannerDialog.jsx app/components/OutstationLabelPreview.jsx app/page.jsx app/globals.css tests/unit/outstationLabelPreview.test.jsx
git commit -m "feat: scan outstation QR dispatches on mobile"
```

### Task 4: Final verification and release

**Files:**
- Modify only files from Tasks 1-3 if a verification failure requires repair.

- [ ] **Step 1: Run complete validation**

Run: `npm.cmd run check`
Expected: ESLint succeeds, all Vitest tests pass, and Next.js production build succeeds.

- [ ] **Step 2: Inspect release scope**

Run: `git diff origin/main...HEAD --check` and `git status -sb`
Expected: only QR dispatch files and the approved design/plan docs are committed; unrelated untracked directories remain unstaged.

- [ ] **Step 3: Push main**

```bash
git push origin main
```

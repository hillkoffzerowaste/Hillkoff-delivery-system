# Hillkoff Operations Dashboard, Vehicle Report, Accounting Access, and Chiang Mai Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing vehicle-inspection report page completely, add accounting-only access to that page, improve the sales dispatch dashboard, and add sales-managed Chiang Mai delivery rounds without changing the existing driver, store, or pack workflows.

**Architecture:** Keep Firestore as the operational database and preserve the existing driver write collections. New report, master-data, dispatch-summary, and bulk-round operations go through server APIs guarded by `requireProfile`; accounting receives no direct Firestore access. Extract the two large replacement interfaces into focused React components so `app/page.jsx` remains the integration shell rather than absorbing another large inline workspace.

**Tech Stack:** Next.js 16 App Router, React 19, Firebase Authentication, Firestore/Admin SDK, Vitest, Firebase Rules Unit Testing, ESLint, CSV UTF-8 with BOM, Asia/Bangkok business dates.

## Global Constraints

- Replace the current `driver-sop-report` UI completely; do not retain the current today-only cards, completed/missing tables, TXT copy, or TXT download inside the new report page.
- Preserve the driver pages and their current steps for vehicle start, mileage segments, vehicle end, daily inspection, weekly inspection, and fuel entry.
- Preserve store and pack workflows exactly; store and pack never select Tuesday, Wednesday, or Friday rounds.
- Sales assigns exactly one Chiang Mai round to an order; valid round codes are `tuesday`, `wednesday`, and `friday`.
- The sales dispatch dashboard date filter uses the order `createdAt` date in `Asia/Bangkok`.
- The three new dispatch cards are named `เชียงใหม่รอจัดส่ง`, `เชียงใหม่ค้างส่ง`, and `ต่างจังหวัดรอจัดส่ง`.
- Accounting signs in with Google + OTP using an approved `@hillkoff.com` account and may access only the vehicle-inspection report workspace and its APIs.
- Accounting, sales, and admin may use every control inside the new vehicle report, including filters, master-data changes, and CSV export.
- CSV export supports individually selected report rows and every row matching the active filters.
- Historical records are never hard-deleted. Driver and vehicle deletion means `active: false` plus audit metadata.
- Existing order, assessment, mileage, and fuel records remain unchanged. New fields are additive.
- New timestamps and date keys use `Asia/Bangkok`; persisted operational timestamps remain ISO strings or Firestore server timestamps following the existing collection convention.
- `repo/`, `repo.worktrees/`, `.env.local`, logs, backups, and unrelated user files remain untouched.

## Confirmed Current-State Evidence

- The active application is the repository root and is a Next.js/Firebase application. `package.json` has no Supabase runtime dependency; `supabase-setup.sql` is legacy setup material, not the active data path.
- The existing report is an inline block in `app/page.jsx:6574` and reads only `driver_daily_assessments` for the current `serviceDate` through `app/api/driver-assessments/today/route.js`.
- Driver vehicle activity already writes to `vehicle_usage_events`; fuel entries already write to `fuel_bills`; daily inspection entries already write to `driver_daily_assessments`.
- The live Firestore project contained, at discovery time:
  - `driver_daily_assessments`: 54 documents, 2026-06-02 through 2026-07-25.
  - `driver_weekly_assessments`: 8 documents.
  - `vehicle_usage_events`: 218 documents, 2026-07-05 through 2026-07-26, covering 10 vehicles and 6 drivers.
  - `fuel_bills`: 4 documents, covering 3 vehicles.
  - `orders`: 1,737 documents, all with `createdAt` and `serviceDate`.
  - `users`: 38 documents; current roles are driver, sales, store, pack, and admin. No accounting role exists.
- `vehicle_usage_events` includes 100 start, 105 end, and 13 segment events. Forty-two end events are automatic closes and must remain visibly flagged in report details.
- `orders` does not currently persist the vehicle used for delivery. Historical delivered orders can be inferred to one vehicle for 448 orders, are ambiguous across multiple vehicles for 35 orders, and have no matching usage record for 884 orders. The report must disclose these groups rather than assign a vehicle by guess.
- The static vehicle master in `lib/vehicleMaster.js` contains 21 records. There is no live `vehicle_master` collection.
- `users_by_phone` is the canonical driver-login profile source. The legacy `drivers` collection contains only nine compatibility records and must not become a second authoritative master.

## Shared Data Contracts

### Vehicle master document

```js
{
  id: "AS541-6101-0001",
  assetCode: "AS541-6101-0001",
  plate: "ทะเบียนรถ",
  vehicleType: "ประเภทรถ",
  brand: "TOYOTA",
  model: "Hilux Revo",
  responsiblePerson: "ผู้ครอบครองทรัพย์สิน",
  department: "หน่วยงาน",
  active: true,
  createdAt: "ISO timestamp",
  createdBy: "uid/email",
  updatedAt: "ISO timestamp",
  updatedBy: "uid/email",
  disabledAt: "",
  disabledBy: ""
}
```

### New delivery snapshot fields on a completed order

```js
{
  deliveryServiceDate: "2026-07-26",
  deliveryVehicleId: "AS541-6101-0001",
  deliveryVehiclePlate: "ทะเบียนรถ",
  deliveryVehicleName: "ทะเบียนรถ · TOYOTA Hilux Revo",
  deliveryVehicleSource: "driver-usage-exact"
}
```

If no unique current vehicle can be verified, persist:

```js
{
  deliveryServiceDate: "2026-07-26",
  deliveryVehicleId: "",
  deliveryVehiclePlate: "",
  deliveryVehicleName: "",
  deliveryVehicleSource: "unresolved"
}
```

### Chiang Mai round fields

```js
{
  chiangmaiRoundCode: "tuesday",
  chiangmaiRoundDate: "2026-07-28",
  chiangmaiRoundAssignedAt: "ISO timestamp",
  chiangmaiRoundAssignedBy: "sales name/email"
}
```

### Daily vehicle report row

```js
{
  id: "2026-07-26|AS541-6101-0001|driver_0812345678",
  serviceDate: "2026-07-26",
  vehicleId: "AS541-6101-0001",
  assetCode: "AS541-6101-0001",
  plate: "ทะเบียนรถ",
  responsiblePerson: "ผู้ครอบครองทรัพย์สิน",
  driverId: "driver_0812345678",
  driverName: "ชื่อคนขับ",
  odometerStart: 120000,
  odometerEnd: 120145,
  distanceKm: 145,
  inspectionStatus: "completed",
  usageEventCount: 3,
  autoClosed: false,
  fuelLiters: 35.5,
  fuelAmount: 1200,
  deliveredOrders: 14,
  cityOrders: 11,
  outstationOrders: 3,
  vehicleLinkStatus: "exact"
}
```

`vehicleLinkStatus` is one of `exact`, `historical-single-vehicle`, `ambiguous`, or `unallocated`.

---

## Phase 1 — Baseline Contracts and Regression Harness

### Task 1: Freeze date, area, order-state, and report-link policies

**Files:**
- Create: `lib/operationsReporting.js`
- Create: `tests/unit/operationsReporting.test.js`
- Modify: `lib/preparationWorkflow.js`
- Modify: `tests/unit/core.test.js`

**Interfaces:**
- Produces: `bangkokDateKey(value): string`
- Produces: `orderCreatedDateKey(order): string`
- Produces: `orderDeliveryDateKey(order): string`
- Produces: `classifyOrderArea(order): "city" | "outstation"`
- Produces: `isTerminalDeliveryOrder(order): boolean`
- Produces: `isChiangmaiWaitingForDate(order, selectedDate): boolean`
- Produces: `isChiangmaiBacklogForDate(order, selectedDate): boolean`
- Produces: `isOutstationWaitingForDate(order, selectedDate): boolean`
- Preserves: all existing exports from `lib/preparationWorkflow.js`.

- [ ] **Step 1: Write failing business-date tests**

```js
expect(orderCreatedDateKey({ createdAt: "2026-07-25T18:30:00.000Z" })).toBe("2026-07-26");
expect(orderDeliveryDateKey({ deliveryServiceDate: "2026-07-26" })).toBe("2026-07-26");
expect(orderDeliveryDateKey({ deliveredAt: "26/7/2569 10:30:00", serviceDate: "2026-07-25" })).toBe("2026-07-26");
expect(orderDeliveryDateKey({ deliveredAt: "", serviceDate: "2026-07-25" })).toBe("2026-07-25");
```

- [ ] **Step 2: Write failing card-policy tests**

```js
const waiting = { createdAt: "2026-07-26T02:00:00.000Z", zone: "เมืองเชียงใหม่", status: "รอคนขับรับ" };
const backlog = { createdAt: "2026-07-25T02:00:00.000Z", zone: "เมืองเชียงใหม่", status: "กำลังส่ง" };
const outstation = { createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "outstation", status: "พร้อมส่งขนส่ง" };
expect(isChiangmaiWaitingForDate(waiting, "2026-07-26")).toBe(true);
expect(isChiangmaiBacklogForDate(backlog, "2026-07-26")).toBe(true);
expect(isOutstationWaitingForDate(outstation, "2026-07-26")).toBe(true);
expect(isChiangmaiWaitingForDate({ ...waiting, status: "ยกเลิก" }, "2026-07-26")).toBe(false);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/operationsReporting.test.js tests/unit/core.test.js`

Expected: FAIL because the new policy module and exports do not exist.

- [ ] **Step 4: Implement the pure policy**

Use these exact terminal values:

```js
const TERMINAL_STATUSES = new Set(["ส่งสำเร็จ", "ยกเลิก", "Grab รับสินค้าแล้ว", "ลูกค้ารับสินค้าแล้ว"]);
const TERMINAL_QUEUE_STATUSES = new Set(["completed", "grab_completed", "grab_picked_up", "pack_archived", "driver_archived"]);
```

`classifyOrderArea` returns `outstation` when `isOutstationOrder(order)` is true or when the normalized zone is outside the Chiang Mai operating group. It returns `city` for `เมืองเชียงใหม่`, nearby Chiang Mai districts, and company-driver Chiang Mai work.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/operationsReporting.test.js tests/unit/core.test.js`

Expected: all focused tests pass.

### Task 2: Add API and role regression fixtures before feature code

**Files:**
- Modify: `tests/firestore.rules.test.js`
- Create: `tests/unit/accountingAuth.test.js`
- Create: `tests/unit/vehicleReportRoute.test.js`
- Create: `tests/unit/chiangmaiRoundRoute.test.js`

**Interfaces:**
- Establishes mocked `accounting`, `sales`, `admin`, `driver`, `store`, and `pack` profiles for route tests.
- Establishes that accounting cannot read operational Firestore collections directly.

- [ ] **Step 1: Add a Firestore least-privilege test**

```js
await seedProfile("accounting-1", "accounting", { email: "accounting@hillkoff.com" });
await seed("orders/O-ACCOUNTING", { status: "รอคนขับรับ" });
await assertFails(getDoc(doc(dbFor("accounting-1"), "orders/O-ACCOUNTING")));
```

- [ ] **Step 2: Add route authorization tests**

The report route must accept sales, admin, and accounting; it must reject driver, store, and pack. The Chiang Mai round routes must accept sales and admin only.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/accountingAuth.test.js tests/unit/vehicleReportRoute.test.js tests/unit/chiangmaiRoundRoute.test.js`

Expected: FAIL because the new routes and role handling do not exist.

---

## Phase 2 — Additive Data Foundation and Vehicle Master

### Task 3: Introduce a dynamic vehicle repository with static fallback

**Files:**
- Create: `lib/vehicleRepository.js`
- Modify: `lib/vehicleMaster.js`
- Create: `tests/unit/vehicleRepository.test.js`
- Create: `scripts/seed-vehicle-master.mjs`

**Interfaces:**
- Produces: `listVehicles(db, { includeInactive = false }): Promise<Vehicle[]>`
- Produces: `resolveVehicle(db, vehicleId, { includeInactive = false }): Promise<Vehicle | null>`
- Preserves: `HILLKOFF_VEHICLES`, `findVehicleById`, and `vehicleDisplayName` as offline/static fallback APIs.

- [ ] **Step 1: Write failing repository tests**

```js
await expect(listVehicles(db, { includeInactive: false })).resolves.toEqual([
  expect.objectContaining({ id: "AS541-6101-0001", active: true })
]);
await expect(resolveVehicle(emptyDb, "AS541-6101-0001")).resolves.toMatchObject({
  id: "AS541-6101-0001"
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleRepository.test.js`

Expected: FAIL because `lib/vehicleRepository.js` does not exist.

- [ ] **Step 3: Implement Firestore-first, static-fallback reads**

Read `vehicle_master` first. If the collection is empty or unavailable, map `HILLKOFF_VEHICLES` to active records. Never mutate static objects.

- [ ] **Step 4: Add a dry-run seed script**

Default invocation prints the number of static vehicles and proposed document IDs without writing:

Run: `node scripts/seed-vehicle-master.mjs`

Apply invocation writes the 21 static vehicles with merge semantics:

Run: `node scripts/seed-vehicle-master.mjs --apply`

The script must never delete a `vehicle_master` document.

- [ ] **Step 5: Run repository tests and dry-run seed**

Run: `npm.cmd test -- --run tests/unit/vehicleRepository.test.js`

Run: `node scripts/seed-vehicle-master.mjs`

Expected: tests pass; dry run reports 21 proposed records and zero writes.

### Task 4: Use the dynamic vehicle master without changing driver steps

**Files:**
- Create: `app/api/vehicle-master/route.js`
- Modify: `app/api/vehicle-usage/submit/route.js`
- Modify: `app/api/fuel-bills/submit/route.js`
- Modify: `app/api/driver-assessments/submit/route.js`
- Modify: `app/page.jsx`
- Create: `tests/unit/vehicleMasterRoute.test.js`

**Interfaces:**
- `GET /api/vehicle-master` returns active vehicles for driver, sales, admin, and accounting.
- `GET /api/vehicle-master?includeInactive=true` is limited to sales, admin, and accounting.
- Existing submit APIs consume `resolveVehicle(db, vehicleId)` and retain their current payload and response contracts.

- [ ] **Step 1: Write failing GET and fallback tests**

Verify driver receives active vehicles only and that a missing live master still resolves a known static asset code.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleMasterRoute.test.js tests/unit/vehicleRepository.test.js`

- [ ] **Step 3: Implement the read endpoint and async vehicle resolution**

Do not change driver authentication, validation limits, collection names, Google Apps Script synchronization, or response messages.

- [ ] **Step 4: Replace the driver vehicle dropdown source**

Add `availableVehicles` state in `app/page.jsx`. Load `/api/vehicle-master` only for the driver vehicle and driver inspection tabs. Use `HILLKOFF_VEHICLES` if the request fails, so the current driver workflow remains usable during rollout or rollback.

- [ ] **Step 5: Run driver-related unit tests**

Run: `npm.cmd test -- --run tests/unit/core.test.js tests/unit/vehicleRepository.test.js tests/unit/vehicleMasterRoute.test.js`

Expected: all tests pass and existing driver payloads remain compatible.

### Task 5: Persist exact vehicle linkage for future completed orders

**Files:**
- Modify: `app/api/orders/workflow/route.js`
- Modify: `lib/operationsReporting.js`
- Modify: `tests/unit/operationsReporting.test.js`
- Create: `tests/unit/orderVehicleSnapshot.test.js`

**Interfaces:**
- Produces: `resolveDeliveryVehicleSnapshot(db, { driverId, deliveryServiceDate }): Promise<DeliveryVehicleSnapshot>`
- Extends only the `driver_complete` patch with the shared delivery snapshot fields.

- [ ] **Step 1: Write failing exact, ambiguous, and unresolved tests**

```js
expect(await resolveDeliveryVehicleSnapshot(oneVehicleDb, input)).toMatchObject({
  deliveryVehicleId: "AS541-6101-0001",
  deliveryVehicleSource: "driver-usage-exact"
});
expect(await resolveDeliveryVehicleSnapshot(twoVehicleDb, input)).toMatchObject({
  deliveryVehicleId: "",
  deliveryVehicleSource: "unresolved"
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/orderVehicleSnapshot.test.js`

- [ ] **Step 3: Resolve the driver’s same-day start event on completion**

Use `deliveryServiceDate = bangkokDateKey(now)`. Query `vehicle_usage_events` by `driverId`, filter to the same `serviceDate`, and accept a vehicle only when the day contains exactly one unique active vehicle ID. Do not select an arbitrary record when two vehicles are present.

- [ ] **Step 4: Add the snapshot to `driver_complete`**

Keep every existing status, queue, rework, POD, history, and sheet-sync behavior unchanged.

- [ ] **Step 5: Run order workflow tests**

Run: `npm.cmd test -- --run tests/unit/orderVehicleSnapshot.test.js tests/unit/core.test.js`

Expected: all tests pass; only completed orders receive the additive snapshot.

---

## Phase 3 — Accounting Google Login and Single-Page Authorization

### Task 6: Add approved accounting Google + OTP authentication

**Files:**
- Modify: `.env.example`
- Modify: `lib/workflowAuth.js`
- Modify: `app/api/auth/google/start/route.js`
- Modify: `app/api/auth/google/verify/route.js`
- Modify: `app/api/auth/validate/route.js`
- Modify: `tests/unit/accountingAuth.test.js`

**Interfaces:**
- Produces: `isHillkoffEmail(email): boolean`
- Produces: `isApprovedAccountingEmail(email): boolean`
- Adds environment setting: `ACCOUNTING_EMAIL_ALLOWLIST=accounting1@hillkoff.com,accounting2@hillkoff.com`
- Adds role: `accounting`.

- [ ] **Step 1: Write failing allowlist and role tests**

```js
expect(isApprovedAccountingEmail("accounting1@hillkoff.com")).toBe(true);
expect(isApprovedAccountingEmail("someone@gmail.com")).toBe(false);
expect(isApprovedAccountingEmail("sales@hillkoff.com")).toBe(false);
```

- [ ] **Step 2: Run auth tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/accountingAuth.test.js`

- [ ] **Step 3: Implement accounting approval**

Require both `@hillkoff.com` and membership in `ACCOUNTING_EMAIL_ALLOWLIST`. Do not allow any Hillkoff user to self-select accounting. Existing `admin` email handling remains higher priority.

- [ ] **Step 4: Extend OTP start, verify, and session validation**

Accepted Google roles become:

```js
["sales", "accounting", "admin"]
```

Password login remains driver-only. Store and pack remain staff-credential-only.

- [ ] **Step 5: Run auth tests**

Run: `npm.cmd test -- --run tests/unit/accountingAuth.test.js`

Expected: approved accounting passes; wrong domain, unapproved Hillkoff email, role mismatch, and disabled profile fail.

### Task 7: Force accounting into the report-only workspace

**Files:**
- Modify: `app/page.jsx`
- Modify: `tests/unit/accountingAuth.test.js`
- Modify: `tests/firestore.rules.test.js`

**Interfaces:**
- `displayTab` is always `driver-sop-report` when `auth.role === "accounting"`.
- Accounting navigation renders only the report button and logout control.
- Accounting never starts orders, customers, locations, chat, route-task, store-report, or driver-assessment Firestore listeners.

- [ ] **Step 1: Add the accounting login choice**

Render an `บัญชี` option beside sales, driver, and store/pack. Accounting uses the same Google + OTP controls and name field as sales.

- [ ] **Step 2: Route accounting after login**

In `applyLoginSession`:

```js
if (newAuthState.role === "accounting") setTab("driver-sop-report");
```

In `displayTab`, force accounting to `driver-sop-report` regardless of localStorage or button state.

- [ ] **Step 3: Restrict the shell**

Display role label `บัญชี`. Render only `รายงานตรวจรถ`; do not render sales cards, chatbot, order actions, settings, reports, or other navigation.

- [ ] **Step 4: Keep direct Firestore denied**

Do not add accounting to Firestore rule read lists. Run the rule test proving that report data is available only through server APIs.

- [ ] **Step 5: Run auth and rules tests**

Run: `npm.cmd test -- --run tests/unit/accountingAuth.test.js`

Run: `npm.cmd run test:rules`

Expected: login routing passes and accounting direct Firestore reads remain denied.

---

## Phase 4 — Completely Replace the Vehicle-Inspection Report Page

### Task 8: Build the report aggregation domain

**Files:**
- Create: `lib/vehicleReport.js`
- Create: `tests/unit/vehicleReport.test.js`

**Interfaces:**
- Produces: `buildVehicleReport(input): VehicleReportResult`
- Produces: `filterVehicleReportRows(rows, filters): VehicleDailyRow[]`
- Produces: `summarizeVehicleMonth(rows, monthKey): VehicleMonthlyRow[]`
- Produces: `vehicleReportRowId(row): string`
- Consumes: date and area policies from `lib/operationsReporting.js`.

- [ ] **Step 1: Write failing mileage aggregation tests**

Verify:

- the first start odometer and final end odometer produce distance;
- segment events do not double-count distance;
- automatic close sets `autoClosed: true`;
- an end odometer below the start produces `distanceKm: null` and a `mileage-regression` warning;
- multiple drivers in one vehicle/day remain separate daily rows.

- [ ] **Step 2: Write failing fuel and order tests**

Verify:

- all fuel bills for the same date, driver, and vehicle are summed;
- orders with a persisted delivery vehicle are `exact`;
- legacy driver/date orders with one usage vehicle are `historical-single-vehicle`;
- legacy groups with two vehicles are counted in driver totals but remain `ambiguous`;
- legacy groups without usage data remain `unallocated`;
- ambiguous and unallocated orders never inflate a vehicle’s monthly total.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleReport.test.js`

- [ ] **Step 4: Implement deterministic aggregation**

Group usage by `serviceDate|vehicleId|driverId`. Preserve historical plate, responsible person, and vehicle name snapshots from the event; use current master data only when a snapshot is absent.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm.cmd test -- --run tests/unit/vehicleReport.test.js`

Expected: all mileage, fuel, order, area, and allocation tests pass.

### Task 9: Add the date-range report API

**Files:**
- Create: `app/api/vehicle-report/query/route.js`
- Modify: `tests/unit/vehicleReportRoute.test.js`

**Interfaces:**
- `POST /api/vehicle-report/query`
- Roles: sales, admin, accounting.
- Request:

```js
{
  startDate: "2026-07-01",
  endDate: "2026-07-31",
  driverId: "",
  vehicleId: "",
  areaType: "all"
}
```

- Response:

```js
{
  ok: true,
  data: {
    filters: {},
    summary: {},
    dailyRows: [],
    monthlyRows: [],
    fuelRows: [],
    drivers: [],
    vehicles: [],
    dataQuality: {
      ambiguousOrderCount: 0,
      unallocatedOrderCount: 0,
      autoClosedUsageCount: 0,
      mileageRegressionCount: 0
    }
  }
}
```

- [ ] **Step 1: Write failing authorization and validation tests**

Reject invalid dates, inverted ranges, ranges longer than 366 days, and unauthorized roles.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleReportRoute.test.js`

- [ ] **Step 3: Query existing collections without changing them**

Read:

- `vehicle_usage_events` by `serviceDate` range;
- `fuel_bills` by `serviceDate` range;
- `driver_daily_assessments` by `serviceDate` range;
- `orders` required for delivery-date reconciliation;
- `users_by_phone` where role is driver;
- `vehicle_master`, with static fallback.

Return serialized ISO-safe values only; never return password hashes, salts, trusted-device hashes, OTP data, customer phone numbers, addresses, or POD data.

- [ ] **Step 4: Run route and aggregation tests**

Run: `npm.cmd test -- --run tests/unit/vehicleReportRoute.test.js tests/unit/vehicleReport.test.js`

Expected: API contracts and calculations pass.

### Task 10: Replace the old report UI with a dedicated component

**Files:**
- Create: `app/components/VehicleInspectionReport.jsx`
- Create: `tests/unit/vehicleInspectionReport.test.jsx`
- Modify: `app/globals.css`
- Modify: `app/page.jsx:820-855`
- Modify: `app/page.jsx:1053-1242`
- Modify: `app/page.jsx:4490-4542`
- Replace: `app/page.jsx:6574-6643`

**Interfaces:**
- Component props:

```js
{
  apiFetch: authenticatedApiFetch,
  role: "sales" | "admin" | "accounting"
}
```

- Component sections: `ภาพรวม`, `รายวัน`, `รายเดือน`, `น้ำมัน`, `ข้อมูลรถและคนขับ`.

- [ ] **Step 1: Write a failing render test**

Render with a fixed API result and assert the new headings, filters, summary cards, daily table, monthly table, fuel table, data-quality warning, row checkboxes, and CSV actions. Assert the old `ทำแบบประเมินแล้ว`, `ยังไม่ได้ทำ`, and `ดาวน์โหลด TXT` report controls are absent.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleInspectionReport.test.jsx`

- [ ] **Step 3: Build the new report component**

Default to the current Bangkok month. Support day, date range, month, driver, vehicle, owner, and area filters. Render loading, empty, error, and retry states.

- [ ] **Step 4: Remove the entire old report implementation**

Remove report-only state:

- `driverAssessments`;
- `driverAssessmentDrivers`;
- `driverAssessmentRoster`;
- `todayAssessmentByDriver`;
- `buildDriverAssessmentReport`;
- `exportDriverAssessmentReport`;
- the report-triggered `/api/driver-assessments/today` fetch.

Keep the driver `driver-sop` and `driver-vehicle` workspaces, submit handlers, checklists, and existing APIs.

- [ ] **Step 5: Mount the replacement**

```jsx
{displayTab === "driver-sop-report" && (
  <VehicleInspectionReport apiFetch={authenticatedApiFetch} role={auth.role} />
)}
```

- [ ] **Step 6: Run component and existing driver tests**

Run: `npm.cmd test -- --run tests/unit/vehicleInspectionReport.test.jsx tests/unit/core.test.js`

Expected: the new report renders and driver workflow tests remain green.

---

## Phase 5 — Report Master Data and CSV Export

### Task 11: Add safe driver master management

**Files:**
- Create: `app/api/driver-master/route.js`
- Create: `tests/unit/driverMasterRoute.test.js`
- Modify: `app/components/VehicleInspectionReport.jsx`

**Interfaces:**
- `GET /api/driver-master`
- `POST /api/driver-master`
- `PATCH /api/driver-master`
- `DELETE /api/driver-master`
- Roles: sales, admin, accounting.

- [ ] **Step 1: Write failing CRUD and permission tests**

The API may write only:

- name;
- phone/phoneDigits on create;
- driver profile first name, last name, vehicle description, plate, and zone;
- active/status for soft disable or restore.

It must never return or modify password hashes, salts, trusted devices, UID history, role, or login audit fields.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/driverMasterRoute.test.js`

- [ ] **Step 3: Implement canonical driver updates**

Use `users_by_phone/{phoneDigits}` as canonical. When `uidLast` exists, batch the same public profile fields into `users/{uidLast}`. A new report-side driver is created as:

```js
{
  role: "driver",
  driverId: `driver_${phoneDigits}`,
  active: true,
  status: "pending_activation"
}
```

This creates operational/report identity only and does not generate or expose a password.

- [ ] **Step 4: Implement soft deletion and audit**

DELETE writes `active: false`, `status: "disabled"`, `disabledAt`, and `disabledBy`. Add an `audit_logs` document for create, update, disable, and restore.

- [ ] **Step 5: Add driver management UI**

Provide add, edit, disable, and restore controls under `ข้อมูลรถและคนขับ`. Historical disabled drivers remain available in historical report filters.

- [ ] **Step 6: Run driver master tests**

Run: `npm.cmd test -- --run tests/unit/driverMasterRoute.test.js tests/unit/vehicleInspectionReport.test.jsx`

### Task 12: Add vehicle and owner management

**Files:**
- Modify: `app/api/vehicle-master/route.js`
- Modify: `tests/unit/vehicleMasterRoute.test.js`
- Modify: `app/components/VehicleInspectionReport.jsx`

**Interfaces:**
- `POST`, `PATCH`, and `DELETE /api/vehicle-master`
- Roles: sales, admin, accounting.

- [ ] **Step 1: Write failing mutation tests**

Require unique asset code and normalized plate. Reject a blank responsible person. Verify DELETE soft-disables and does not delete history.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleMasterRoute.test.js`

- [ ] **Step 3: Implement validated mutations**

Persist audit fields and add an `audit_logs` record. Vehicle updates do not rewrite snapshots already stored on usage, fuel, assessment, or order documents.

- [ ] **Step 4: Add vehicle/owner forms**

The same modal edits plate, vehicle description, brand, model, owner, department, and active state.

- [ ] **Step 5: Run component and route tests**

Run: `npm.cmd test -- --run tests/unit/vehicleMasterRoute.test.js tests/unit/vehicleInspectionReport.test.jsx`

### Task 13: Add selected-row and filtered-all CSV export

**Files:**
- Create: `lib/vehicleReportCsv.js`
- Create: `app/api/vehicle-report/export/route.js`
- Create: `tests/unit/vehicleReportCsv.test.js`
- Modify: `app/components/VehicleInspectionReport.jsx`

**Interfaces:**
- Produces: `vehicleReportCsv(rows): string`
- `POST /api/vehicle-report/export`
- Request modes:

```js
{ mode: "selected", rowIds: ["2026-07-26|vehicle|driver"], filters: {} }
{ mode: "filtered", rowIds: [], filters: { startDate, endDate, driverId, vehicleId, areaType } }
```

- [ ] **Step 1: Write failing CSV tests**

Verify UTF-8 BOM, quoted commas/newlines, Thai text, stable column order, and no formula injection for values beginning with `=`, `+`, `-`, or `@`.

- [ ] **Step 2: Run CSV tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleReportCsv.test.js`

- [ ] **Step 3: Implement the CSV schema**

Columns:

```text
วันที่,รหัสทรัพย์สิน,ทะเบียนรถ,ผู้ครอบครองทรัพย์สิน,คนขับ,
เลขไมล์เริ่มต้น,เลขไมล์สิ้นสุด,ระยะทางรวม,
จำนวนออเดอร์ทั้งหมด,ออเดอร์ตัวเมือง,ออเดอร์ต่างจังหวัด,
จำนวนลิตร,ค่าน้ำมัน,สถานะตรวจรถ,สถานะการเชื่อมรถ,หมายเหตุคุณภาพข้อมูล
```

- [ ] **Step 4: Implement selection behavior**

The header checkbox selects every currently filtered row across pagination, not only the visible page. The UI shows the number selected. `ส่งออกรายการที่เลือก` is disabled when zero rows are selected.

- [ ] **Step 5: Implement filtered-all export**

The server rebuilds the report from the supplied filters and exports the full filtered result. It does not trust row totals sent by the browser.

- [ ] **Step 6: Run CSV, report, and route tests**

Run: `npm.cmd test -- --run tests/unit/vehicleReportCsv.test.js tests/unit/vehicleReport.test.js tests/unit/vehicleReportRoute.test.js`

---

## Phase 6 — Sales Dispatch Dashboard by Order-Creation Date

### Task 14: Add the dispatch summary API and pure card calculations

**Files:**
- Create: `lib/dispatchDashboard.js`
- Create: `app/api/orders/dispatch-dashboard/route.js`
- Create: `tests/unit/dispatchDashboard.test.js`
- Create: `tests/unit/dispatchDashboardRoute.test.js`

**Interfaces:**
- `POST /api/orders/dispatch-dashboard`
- Roles: sales, admin.
- Request:

```js
{ selectedDate: "2026-07-26" }
```

- Response:

```js
{
  ok: true,
  data: {
    selectedDate: "2026-07-26",
    availableDates: ["2026-07-26", "2026-07-25"],
    cards: {
      created: 0,
      waitingDriver: 0,
      activeDelivery: 0,
      delivered: 0,
      routeTasks: 0,
      chiangmaiWaiting: 0,
      chiangmaiBacklog: 0,
      outstationWaiting: 0
    },
    orders: [],
    driverLoads: []
  }
}
```

- [ ] **Step 1: Write failing card and date tests**

Verify `createdAt` Bangkok boundaries, the three confirmed card names, terminal exclusions, and backlog relative to the selected date.

- [ ] **Step 2: Write failing route authorization tests**

Accounting, driver, store, and pack receive 403.

- [ ] **Step 3: Run tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/dispatchDashboard.test.js tests/unit/dispatchDashboardRoute.test.js`

- [ ] **Step 4: Implement bounded server reads**

Build available dates from the most recent 120 Bangkok days. Return full order detail only for the selected date and active backlog. Do not return hidden auth, customer history, chat, or report data.

- [ ] **Step 5: Build driver daily loads**

Group by assigned `driverId` for the selected created date and return total, waiting, active, delivered, city, and outstation counts.

- [ ] **Step 6: Run focused tests**

Run: `npm.cmd test -- --run tests/unit/dispatchDashboard.test.js tests/unit/dispatchDashboardRoute.test.js`

### Task 15: Replace the current dispatch workspace

**Files:**
- Create: `app/components/DispatchDashboard.jsx`
- Create: `tests/unit/dispatchDashboardComponent.test.jsx`
- Modify: `app/globals.css`
- Modify: `app/page.jsx:751`
- Modify: `app/page.jsx:2322-2331`
- Modify: `app/page.jsx:4833-4841`
- Replace: `app/page.jsx:5767-5840`

**Interfaces:**
- Component props:

```js
{
  apiFetch: authenticatedApiFetch,
  role: "sales" | "admin",
  onDeleteOrder,
  onResetOrders
}
```

- [ ] **Step 1: Write a failing component test**

Assert:

- date select replaces area select;
- eight cards render;
- each order shows its creation date;
- driver load shows daily orders instead of instructions;
- `วิธีใช้งานเร็ว` is absent.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/dispatchDashboardComponent.test.jsx`

- [ ] **Step 3: Build the extracted dashboard**

Keep text search and status filter. Replace `orderZoneFilter` with `orderCreatedDateFilter`. Refresh after delete/reset and poll every 60 seconds while the tab is visible.

- [ ] **Step 4: Prevent duplicate global cards**

Exclude `displayTab === "dispatch"` from the existing global five-card block; the extracted dashboard owns all eight cards on that page.

- [ ] **Step 5: Replace the right panel**

Render `ออเดอร์ปัจจุบันแบบรายวัน`, grouped by driver, with selected date, plate, total, city, outstation, and status counts.

- [ ] **Step 6: Run dashboard and existing order tests**

Run: `npm.cmd test -- --run tests/unit/dispatchDashboardComponent.test.jsx tests/unit/dispatchDashboard.test.js tests/unit/core.test.js`

---

## Phase 7 — Sales-Managed Chiang Mai Rounds and One-Click Queueing

### Task 16: Validate and persist one round per Chiang Mai order

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Modify: `app/api/orders/create/route.js`
- Create: `app/api/orders/chiangmai-rounds/route.js`
- Modify: `tests/unit/core.test.js`
- Modify: `tests/unit/chiangmaiRoundRoute.test.js`

**Interfaces:**
- Produces: `CHIANGMAI_ROUND_CODES = ["tuesday", "wednesday", "friday"]`
- Produces: `resolveNextRoundDate(orderCreatedDate, roundCode): string`
- `PATCH /api/orders/chiangmai-rounds` assigns or changes one order’s round.
- Roles: sales, admin.

- [ ] **Step 1: Write failing round-date tests**

```js
expect(resolveNextRoundDate("2026-07-26", "tuesday")).toBe("2026-07-28");
expect(resolveNextRoundDate("2026-07-26", "wednesday")).toBe("2026-07-29");
expect(resolveNextRoundDate("2026-07-26", "friday")).toBe("2026-07-31");
```

Reject unknown codes, invalid dates, outstation orders, pickup orders, and terminal orders.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/core.test.js tests/unit/chiangmaiRoundRoute.test.js`

- [ ] **Step 3: Persist round fields during order creation**

The confirmation payload may include one round code. The create API validates it and calculates the explicit round date. Orders without a selected round remain valid and appear in a sales-only `ยังไม่กำหนดรอบ` group; store and pack behavior is unchanged.

- [ ] **Step 4: Implement reassignment**

PATCH updates only the four round fields and appends workflow/audit history. It does not change store status, pack status, queue status, or order status.

- [ ] **Step 5: Run route and workflow tests**

Run: `npm.cmd test -- --run tests/unit/core.test.js tests/unit/chiangmaiRoundRoute.test.js`

### Task 17: Add the three sales filters and round controls

**Files:**
- Modify: `app/page.jsx`
- Create: `tests/unit/chiangmaiRounds.test.jsx`

**Interfaces:**
- Filters: Tuesday, Wednesday, Friday.
- One order displays in exactly one round-date group.

- [ ] **Step 1: Write a failing render test**

Assert the three round controls, actual date labels, unassigned warning group, per-round counts, and no round controls in store or pack workspaces.

- [ ] **Step 2: Run component test and verify RED**

Run: `npm.cmd test -- --run tests/unit/chiangmaiRounds.test.jsx`

- [ ] **Step 3: Add round selection to sales confirmation**

For Chiang Mai company-driver orders, render one required selection with three options:

```text
รอบวันอังคาร · 28/07/2026
รอบวันพุธ · 29/07/2026
รอบวันศุกร์ · 31/07/2026
```

Do not render this control for outstation, Grab, or customer pickup.

- [ ] **Step 4: Group the Chiang Mai sales page**

Sales filters by round code and explicit round date. Unassigned legacy/current orders remain visible to sales with a `กำหนดรอบ` action.

- [ ] **Step 5: Verify store and pack remain unchanged**

Search the store and pack render blocks and confirm no round selector, filter, write, or required validation was introduced.

- [ ] **Step 6: Run round UI tests**

Run: `npm.cmd test -- --run tests/unit/chiangmaiRounds.test.jsx tests/unit/core.test.js`

### Task 18: Add atomic “พร้อมจัดส่งทั้งหมด” per round date

**Files:**
- Create: `app/api/orders/chiangmai-rounds/queue/route.js`
- Modify: `app/page.jsx`
- Modify: `tests/unit/chiangmaiRoundRoute.test.js`

**Interfaces:**
- `POST /api/orders/chiangmai-rounds/queue`
- Request:

```js
{ roundCode: "tuesday", roundDate: "2026-07-28" }
```

- Roles: sales, admin.

- [ ] **Step 1: Write failing eligibility tests**

The bulk action is enabled only when every active order in the exact round date:

- is a Chiang Mai company-driver order;
- has store ready or direct-pack status;
- has pack status `checked` or `partial`;
- has no unresolved rework;
- is not already queued, completed, archived, cancelled, or assigned to a driver.

- [ ] **Step 2: Run route tests and verify RED**

Run: `npm.cmd test -- --run tests/unit/chiangmaiRoundRoute.test.js`

- [ ] **Step 3: Implement preflight and bounded transaction**

Return 409 with explicit blocking order IDs when any order is not ready. Limit one bulk operation to 200 orders so order updates and activity documents remain below Firestore transaction write limits.

- [ ] **Step 4: Apply the existing queue transition**

For every order:

```js
{
  queueStatus: "queued",
  status: "รอคนขับรับ",
  queuedAt: now,
  queuedBy: profile.name || profile.email,
  updatedAt: now
}
```

Append an activity record with `action: "queue_round_bulk"`, round code, round date, and batch ID. Send one summary push notification after commit rather than one notification per order.

- [ ] **Step 5: Add the sales button and confirmation**

Show counts `พร้อม`, `ยังไม่พร้อม`, and `รวม`. Disable the button while any blocking order remains. After success, refresh the exact round group.

- [ ] **Step 6: Run bulk and single-order regression tests**

Run: `npm.cmd test -- --run tests/unit/chiangmaiRoundRoute.test.js tests/unit/core.test.js`

Expected: bulk round queueing passes and the ordinary single-order `queue` action still behaves identically.

---

## Phase 8 — Integrated Verification, Data Reconciliation, and Controlled Release

### Task 19: Run full automated verification

**Files:**
- Review every file changed in Phases 1–7.
- Do not edit unrelated files to make checks pass.

- [ ] **Step 1: Run all unit tests**

Run: `npm.cmd test`

Expected: zero failed tests.

- [ ] **Step 2: Run Firestore rules tests**

Run: `npm.cmd run test:rules`

Expected: accounting direct reads fail; existing sales, driver, store, pack, and admin rule cases pass.

- [ ] **Step 3: Run lint**

Run: `npm.cmd run lint`

Expected: exit code 0 and zero warnings.

- [ ] **Step 4: Run production build**

Run: `npm.cmd run build`

Expected: Next.js compiles every route and component successfully.

- [ ] **Step 5: Validate repository scope**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; no `.env.local`, logs, backup data, `repo/`, or `repo.worktrees/` files are staged.

### Task 20: Reconcile calculations against live Firestore before release

**Files:**
- Create: `scripts/audit-vehicle-report.mjs`
- Create: `docs/vehicle-report-data-quality.md`

**Interfaces:**
- Dry-run audit only; no writes.

- [ ] **Step 1: Compare collection counts**

Report counts and date ranges for assessments, usage events, fuel bills, completed orders, vehicle-linked orders, ambiguous orders, and unallocated orders.

- [ ] **Step 2: Reconcile three sample dates**

For the earliest usage date, a middle date, and the latest date, compare:

- raw usage start/end events against calculated distance;
- raw fuel documents against fuel totals;
- delivered orders by driver/date against report totals;
- city plus outstation totals against total delivered orders.

- [ ] **Step 3: Document known historical limitations**

State that vehicle-level historical order totals are exact only where the order has a delivery vehicle snapshot or the driver/day maps to one unique vehicle. Ambiguous and unallocated counts remain visible and are not silently attached to a vehicle.

### Task 21: Perform role-based UAT

**Files:**
- Create: `docs/uat/2026-07-26-operations-eight-phase-checklist.md`

- [ ] **Step 1: Sales UAT**

Verify creation-date filtering, eight dispatch cards, order creation date display, daily driver load, driver/vehicle management, report filters, selected/all CSV, round assignment, and one-click round queue.

- [ ] **Step 2: Accounting UAT**

Verify approved Google + OTP login, report-only navigation, every report and master-data action, CSV export, and denial of direct URLs/API calls outside the report scope.

- [ ] **Step 3: Driver UAT**

Verify login, vehicle selection, mileage start/segment/end, daily inspection, weekly inspection, fuel entry, order acceptance, delivery completion, and no new round control.

- [ ] **Step 4: Store and pack UAT**

Verify all existing work queues and status actions, and confirm no round field or additional step appears.

### Task 22: Controlled rollout and rollback

**Files:**
- Modify: `README.md`
- Modify: `BACKUP_SYSTEM.md`

- [ ] **Step 1: Create a production backup**

Run: `npm.cmd run backup`

Expected: backup metadata confirms the Firestore backup completed before migrations or release.

- [ ] **Step 2: Configure accounting approval**

Set `ACCOUNTING_EMAIL_ALLOWLIST` in the deployment environment using the exact approved Hillkoff accounting addresses. Do not commit the addresses to `.env.local` or source control.

- [ ] **Step 3: Seed the vehicle master**

Run dry run:

`node scripts/seed-vehicle-master.mjs`

Then authorized apply:

`node scripts/seed-vehicle-master.mjs --apply`

Expected: 21 static vehicle records are merged; no records are deleted.

- [ ] **Step 4: Deploy in dependency order**

1. Additive repositories, report APIs, auth role, and new components.
2. Vehicle master seed and accounting environment configuration.
3. Report replacement and accounting access.
4. Dispatch dashboard replacement.
5. Chiang Mai round assignment and bulk queue.

- [ ] **Step 5: Verify production health**

Check report API error rates, authentication failures, Firestore read volume, CSV success, card counts, ambiguous/unallocated data-quality counts, round queue conflicts, and driver/store/pack workflow completion.

- [ ] **Step 6: Use the exact rollback boundary**

Rollback the application deployment to the prior commit. Because all Firestore changes are additive and deletes are soft, no data rollback is required. Keep `vehicle_master` documents in place; the previous app ignores them and continues using static `HILLKOFF_VEHICLES`.

## Final Acceptance Matrix

| Requirement | Acceptance evidence |
|---|---|
| Report page replaced completely | Old today-only report block and TXT controls absent; new component mounted |
| Existing driver mileage and fuel reused | Report reads `vehicle_usage_events`, `fuel_bills`, and assessments; driver entry UI remains intact |
| Daily/monthly mileage and fuel | Aggregation tests and live reconciliation pass |
| Daily driver and order linkage | Exact/fallback allocation rules tested; ambiguous/unallocated visible |
| City/outstation order split | Shared area classifier tests pass |
| Driver/vehicle/owner CRUD | Server-authorized APIs, soft disable, and audit logs pass |
| Selected/all CSV | UTF-8 CSV tests and cross-page selection tests pass |
| Accounting login | Approved Hillkoff Google + OTP succeeds |
| Accounting one-page access | UI forced to report; direct Firestore and other APIs denied |
| Dispatch filter by created date | Bangkok boundary tests and date selector pass |
| Three new cards | Confirmed names and counts pass |
| Daily driver load | Instruction box removed and per-driver rows render |
| Three Chiang Mai rounds | One round per order, explicit date, sales-only controls |
| Store/pack unchanged | Role UAT and workflow regression tests pass |
| One-click round queue | Transactional preflight, activity audit, and one summary push pass |
| Other system areas unaffected | Full tests, rules tests, lint, build, and role UAT pass |

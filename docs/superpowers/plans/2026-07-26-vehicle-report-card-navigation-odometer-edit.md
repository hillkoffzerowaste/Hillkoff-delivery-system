# Vehicle Report Card Navigation and Odometer Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนรายงานรถเป็นเมนูการ์ด Grid ที่โหลดข้อมูลหลังเลือกช่วงเวลา และเพิ่มการแก้เลขไมล์แบบมีสิทธิ์และ audit

**Architecture:** แยกกฎแก้เลขไมล์เป็น pure helper เพื่อทดสอบ authorization/validation ได้โดยไม่พึ่ง Firestore, เพิ่ม event references ในตัวรวมรายงาน และใช้ server-only PATCH route ทำ transaction กับ event และ audit ส่วน UI ใช้ explicit active view และ applied filters เพื่อไม่ query ก่อนผู้ใช้กดแสดงรายงาน

**Tech Stack:** Next.js 16 App Router, React 19, Firebase Admin/Firestore, Vitest, ESLint

## Global Constraints

- การ์ด 5 ใบต้อง wrap โดยไม่มี horizontal scrolling
- รายงานต้องไม่ query หรือ render รายละเอียดก่อนเลือกหมวด ช่วงเวลา และกด `แสดงรายงาน`
- `จัดการข้อมูล` เปิดได้โดยไม่ต้องเลือกช่วงเวลา
- แก้เลขไมล์ได้เฉพาะ `admin` หรือ `accounting` อีเมล `acc.ap@hillkoff.com`
- API ต้องตรวจสิทธิ์ซ้ำและบันทึก `vehicle_odometer_audits`
- ห้ามเปลี่ยน flow บันทึกข้อมูลของคนขับและห้ามเปิด Firestore write ให้ client
- ห้ามเพิ่ม dependency

---

### Task 1: Preserve Source Event References in Vehicle Report Rows

**Files:**
- Modify: `lib/vehicleReport.js`
- Test: `tests/unit/vehicleReport.test.js`

**Interfaces:**
- Produces row fields `odometerStartEventId: string` and `odometerEndEventId: string`.
- Existing `buildVehicleReport(input)` signature remains unchanged.

- [ ] **Step 1: Write the failing test**

Add start/end events with known IDs and assert:

```js
expect(report.rows[0]).toMatchObject({
  odometerStart: 1000,
  odometerEnd: 1120,
  odometerStartEventId: "usage-start",
  odometerEndEventId: "usage-end"
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleReport.test.js`
Expected: FAIL because event reference fields are absent.

- [ ] **Step 3: Implement event reference selection**

When a lower start or higher end odometer becomes the aggregate value, assign the same event's `id`:

```js
if (event.eventType === "start" && (row.odometerStart == null || odo < row.odometerStart)) {
  row.odometerStart = odo;
  row.odometerStartEventId = String(event.id || "");
}
```

Apply equivalent maximum logic for end events.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npm.cmd test -- --run tests/unit/vehicleReport.test.js`
Expected: PASS.

### Task 2: Add Odometer Correction Policy and Patch Builder

**Files:**
- Create: `lib/vehicleOdometerCorrection.js`
- Create: `tests/unit/vehicleOdometerCorrection.test.js`

**Interfaces:**
- Produces `canCorrectVehicleOdometer(profile): boolean`.
- Produces `buildOdometerCorrection({ event, odometer, reason, actor, now }): { eventPatch, auditRecord }`.
- Consumed by Task 3 API route and Task 4 UI permission display.

- [ ] **Step 1: Write failing authorization and validation tests**

```js
expect(canCorrectVehicleOdometer({ role: "admin" })).toBe(true);
expect(canCorrectVehicleOdometer({ role: "accounting", email: "acc.ap@hillkoff.com" })).toBe(true);
expect(canCorrectVehicleOdometer({ role: "sales", email: "sales@hillkoff.com" })).toBe(false);
expect(canCorrectVehicleOdometer({ role: "accounting", email: "other@hillkoff.com" })).toBe(false);
expect(() => buildOdometerCorrection({ event: { id: "E1", odometer: 1000 }, odometer: 0, reason: "แก้", actor: {} })).toThrow();
expect(() => buildOdometerCorrection({ event: { id: "E1", odometer: 1000 }, odometer: 1100, reason: "", actor: {} })).toThrow();
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleOdometerCorrection.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement minimal pure helper**

Normalize email to lowercase, enforce `0 < odometer <= 10_000_000`, require a non-empty reason capped at 1000 characters, preserve old value, and create audit fields:

```js
{
  eventId,
  previousOdometer,
  nextOdometer,
  reason,
  correctedByUid,
  correctedByEmail,
  correctedByRole,
  createdAt: now
}
```

The event patch includes `odometer`, `odometerCorrectedAt`, `odometerCorrectedBy`, `odometerCorrectionReason`, and `updatedAt`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm.cmd test -- --run tests/unit/vehicleOdometerCorrection.test.js`
Expected: PASS.

### Task 3: Add Transactional Odometer Correction API

**Files:**
- Create: `app/api/vehicle-report/odometer/route.js`
- Modify: `firestore.rules`
- Test: `tests/unit/vehicleOdometerCorrection.test.js`
- Test: `tests/firestore.rules.test.js`

**Interfaces:**
- Consumes Task 2 helpers.
- `PATCH /api/vehicle-report/odometer` body:

```json
{"eventId":"usage-start","odometer":12345,"reason":"คนขับกรอกเลขเกิน"}
```

- Returns `{ ok: true, data: { eventId, odometer } }`.

- [ ] **Step 1: Add failing policy cases**

Add tests for an end-event correction lower than its paired start odometer by passing `minimumOdometer`; expect rejection. Add a Firestore Rules assertion that accounting cannot write `vehicle_odometer_audits` directly.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm.cmd test -- --run tests/unit/vehicleOdometerCorrection.test.js`
Run: `npm.cmd run test:rules`
Expected: helper case fails until minimum validation exists; direct audit write is denied by existing/default rules or requires an explicit deny assertion.

- [ ] **Step 3: Implement route**

Use:

```js
const { profile, db } = await requireProfile(request, ["admin", "accounting"]);
if (!canCorrectVehicleOdometer(profile)) throw forbidden;
```

In a transaction, read `vehicle_usage_events/{eventId}`, reject missing documents, build the patch, set the event with merge, and create `vehicle_odometer_audits/{autoId}`. For end events, find the same date/vehicle/driver start event and pass its odometer as `minimumOdometer`.

- [ ] **Step 4: Run policy/rules tests to verify GREEN**

Run: `npm.cmd test -- --run tests/unit/vehicleOdometerCorrection.test.js`
Run: `npm.cmd run test:rules`
Expected: all pass.

### Task 4: Replace Tabs with Lazy Card Pages

**Files:**
- Modify: `app/components/VehicleInspectionReport.jsx`
- Modify: `app/page.jsx`
- Modify: `app/globals.css`
- Test: `tests/unit/operationsComponents.test.jsx`

**Interfaces:**
- `VehicleInspectionReport` receives `{ apiFetch, role, email }`.
- UI calls existing query/export routes and Task 3 PATCH route.

- [ ] **Step 1: Write failing initial-render test**

Render the report and assert:

```js
expect(html.match(/vehicle-report-menu-card/g)).toHaveLength(5);
expect(html).toContain("เลือกเมนูรายงาน");
expect(html).not.toContain("vehicle-report-filter");
expect(html).not.toContain("vehicle-report-table");
expect(html).not.toContain("ส่งออกทั้งหมดตามตัวกรอง");
```

Also assert each menu card has `type="button"` and a unique view label.

- [ ] **Step 2: Run component test to verify RED**

Run: `npm.cmd test -- --run tests/unit/operationsComponents.test.jsx`
Expected: FAIL because current tabs and report details render immediately.

- [ ] **Step 3: Implement explicit menu and applied-filter state**

Use `activeView = ""`, `draftFilters`, `appliedFilters = null`, and remove automatic query from initial mount. The four report views show filters; `loadReport()` validates dates, copies draft to applied, then calls query. Selecting another report view clears applied data. `master` loads master data only after selection.

Create five menu button definitions with icons and descriptions. Render only the selected page. Pass `auth.email` from `app/page.jsx`.

- [ ] **Step 4: Add correction modal**

Show edit actions only when:

```js
role === "admin" || (role === "accounting" && email.toLowerCase() === "acc.ap@hillkoff.com")
```

Open a modal for start/end source event, require a reason, PATCH the API, close on success, and reload the current applied report.

- [ ] **Step 5: Implement responsive Grid CSS**

Use:

```css
.vehicle-report-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  overflow: visible;
}
```

At 900px use three columns and at 560px use two columns. Style each card with icon, title, description, visible active state, focus state, and minimum touch target.

- [ ] **Step 6: Run component tests to verify GREEN**

Run: `npm.cmd test -- --run tests/unit/operationsComponents.test.jsx`
Expected: PASS.

### Task 5: Full Verification, Review, Commit, and Release

**Files:**
- Review all files from Tasks 1-4.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Run full automated gate**

Run:

```powershell
npm.cmd run check
npm.cmd run test:rules
git diff --check
```

Expected: zero failures.

- [ ] **Step 2: Verify UI at three breakpoints**

Run the local app and inspect:

- Desktop: five cards in one row.
- Tablet: three cards then two.
- Mobile: two, two, one with no horizontal menu scroll.
- Initial page has no report data.
- Selecting a report shows filters; data appears only after `แสดงรายงาน`.
- Unauthorized roles do not see correction actions.

- [ ] **Step 3: Review release scope**

Confirm no `.env`, logs, `repo/`, `repo.worktrees/`, build output, or unrelated files are staged. Confirm no bulk migration is required.

- [ ] **Step 4: Commit and push**

Stage only task files, commit with:

```text
feat: add card-based vehicle report navigation
```

Push `main` only after all gates pass.

# Outstation Shipping Label Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มระบบเลือกออเดอร์ต่างจังหวัดของฝ่ายขาย สร้างใบปะหน้าจากข้อมูลออเดอร์ แก้ไข/บันทึกข้อมูลผู้ส่งผู้รับ Preview และพิมพ์ A4 แนวตั้ง 1 คอลัมน์ × 5 แถว โดยไม่เปลี่ยน workflow เดิมของสโตร์ ห้องแพ็ค คนขับ หรือการสร้างออเดอร์

**Architecture:** เก็บ business logic การแตกจำนวนกล่องและการแบ่งหน้าไว้ใน pure module ใหม่ แยกหน้าต่างแก้ไข/Preview เป็น React component ใหม่ และให้ `app/page.jsx` เชื่อมต่อเฉพาะ branch `sales-outstation` ผ่าน props/callbacks เท่านั้น ข้อมูลใบปะหน้า ประวัติผู้รับ และค่าเริ่มต้นผู้ส่งใช้ API ฝั่ง server แยกจาก `orders` เพื่อไม่แก้ความหมายของออเดอร์เดิม

**Tech Stack:** Next.js 16 App Router, React 19, JavaScript/JSX, Firebase Admin ผ่าน `requireProfile`, Firestore, Vitest, ESLint

## Global Constraints

- แก้เฉพาะ workflow ใบปะหน้าของฝ่ายขายต่างจังหวัด
- ห้ามเปลี่ยน `deliveryMethod`, `shippingCarrier`, `cod`, `boxes`, `workflowType`, `packStatus`, `queueStatus` หรือ transition เดิมของออเดอร์
- A4 แนวตั้ง 1 คอลัมน์ × 5 แถวต่อหน้า
- 1 ออเดอร์หลายกล่องต้องสร้างรายการ `1/N` ถึง `N/N` โดยไม่มีการจำกัดที่ 5 กล่อง; 5 เป็นจำนวนใบต่อหน้ากระดาษเท่านั้น
- รหัสขนส่งด้านบนเป็นช่องว่างที่ผู้ใช้กรอกหรือแก้ไขได้ ไม่ใช้เลขออเดอร์เป็นข้อความหลัก
- รายละเอียด COD อยู่ใต้ชื่อบริษัทขนส่ง
- ผู้ส่ง 3 บรรทัด; ผู้รับ 3–4 บรรทัด; บล็อกผู้รับชิดขอบขวาและทุกบรรทัดใช้แนวขวาเดียวกัน
- ค่าเริ่มต้นผู้ส่งต้องเริ่มจาก `บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)` ตามที่ผู้ใช้กำหนด
- ต้องเก็บ snapshot ข้อมูลตอนสร้าง/พิมพ์ เพื่อให้ใบที่พิมพ์ย้อนหลังไม่เปลี่ยนตามการแก้ข้อมูลลูกค้าภายหลัง
- ห้ามแตะ `.env*`, credentials, generated files, `repo/`, `repo.worktrees/` หรือไฟล์ mockup ที่ไม่เกี่ยวข้อง

---

### Task 1: แยก pure label domain logic และ regression tests

**Files:**
- Create: `lib/outstationLabels.js`
- Create: `tests/unit/outstationLabels.test.js`
- Modify: `tests/unit/core.test.js` only if a shared export/import assertion is required; otherwise leave unchanged

**Interfaces:**
- Produces `DEFAULT_OUTSTATION_SENDER`
- Produces `normalizeLabelDraft(input)`
- Produces `validateLabelDraft(draft)` returning `{ ok: boolean, errors: string[] }`
- Produces `expandOrderToLabelItems(order, draftOverrides)` returning one item per box with `boxIndex` and `boxTotal`
- Produces `paginateLabelItems(items, pageSize = 5)` returning `Array<Array<LabelItem>>`
- Produces `buildLabelSnapshot(order, draft)` returning the immutable printable fields

- [ ] **Step 1: Write failing tests for one-box, multi-box, and pagination behavior**

```js
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTSTATION_SENDER,
  expandOrderToLabelItems,
  paginateLabelItems,
  validateLabelDraft
} from "../../lib/outstationLabels.js";

describe("outstation label domain", () => {
  it("uses the approved sender default", () => {
    expect(DEFAULT_OUTSTATION_SENDER.name).toBe("บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)");
    expect(DEFAULT_OUTSTATION_SENDER.addressLines).toHaveLength(3);
  });

  it("creates one label for every box without limiting the order to five boxes", () => {
    const items = expandOrderToLabelItems({
      id: "BU003931",
      boxes: 7,
      customerName: "คุณวชรี พรหมทอง",
      address: "213 หมู่ที่ 5 ต.น้ำปั้ว อ.เวียงสา จ.น่าน 55110",
      customerPhone: "081-2957098",
      shippingCarrier: "เมล์เขียว",
      cod: 0
    }, {});
    expect(items).toHaveLength(7);
    expect(items[0].boxLabel).toBe("1/7");
    expect(items[6].boxLabel).toBe("7/7");
  });

  it("splits labels into five rows per A4 page", () => {
    const pages = paginateLabelItems(Array.from({ length: 11 }, (_, index) => ({ id: index })), 5);
    expect(pages.map(page => page.length)).toEqual([5, 5, 1]);
  });

  it("requires recipient and carrier data before printing", () => {
    expect(validateLabelDraft({ recipientName: "", recipientAddress: "", carrier: "" })).toEqual({
      ok: false,
      errors: ["recipientName", "recipientAddress", "carrier"]
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module is missing**

Run: `npm test -- tests/unit/outstationLabels.test.js`

Expected: FAIL with an import/module-not-found error.

- [ ] **Step 3: Implement the pure helpers without importing React, Firebase, or page state**

Implementation requirements:

```js
export const DEFAULT_OUTSTATION_SENDER = {
  name: "บ.ฮิลล์คอฟฟ์ จำกัด (สาขาที่00003)",
  addressLines: ["66 ณช้างเผือก ต.ศรีภูมิ", "อ.เมือง จ.เชียงใหม่ 50200", "โทร.053-213078"]
};

export function expandOrderToLabelItems(order, draftOverrides = {}) {
  const total = Math.max(1, Number(order?.boxes || 0));
  return Array.from({ length: total }, (_, index) => buildLabelSnapshot(order, {
    ...draftOverrides,
    boxIndex: index + 1,
    boxTotal: total
  }));
}

export function paginateLabelItems(items, pageSize = 5) {
  const pages = [];
  for (let index = 0; index < items.length; index += pageSize) pages.push(items.slice(index, index + pageSize));
  return pages;
}
```

The implementation must normalize blank tracking-code and COD-detail fields without inventing values, preserve the original order identifier as metadata only, and keep the user-entered sender/recipient snapshot separate from the source order.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- tests/unit/outstationLabels.test.js`

Expected: PASS with all label-domain tests passing.

- [ ] **Step 5: Run the existing unit suite to detect unrelated regressions**

Run: `npm test`

Expected: all existing tests and the new label tests pass.

### Task 2: Add isolated persistence APIs for settings, recipient history, and print jobs

**Files:**
- Create: `app/api/outstation-labels/settings/route.js`
- Create: `app/api/outstation-labels/recipients/route.js`
- Create: `app/api/outstation-labels/jobs/route.js`
- Create: `lib/outstationLabelStorage.js` if shared Firestore validation/serialization is needed
- Modify: `firestore.rules` only if a client-side read/write path is introduced; preferred implementation keeps all writes behind the authenticated server API
- Modify: `BACKUP_SYSTEM.md` or backup code only if verification shows new collections are not included by the existing backup mechanism

**Interfaces:**
- `GET /api/outstation-labels/settings` returns the current sender default and version metadata
- `PUT /api/outstation-labels/settings` saves the sender default for authorized sales/admin users
- `GET /api/outstation-labels/recipients?customerId=...` returns saved recipient address/name history
- `POST /api/outstation-labels/recipients` saves a new recipient snapshot without deleting old entries
- `POST /api/outstation-labels/jobs` creates an idempotent print job containing label snapshots and status `ready`
- `PATCH /api/outstation-labels/jobs` marks a job `printed` or `reprinted` and appends an audit event

- [ ] **Step 1: Define Firestore document boundaries before implementing routes**

Use separate collections so existing order documents remain unchanged:

```text
outstation_label_settings/default
outstation_recipient_addresses/{autoId}
outstation_label_jobs/{jobId}
outstation_label_jobs/{jobId}/items/{itemId}
outstation_label_jobs/{jobId}/events/{eventId}
```

Every job item stores `orderId`, `boxIndex`, `boxTotal`, sender snapshot, recipient snapshot, carrier, trackingCode, codEnabled, codAmount, codDetail, and `createdAt`. Never read a previously printed label from the live order to render it again.

- [ ] **Step 2: Add route tests for role checks and input limits**

Verify that:

- only `sales` and `admin` can create/print jobs and change sender defaults
- a recipient history record requires a valid customer identifier or an explicit legacy customer key
- a label job rejects missing recipient, address, carrier, or invalid box indexes
- a duplicate request with the same idempotency key returns the existing job instead of creating duplicate print records
- no route writes to `orders/{orderId}`

- [ ] **Step 3: Implement server-side validation and persistence**

Reuse `requireProfile` and `errorResponse` from `lib/workflowAuth`. Limit strings by field length, normalize phone digits only for matching, preserve display formatting, and record `createdByUid`, `createdByName`, and timestamps. Save address history as append-only records; do not overwrite the current customer address.

- [ ] **Step 4: Verify backup coverage and Firestore access boundaries**

Run the existing backup/list checks or inspect the backup implementation to confirm the new collections are included. If the backup is root-collection driven, document the result. If it uses an allowlist, add only the three new root collections and add a read-back test.

- [ ] **Step 5: Run the API/unit checks**

Run: `npm test`

Expected: all unit tests pass, including role/validation/idempotency coverage.

### Task 3: Build the isolated editor and A4 preview component

**Files:**
- Create: `app/components/OutstationLabelPrintDialog.jsx`
- Create: `app/components/OutstationLabelPreview.jsx`
- Modify: `app/globals.css` by adding only `.outstation-label-*` selectors and print media rules

**Interfaces:**
- `OutstationLabelPrintDialog({ orders, senderDefault, recipientHistory, onClose, onSaved })`
- `OutstationLabelPreview({ pages, onEditItem, onPrint })`
- The components consume label items from `lib/outstationLabels.js` and do not fetch or mutate order state directly.

- [ ] **Step 1: Add component-level states and explicit edit boundaries**

The dialog must keep separate state for:

- sender fields
- recipient fields per label
- carrier per label
- tracking code per label, initially blank
- COD enabled/amount/detail per label
- saved recipient history selection
- preview pages

Selecting “save as default” updates settings only. Selecting “save recipient for future” appends history only. The default path must not patch the source order.

- [ ] **Step 2: Add the five-row print layout**

Use a namespaced print container with:

```css
@page { size: A4 portrait; margin: 0; }
.outstation-label-print-page { width: 210mm; height: 297mm; display: grid; grid-template-rows: repeat(5, 1fr); }
.outstation-label-item { break-inside: avoid; overflow: hidden; }
```

Each item must render the approved layout: sender on the left in three aligned lines, blank tracking-code field at the upper right, carrier below it, COD detail immediately below carrier, recipient block right-aligned in three-to-four aligned lines, recipient phone at the bottom, and `boxIndex/boxTotal` clearly visible.

- [ ] **Step 3: Add preview controls and validation messages**

Show page count, label count, selected order count, and total box count. Disable print until all required fields are valid. Provide per-label edit, previous/next page, print, cancel, and print-again actions. Preview must be the same DOM structure used by print CSS so screen and paper do not drift.

- [ ] **Step 4: Run lint after component creation**

Run: `npm run lint`

Expected: no ESLint errors or warnings.

### Task 4: Integrate only into the sales outstation tab

**Files:**
- Modify: `app/page.jsx` only in the sales-outstation state, handlers, and render branch around the existing `salesOutstationOrders` view
- Modify: `app/globals.css` only for the namespaced selectors defined in Task 3

**Interfaces:**
- The existing `salesOutstationOrders` collection remains the source list.
- The new selection state is local to `page.jsx` and is cleared when leaving `sales-outstation` or after a completed print job.
- Existing order creation, pack, store, driver, report, and dashboard branches remain untouched.

- [ ] **Step 1: Add a selection map keyed by order ID**

Use a `Set`/object keyed by `order.id`, filter out non-outstation orders, and keep “select all” limited to the currently visible `salesOutstationOrders`. Do not modify the shared `orders` array.

- [ ] **Step 2: Add the print action using `authenticatedFetch`**

The action must:

1. collect selected source orders;
2. expand each order using `expandOrderToLabelItems`;
3. validate all labels;
4. create a server-side job with an idempotency key;
5. open the dialog/preview;
6. mark the job printed only after the browser print action is requested;
7. refresh only the outstation label status, not the whole operational workflow.

- [ ] **Step 3: Add the UI entry points without changing existing cards**

Add checkbox, selected-count summary, total-box summary, and `สร้าง/พิมพ์ใบปะหน้า` button inside the `sales-outstation` branch. Leave the existing status chips and “ดูรายละเอียดออเดอร์” behavior unchanged.

- [ ] **Step 4: Verify the branch is isolated by inspection**

Run: `rg -n "outstation-label|OutstationLabel|sales-outstation" app/page.jsx app/components app/api lib`

Expected: all new integration references are limited to the new component/API/helper names and the existing sales-outstation branch; no changes appear in pack, driver, store, or order-creation handlers.

### Task 5: End-to-end verification and safe handoff

**Files:**
- Test: `tests/unit/outstationLabels.test.js`
- Test: any route tests added in the existing test layout
- Review: `app/page.jsx`, `app/components/OutstationLabelPrintDialog.jsx`, `app/components/OutstationLabelPreview.jsx`, `app/api/outstation-labels/*/route.js`, `lib/outstationLabels.js`

- [ ] **Step 1: Run the complete local quality gate**

Run: `npm run check`

Expected: lint, unit tests, and production build all pass.

- [ ] **Step 2: Perform a manual QA matrix on a local/dev environment**

Verify these cases:

- one order, one box → one label `1/1`
- one order, three boxes → `1/3`, `2/3`, `3/3`
- one order, eleven boxes → pages with 5, 5, and 1 labels
- multiple selected orders → labels preserve selection/order sequence
- sender edit for current job only → default remains unchanged
- save sender default → next job loads the new default
- edit recipient for current job only → source order remains unchanged
- save a second address for the same customer → old address remains selectable
- Kerry/Flash/Nim and “other” carrier → carrier text renders correctly
- COD off → no COD detail printed
- COD on → amount and detail render directly under carrier
- blank tracking code → preview remains editable and prints an empty field
- long Thai recipient name/address → lines stay aligned and do not overlap
- reprint → new audit event, no duplicate order update
- leaving the tab before printing → selection and modal state do not leak into other tabs

- [ ] **Step 3: Review the final diff and repository scope**

Run: `git diff -- app/page.jsx app/globals.css lib app/api tests docs/superpowers/plans/2026-07-23-outstation-label-printing.md` and `git status --short`.

Expected: only task-related files are included; existing untracked `repo/`, `repo.worktrees/`, and unrelated mockups are not staged.

- [ ] **Step 4: Release only after verification**

Create a feature branch before implementation, commit the scoped files only, and push only the feature branch after the user confirms the manual preview and quality gate. Do not deploy production in this plan.

## Rollback Plan

Because all persistence is isolated in new `outstation_*` collections and the UI entry point is conditionally rendered only for `sales-outstation`, rollback is a code revert of the feature branch. Existing orders and workflow fields are not migrated or rewritten. If a partial job is created, mark it cancelled through the job API; do not delete source orders or customer history.

## Known Risks and Mitigations

- **Large existing `app/page.jsx`:** keep new rendering in separate components and limit integration to one branch.
- **Browser print scaling:** use A4 millimetres, `@page` rules, `print-color-adjust`, and manual verification at 100% scale.
- **Thai text overflow:** test long names/addresses and use bounded line wrappers with explicit font sizes before allowing print.
- **Duplicate print clicks:** use an idempotency key and disable the print button while the job is being created.
- **Historical data drift:** store immutable label snapshots in the job item rather than rendering from live customer/order data.

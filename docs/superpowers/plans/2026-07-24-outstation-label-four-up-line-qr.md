# Outstation Label Four-Up and Line QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print four outstation labels per A4 page with a non-overlapping dispatch QR and a small centered Hillkoff Line@ QR.

**Architecture:** Keep pagination in `lib/outstationLabels.js`, QR rendering in the existing client QR component, and visual placement in print CSS. Add a reusable Line URL constant and render each QR in an independently positioned wrapper.

**Tech Stack:** Next.js 16, React 19, `qrcode`, Vitest, CSS print layout.

## Global Constraints

- Exactly four labels per A4 page.
- Dispatch QR must not overlap sender or recipient text.
- Line@ QR uses `https://page.line.me/769svedb?oat_content=url&openQrModal=true` and caption `Add line Hillkoff`.
- Both QR blocks must be absolutely positioned so they do not affect document flow.

---

### Task 1: Pagination contract

**Files:**
- Modify: `lib/outstationLabels.js`
- Test: `tests/unit/outstationLabelPreview.test.jsx`

**Interfaces:**
- Produces: `OUTSTATION_LABELS_PER_PAGE = 4` and `paginateLabelItems(items)` with four items per page.

- [ ] **Step 1: Write the failing test**

Assert that six labels render as four on page one and two on page two, and that the labels-per-page constant equals four.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx`
Expected: FAIL because the current constant is five.

- [ ] **Step 3: Write minimal implementation**

Change `OUTSTATION_LABELS_PER_PAGE` from `5` to `4` and use the constant when calculating preview item indexes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx`
Expected: PASS.

### Task 2: Add the Line@ QR

**Files:**
- Modify: `lib/outstationQr.js`
- Modify: `app/components/OutstationQrCode.jsx`
- Modify: `app/components/OutstationLabelPreview.jsx`
- Test: `tests/unit/outstationLabelPreview.test.jsx`
- Test: `tests/unit/outstationDispatch.test.js`

**Interfaces:**
- Produces: `HILLKOFF_LINE_URL`, dispatch QR markup, and Line@ QR markup with `Add line Hillkoff`.

- [ ] **Step 1: Write failing render and PNG tests**

Assert the rendered label contains the Line@ URL and caption, and assert `QRCode.toDataURL(HILLKOFF_LINE_URL, options)` produces a PNG data URL.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx tests/unit/outstationDispatch.test.js`
Expected: FAIL because the Line@ constant and markup do not exist.

- [ ] **Step 3: Implement the second QR**

Allow `OutstationQrCode` to receive a class name and optional caption, export the Line@ URL constant, and render both QR components in every label.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx tests/unit/outstationDispatch.test.js`
Expected: PASS.

### Task 3: Four-row print placement and verification

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.outstation-label-dispatch-qr` and `.outstation-label-line-qr` wrappers from Task 2.

- [ ] **Step 1: Implement fixed non-overlapping regions**

Set `grid-template-rows: repeat(4, 1fr)`, place the dispatch QR at lower left, and place the smaller Line@ QR in the center free area with its caption below.

- [ ] **Step 2: Run full verification**

Run: `npm.cmd run check`
Expected: lint passes, all unit tests pass, and the production build succeeds.

- [ ] **Step 3: Review and publish**

Run `git diff --check`, inspect the scoped diff, commit only the task files, and push the current `main` branch to `origin/main`.

# Outstation Label Four-Up and Line QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print four outstation labels per A4 page with a non-overlapping dispatch QR, a caption beside it, and one QR URL that supports both web-app dispatch and public Line@ redirect behavior.

**Architecture:** Keep pagination in `lib/outstationLabels.js`, QR rendering in the existing client QR component, and visual placement in print CSS. Encode new QR images as `/outstation-qr?t=...`, parse both the new URL and legacy `HKO1|...` payloads, and redirect valid public URLs through `app/outstation-qr/route.js`.

**Tech Stack:** Next.js 16, React 19, `qrcode`, Vitest, CSS print layout.

## Global Constraints

- Exactly four labels per A4 page.
- Dispatch QR must not overlap sender or recipient text.
- Main QR URL uses `/outstation-qr?t=...`; valid public requests redirect to `https://page.line.me/769svedb?oat_content=url&openQrModal=true`.
- The caption is `Add line Hillkoff`; there is no separate Line@ QR.
- QR block must be absolutely positioned so it does not affect document flow.

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

### Task 2: Add the public QR URL flow

**Files:**
- Modify: `lib/outstationQr.js`
- Modify: `lib/outstationDispatch.js`
- Modify: `app/components/OutstationQrCode.jsx`
- Create: `app/outstation-qr/route.js`
- Test: `tests/unit/outstationLabelPreview.test.jsx`
- Test: `tests/unit/outstationDispatch.test.js`
- Test: `tests/unit/outstationQrRoute.test.js`

**Interfaces:**
- Produces: `createOutstationQrUrl(origin, payload)`, URL-aware `parseOutstationQrPayload`, and a public redirect route.

- [ ] **Step 1: Write failing render and PNG tests**

Assert URL creation/parsing round-trips to the order payload and valid public requests redirect to the Line@ URL.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx tests/unit/outstationDispatch.test.js`
Expected: FAIL because the URL helper and public route do not exist.

- [ ] **Step 3: Implement the second QR**

Add the URL helper and Line@ destination constant, make `parseOutstationQrPayload` accept the public URL and legacy payload, generate new QR images from the current app origin, and add the public redirect route.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- tests/unit/outstationLabelPreview.test.jsx tests/unit/outstationDispatch.test.js`
Expected: PASS.

### Task 3: Four-row print placement and verification

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.outstation-label-dispatch-qr` wrapper from the existing label preview.

- [ ] **Step 1: Implement fixed non-overlapping regions**

Set `grid-template-rows: repeat(4, 1fr)`, place the dispatch QR at lower left, and place the `Add line Hillkoff` caption beside it.

- [ ] **Step 2: Run full verification**

Run: `npm.cmd run check`
Expected: lint passes, all unit tests pass, and the production build succeeds.

- [ ] **Step 3: Review and publish**

Run `git diff --check`, inspect the scoped diff, commit only the task files, and push the current `main` branch to `origin/main`.

# Firestore Read Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repeat Firestore reads while keeping current operational work realtime and making older rows available on demand.

**Architecture:** Extract read-policy helpers into a small tested module. Use bounded recent-order listeners plus narrowly scoped open-backlog listeners, and slow report polling to visibility-aware intervals.

**Tech Stack:** Next.js 16, React 19, Firebase Web SDK, Firebase Admin SDK, Vitest.

## Global Constraints

- Preserve realtime updates for active operational work.
- Do not migrate or rewrite Firestore data.
- Preserve existing search/history APIs and role authorization.

---

### Task 1: Read policy helpers

**Files:**
- Create: `lib/firestoreReadPolicy.js`
- Modify: `tests/unit/core.test.js`

**Interfaces:**
- Produces: `recentOrdersLimit(requestedLimit, role)`, `nextOrdersLimit(currentLimit)`, `reportRefreshInterval(view)`, and exported policy constants.

- [ ] Write unit tests for bounded initial limits, load-more caps, and polling intervals.
- [ ] Run `npm test` and confirm the new tests fail because the module does not exist.
- [ ] Implement the minimal policy module.
- [ ] Run `npm test` and confirm all tests pass.

### Task 2: Bounded realtime order subscriptions

**Files:**
- Modify: `app/page.jsx`

**Interfaces:**
- Consumes: policy helpers from `lib/firestoreReadPolicy.js`.
- Produces: merged recent and open-backlog order state with a user-controlled load-more action.

- [ ] Replace the 5,000-document realtime limit with the bounded policy limit.
- [ ] Add narrow queries for open preparation and delivery states and merge snapshots by ID.
- [ ] Add a “ดูออเดอร์เก่าเพิ่ม” control for non-driver operational screens.
- [ ] Preserve driver-specific assigned and queued listeners.

### Task 3: Report polling controls

**Files:**
- Modify: `app/page.jsx`
- Modify: `app/api/store/reports/route.js`

**Interfaces:**
- Consumes: polling intervals from `lib/firestoreReadPolicy.js`.
- Produces: bounded report queries and visibility-aware refresh behavior.

- [ ] Change issue polling from 30 seconds to 5 minutes.
- [ ] Change KPI polling to 15 minutes and report polling to 10 minutes.
- [ ] Reduce report API limits to the maximum rows needed by the UI.

### Task 4: Verification and release

**Files:**
- Verify all modified files.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and review `git status`.
- [ ] Commit task-related files and push `main`.

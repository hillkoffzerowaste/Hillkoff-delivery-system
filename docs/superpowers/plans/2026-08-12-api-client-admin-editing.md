# API Client Admin Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and verify API-client administration, documentation, and the `/api/v1` integration surface.

**Architecture:** Reuse the existing admin PATCH endpoint and add one controlled edit panel to the existing admin page. Keep API-client policy in `lib/apiClients.js` and persistence in `lib/apiClientStore.js`; route wrappers remain thin delegates to existing business handlers.

**Tech Stack:** Next.js App Router, React, Firebase Admin SDK, Vitest, ESLint

## Global Constraints

- Do not change existing order workflow business logic.
- API keys remain accepted only beneath `/api/v1`.
- Use existing CSS variables and maintain visible keyboard focus.
- Avoid document-level horizontal overflow at 375, 768, and 1280 pixels.

---

### Task 1: Complete the admin edit UI

**Files:**
- Modify: `app/admin/api-clients/page.jsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/api-clients` with `{ id, ...mutableFields }`
- Produces: a populated, cancellable edit panel for all mutable API-client fields

- [ ] Add editor state and conversion from a stored client to form-safe values.
- [ ] Add Edit, Save, and Cancel actions using the existing authenticated request helper.
- [ ] Reuse scope/role controls and responsive project tokens without changing route contracts.
- [ ] Run `npm run lint` and correct UI lint failures.

### Task 2: Reconcile API documentation and route catalogue

**Files:**
- Modify if needed: `docs/API_V1.md`
- Modify if needed: `INTEGRATION_SETUP.md`
- Modify if needed: `app/api/v1/route.js`

**Interfaces:**
- Consumes: methods and scopes exported by every `app/api/v1/**/route.js`
- Produces: matching human-readable and machine-readable endpoint catalogues

- [ ] Compare every exported v1 method and scope against both catalogues.
- [ ] Correct mismatches and document admin editing behavior accurately.

### Task 3: Full verification and release gate

**Files:**
- Test: `tests/unit/apiClients.test.js`
- Inspect: all task-related files in `git diff`

**Interfaces:**
- Consumes: the integrated implementation
- Produces: current evidence for lint, unit tests, build, auth behavior, and responsive UI

- [ ] Run `npm run lint`.
- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run build` and confirm exit code 0.
- [ ] Start the dev server and exercise catalogue, missing-key, malformed-key, legacy-route rejection, and OPTIONS behavior.
- [ ] Inspect `/admin/api-clients` at 375, 768, and 1280 pixels and confirm zero horizontal overflow.
- [ ] Review final diff and commit only task-related files after all gates pass.

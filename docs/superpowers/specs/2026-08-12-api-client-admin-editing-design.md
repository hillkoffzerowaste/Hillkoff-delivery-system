# API Client Admin Editing Design

## Goal

Complete the existing API-client administration page so an authenticated admin can edit every mutable client policy exposed by the existing `PATCH /api/admin/api-clients` endpoint.

## Design

Each client row keeps the existing rotate and revoke/enable actions and gains an Edit action. Edit opens one responsive panel below the table, populated from the selected client. The panel edits name, description, contact email, scopes, roles, origins, IP allowlist, per-minute rate limit, and expiry. Save sends the existing PATCH shape, refreshes the list, reports success, and closes the editor; Cancel discards local changes.

The implementation stays inside `app/admin/api-clients/page.jsx`, uses the project's existing CSS variables, preserves keyboard focus styles and the skip link, and collapses the form to one column on narrow screens. No API schema or Firestore behavior changes are required.

## Error handling and verification

API errors remain in the page's existing alert region and leave the editor open for correction. Verification covers the pure normalization/policy tests, lint, all unit tests, production build, and browser checks at 375, 768, and 1280 pixels with zero document-level horizontal overflow.

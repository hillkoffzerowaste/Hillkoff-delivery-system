# Outstation QR Dispatch Design

## Goal

Allow sales and pack staff to scan any outstation label QR code from a shared mobile scanner, automatically record the matching box, and mark its order as `ส่งสำเร็จ` only after every box has been handed to the carrier.

## Scope

- Add a camera scanner entry point to both sales and pack outstation workspaces.
- Do not require selecting an order before scanning.
- Encode each printed label QR with the order ID, box index, and box total.
- Accept a typed QR value as a fallback when camera access is unavailable.
- Persist scanned boxes per order, including scanner identity and time.
- Treat a repeat scan of the same box as idempotent: return current progress without increasing it.
- When every expected box is scanned, set `status` to `ส่งสำเร็จ` and `queueStatus` to `completed`.

## QR Payload

Use a versioned, plain-text payload:

`HKO1|<orderId>|<boxIndex>|<boxTotal>`

Example: `HKO1|DO-260724-093803260-B81E54A1|1|3`.

The server validates every segment. The order ID is looked up server-side; the client never supplies customer or order status data.

## Architecture

1. The label builder generates a deterministic QR payload for each label item and the label preview renders its QR image above the recipient block.
2. A reusable client scanner dialog starts the rear mobile camera using browser media APIs, decodes QR values, and sends each decoded value to one authenticated API endpoint. It also includes a manual-input fallback.
3. The API permits sales, pack, and admin profiles, validates that the referenced order is outstation, and updates a per-order `outstationDispatchScans` record with Firestore optimistic concurrency.
4. The API returns the order, scanned count, expected count, duplicate flag, and completion flag. Both workspaces refresh their local orders using the returned order.

## Completion and Audit Rules

- Expected box count is the QR payload total and must equal the order's stored box count after normalization.
- A box may be scanned only once; duplicates are recorded as no-op results.
- Partial scans retain `พร้อมส่งขนส่ง` and the existing queue state.
- The final unique scan sets `status: ส่งสำเร็จ`, `queueStatus: completed`, `outstationDispatchedAt`, and `outstationDispatchedBy`.
- Each scan appends a workflow/activity entry containing the box label, role, user, and timestamp.
- Invalid, non-outstation, stale-total, or already-completed codes return a clear error and do not change another order.

## UI Behavior

- Both sales and pack outstation pages show one `เปิดกล้องสแกน QR` button.
- The dialog displays the last scan result, including customer/order label and progress such as `2/3 กล่อง`.
- After a successful final scan it announces `ส่งสำเร็จ` for that order and remains ready for the next scan.
- Camera permission errors lead users to the manual input field; no separate mobile app is required.

## Tests

- Unit tests for QR payload parsing and box-progress idempotency.
- API route tests for valid scan, duplicate scan, completion, invalid payload, non-outstation order, and mismatched box total.
- Component render tests that confirm scanner entry points and QR label rendering.

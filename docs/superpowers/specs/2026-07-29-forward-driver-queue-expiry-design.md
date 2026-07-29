# Forward Driver Queue Expiry Design

## Objective

Prevent newly queued, unaccepted company-driver orders from remaining on the
driver's new-order screen after their queue day ends. On the next Bangkok
calendar day, those orders must return to Sales as expired queue work that can
be explicitly queued again.

This is a forward-only policy. Existing orders must not be migrated, deleted,
backfilled, or otherwise mutated.

## Approved Business Rules

1. An order entering the driver queue under the new policy is visible to
   drivers only on its active queue date.
2. If no driver accepts it by the next Bangkok calendar day, it is hidden from
   the driver's new-order list.
3. The expired order appears automatically in Sales under a dedicated
   "คิวหมดอายุ—รอฝ่ายขายส่งใหม่" section.
4. Sales must explicitly queue the expired order again. Requeueing refreshes
   its active queue date to the current Bangkok date.
5. Once a driver accepts an order, date expiry no longer applies. The assigned
   order stays with that driver until completion, cancellation, or rework.
6. A driver cancellation returns a new-policy order to the driver queue using
   the cancellation day's Bangkok date.
7. Legacy orders without the new policy marker retain current behavior and
   are not changed by this work.

## Forward-Only Data Contract

Every order entering the driver queue after deployment receives:

- `driverQueuePolicyVersion: 2`
- `driverQueueDate: YYYY-MM-DD`, calculated in `Asia/Bangkok`
- `queuedAt`: an ISO timestamp
- `queueStatus: "queued"`
- `status: "รอคนขับรับ"`

The fields must be written by every queue-entry path:

- Sales queues one order.
- Sales queues a Chiang Mai delivery round.
- A `direct_driver` order enters the queue immediately when created.
- A driver cancels an accepted version-2 order back to the queue.

Legacy orders without `driverQueuePolicyVersion: 2` must not receive these
fields as a side effect of page loads or background cleanup.

## Selection Rules

Pure, unit-tested selectors will define the policy:

- A version-2 unassigned queued order is visible to drivers only when
  `driverQueueDate` equals today's Bangkok date.
- A version-2 unassigned queued order is expired for Sales when
  `driverQueueDate` is earlier than today's Bangkok date.
- Assigned active orders are selected by driver identity and delivery status,
  without applying queue-date expiry.
- Legacy orders use the existing selectors unchanged.

The UI must apply the selector as a defensive render guard even if the
realtime listener returns broader data.

## Sales Workflow

Sales receives a dedicated expired-queue section containing only version-2
orders that are unassigned, still queued, and older than today.

Each card shows the order date, previous queue date, customer, and current
status. The action "ส่งเข้าคิวใหม่" calls the existing authenticated queue
workflow. The server validates that the order is still unassigned and eligible,
then refreshes `driverQueueDate`, `queuedAt`, and the queue status fields.

No automatic database write occurs merely because a page is opened. The
"automatic return" is a deterministic change in role visibility; requeueing
remains an explicit Sales action.

## Driver Workflow

The driver new-order section excludes expired version-2 orders. Today's
version-2 queue and legacy queue behavior remain available according to their
respective selectors.

Accepting an order keeps `queueStatus: "queued"` during active delivery, as in
the current workflow, but the presence of `driverId` makes it an assigned job
and exempts it from queue-date expiry.

Completion continues to set `queueStatus: "completed"`. Incomplete delivery
continues through the existing rework path.

## Concurrency and Authorization

- Queue and requeue validation remains server-side.
- Requeue must fail if another actor has assigned, completed, cancelled, or
  moved the order since Sales loaded the card.
- Driver claim authorization remains governed by the existing Firestore rule
  requiring an unassigned queued source document.
- The new policy fields are server-owned; driver clients do not modify them
  when claiming or updating delivery progress.

No Firestore security-rule expansion is required. Any index needed by a new
query must be declared in `firestore.indexes.json` before deployment.

## Test Strategy

Implementation follows red-green-refactor.

Tests must first fail for these observable behaviors:

1. A version-2 order queued today is visible to drivers.
2. A version-2 unaccepted order from yesterday is hidden from drivers.
3. The same expired order is visible in the Sales requeue list.
4. A legacy unaccepted order keeps existing behavior.
5. Requeue refreshes the Bangkok queue date and timestamp.
6. Bulk round queueing and direct-driver creation write the version-2 fields.
7. Driver cancellation refreshes the queue date only for version-2 orders.
8. Assigned active work remains visible after crossing a calendar day.
9. Completion remains terminal with `queueStatus: "completed"`.
10. Requeue rejects an order whose state changed concurrently.

After targeted tests pass, run lint, the full unit suite, Firestore rule tests,
and a production build.

## Non-Goals

- No migration, cleanup, deletion, or normalization of legacy orders.
- No scheduled Cloud Function or nightly database mutation.
- No change to delivery completion, rework, review, or vehicle workflows.
- No attempt to rewrite historical `status` or `queueStatus` mismatches.

## Rollback

Rollback consists of reverting the version-2 selectors and queue-field writes.
Orders already marked with `driverQueuePolicyVersion: 2` remain valid Firestore
documents; older application code ignores the additional fields.

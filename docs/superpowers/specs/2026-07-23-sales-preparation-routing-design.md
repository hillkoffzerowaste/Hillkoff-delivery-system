# Sales Preparation Routing and Alerts Design

## Goal

Make the sales preparation workspace show store waiting/incomplete alerts as read-only information, while keeping outstation orders entirely within the sales outstation workflow.

## Scope

- Add an alert count to the sales sidebar item **เตรียมออเดอร์เชียงใหม่**.
- Show store `waiting` and `partial` orders in a prominent read-only alert section at the top of the sales Chiang Mai preparation page.
- Keep the existing dispatch action gated by the pack workflow status.
- Keep every order whose delivery method is `outstation` out of the Chiang Mai preparation page.
- After pack inspection, show an outstation order in the ready/history section of the sales outstation page.
- Do not change Firestore schemas, persisted status meanings, or staff permissions.

## Classification Architecture

Create focused pure functions in `lib/preparationWorkflow.js` and use them everywhere the affected pages derive order lists.

The classifier will expose these concepts:

- `isOutstationOrder(order)`: true only for canonical outstation orders (`deliveryMethod === "outstation"` or the compatible direct-pack/outstation shape required for legacy records).
- `isChiangmaiPreparationOrder(order)`: true only for non-outstation preparation orders that have not entered a terminal or transferred queue.
- `isSalesWaitingAlert(order)`: true when a non-terminal sales order has store or pack status `waiting`/`partial`, while excluding completed, archived, transferred, and returned-to-store cases already handled by another workflow.
- `isReadyOrderWaitingForDispatch(order)`: preserve the existing rule for a checked preparation order waiting to enter the driver queue, but explicitly reject outstation orders.

The page will derive sidebar counts, alerts, Chiang Mai cards, and outstation cards from these shared functions instead of repeating inline filters.

## Sales Chiang Mai Experience

The sidebar button **เตรียมออเดอร์เชียงใหม่** will show the total active preparation count and a visually distinct warning count when one or more orders are waiting for products or incomplete.

At the top of the page, a red/orange alert panel will list up to the existing bounded display limit. Each row shows:

- order ID and customer;
- service date;
- store and pack status;
- missing items;
- latest update time.

This section is read-only. It will not expose store/pack update controls. Sales can inspect order details but cannot change inspection results from this alert.

The **ส่งเข้าคิวคนขับ** button remains governed by the pack-ready workflow rule. An order still waiting for pack inspection will not receive the dispatch button.

## Outstation Experience

Outstation orders must never enter `chiangmaiPreparationOrders`, `todayPreparationOrders`, or the Chiang Mai sidebar count.

The sales outstation page keeps two sections:

- active preparation: pack has not completed inspection;
- ready/history: pack has completed inspection and `queueStatus === "outstation_ready"`.

When pack confirms an outstation order, the existing API transition continues to set `outstation_ready`. Realtime state then moves the card from active preparation to ready/history on the same sales outstation page.

## Permissions and Data Flow

- Store and pack remain the only roles that update their inspection states.
- Sales consumes the realtime order snapshot and renders status only.
- No additional Firestore listener is introduced; all new counts and lists are derived locally from the already bounded order snapshot.
- No production data migration is required.

## Error and Legacy Handling

- Canonical new orders continue to use `deliveryMethod: "outstation"`.
- Compatible legacy direct-pack records with outstation carrier data must classify as outstation so they cannot leak into Chiang Mai.
- Unknown delivery methods remain non-outstation only when no outstation evidence exists.
- Terminal, archived, or transferred orders do not produce waiting alerts.

## Testing

Use TDD with unit tests for the pure classification functions:

1. A Chiang Mai order with store `waiting` appears in the sales warning set and not in the ready-to-dispatch set.
2. A Chiang Mai order with store `partial` shows the warning badge and remains read-only in the sales view.
3. An order does not become dispatchable until the existing pack-ready condition is satisfied.
4. A canonical outstation order never enters the Chiang Mai preparation set.
5. A legacy direct-pack order with outstation carrier evidence never enters the Chiang Mai preparation set.
6. An outstation order moves from active preparation to outstation ready/history after pack confirmation.
7. Completed and archived orders do not remain in warning counts.

After implementation, run the full unit suite, lint, production build, and diff validation.

## Acceptance Criteria

- Sales sees a warning badge on **เตรียมออเดอร์เชียงใหม่** whenever relevant store/pack waiting work exists.
- The Chiang Mai sales page shows the same operational warning information as store, without update controls.
- Sales cannot dispatch an order that still awaits the required pack inspection.
- Outstation orders appear only on the sales outstation page before and after pack confirmation.
- Existing realtime behavior and Firestore read limits remain unchanged.

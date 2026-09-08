# Storefront Workspace Design

## Goal

Provide a restricted storefront account for tracking Grab and customer-pickup orders, and for recording the handover only after the packing room has made the order ready.

## Scope

- Add a `storefront` role alongside the existing store and pack staff roles.
- Let an admin create, update, disable, and list storefront username/password accounts through the existing staff-account administration flow.
- Let storefront users sign in through the existing staff username/password form.
- Give storefront users a single Windows-enterprise-style workspace which shows only `grab_pickup` and `customer_pickup` orders.
- Show the store and packing-room checkpoints and a short event timeline for every visible order.
- Allow a storefront user to record a handover only when the packing checkpoint is `checked` or `partial`.

## Non-goals

- No access to sales, store, pack, driver, reports, settings, chat, customers, or other order types.
- No changes to the driver workflow, delivery queue, or existing store/pack review actions.
- No Firestore client writes for orders; handover remains a server-authorized workflow update.

## Authentication and authorization

The existing Firebase-email staff account convention remains the credential store: `username@staff.hillkoff.local`. Admin account creation accepts `storefront` in the same role selector and writes the same active/status profile fields as the current store and pack accounts. Firebase Authentication continues to hash and manage passwords; password values are never returned from the API.

`/api/auth/validate` and `requireProfile` recognize `storefront` as an active role. Firestore rules allow it to read only orders where `deliveryMethod` is `grab_pickup` or `customer_pickup`; all order updates remain denied to the client. The workspace subscribes with the same delivery-method restriction, so it does not request unrelated orders.

## Storefront workspace

The new role has one fixed tab, `storefront-pickup`. It uses the existing teal system tokens, bordered panels, and dense operational-card pattern rather than introducing a separate visual language.

Each work card contains only operational handover data: order ID, customer name, delivery type, booking number, opened time, store status, packing status, and the following timeline:

1. Order opened
2. Store is waiting / working / checked / partial
3. Pack is waiting / working / checked / partial
4. Ready for Grab or customer pickup
5. Handed over, including the confirming staff member and time

The handover action is disabled with an explanatory status until packing is `checked` or `partial`. Once another user completes the handover, the card becomes read-only and shows its recorded handover result. The interface does not expose a generic order-edit UI.

## Handover transaction

The existing `POST /api/orders/workflow` route gains the `grab_pickup` action for `storefront` as well as the existing sales/admin callers. The server verifies all of the following from the current order snapshot before applying a batch update:

- `deliveryMethod` is `grab_pickup` or `customer_pickup`.
- `queueStatus` is `grab_ready`.
- `packStatus` is `checked` or `partial`.
- The order has not already been handed over (`queueStatus !== grab_picked_up`).

On success it changes `queueStatus` to `grab_picked_up`, sets the localized final `status`, saves `grabPickedUpAt` and `grabPickedUpBy`, and appends the existing workflow activity record. The precondition on the order snapshot protects against double-clicks and stale browser tabs. A conflict returns HTTP 409 and the client refreshes the displayed data.

## Error handling

- A disabled storefront profile fails validation and server requests with the same active-profile policy as existing staff accounts.
- An unauthorized role receives HTTP 403.
- An order that is not ready, already handed over, or is not a pickup order receives HTTP 409 and leaves all fields unchanged.
- The UI surfaces the API message and keeps the action disabled while a request is in flight.

## Verification

- Extend the admin account route tests to accept storefront accounts and preserve the existing active-account guard.
- Add workflow-route tests proving storefront can hand over a ready pickup order, but cannot hand over before pack completion, a non-pickup order, or an already handed-over order.
- Add source/UI guard tests for the fixed storefront tab and limited role navigation if a focused component test is impractical in the current monolithic page.
- Run the focused tests during red/green cycles, then `npm run check` and inspect the workspace in a running browser before declaring completion.

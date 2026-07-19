# Firestore Read Optimization Design

## Goal

Reduce Firestore reads while preserving realtime updates for current operational work. Historical and lower-priority rows remain available through explicit “load more” actions.

## Architecture

- Realtime order subscriptions load a bounded recent window instead of the full order history.
- Operational visibility is preserved by combining a recent realtime query with narrowly scoped realtime queries for open backlog states.
- Store and pack KPI views fetch bounded monthly data less frequently; detailed report screens fetch only the selected date and stop background polling when hidden.
- The UI exposes a controlled “load more” action for users who need older order rows.

## Data Flow

1. Opening an operational screen subscribes to recent orders and open backlog orders.
2. Results are merged by document ID before entering application state.
3. Clicking “ดูเพิ่มเติม” increases only the recent-order window and recreates the bounded subscription.
4. KPI reports refresh every 15 minutes while visible; normal report screens refresh every 10 minutes while visible.
5. Store issue alerts refresh every 5 minutes while visible.

## Constraints

- Driver queues retain their existing assigned and queued realtime queries.
- No schema migration or production data rewrite.
- Search/history APIs remain the source for unrestricted historical lookup.
- Existing authorization and Firestore rules remain unchanged.

## Verification

- Unit tests cover limit selection, load-more caps, and polling intervals.
- ESLint and production build must pass.
- The final diff must contain only task-related source, tests, and documentation.

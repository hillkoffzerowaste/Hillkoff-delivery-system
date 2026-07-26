# Order QR Driver Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** เพิ่ม QR เฉพาะออเดอร์สำหรับให้ลูกค้าให้คะแนนคนขับและเขียนข้อเสนอแนะ โดยรองรับรีวิวหลังส่งไม่ครบและรีวิวใหม่หลังส่งแก้ไข พร้อมใช้รีวิวล่าสุดเป็นค่าที่มีผลต่อ KPI

**Architecture:** QR จะเข้าหน้า public `/order-review` ผ่าน payload ที่ระบุออเดอร์เดียว ระบบ server จะตรวจสถานะออเดอร์และบันทึกรีวิวผ่าน API เท่านั้น ลูกค้าไม่ต้องล็อกอินหรือกรอกข้อมูลยืนยัน รีวิวล่าสุดจะถูก mirror ไว้ในเอกสารออเดอร์เพื่อให้ dashboard ที่ subscribe ออเดอร์อยู่แล้วคำนวณได้ทันที และเก็บประวัติทุกรอบไว้ใน subcollection

**Tech Stack:** Next.js App Router, React 19, Firebase Admin Firestore, client-side `qrcode`, Vitest

## Global Constraints

- QR ต้องเป็น QR รายออเดอร์ ไม่ใช่ QR ประจำตัวคนขับ
- ลูกค้าไม่ต้องกรอกชื่อ เบอร์โทร หรือยืนยันตัวตน
- ออเดอร์ `ส่งสำเร็จ` และออเดอร์ `deliveryCompleteness: "incomplete"` ที่มีหลักฐานการส่ง ต้องรีวิวได้
- ออเดอร์ที่ส่งแก้ไขแล้วใช้ QR เดิมและรีวิวใหม่ได้
- รีวิวล่าสุดเป็นค่าที่ใช้ใน KPI; รีวิวเก่าต้องเก็บไว้เป็นประวัติ
- คะแนนสะสม/ของขวัญลูกค้าไม่ผูกกับรีวิว และไม่เพิ่มจากการรีวิว
- Public client ห้ามเขียน Firestore โดยตรง; การอ่านและเขียนรีวิวผ่าน server API เท่านั้น

---

### Task 1: Define order-review contract and QR payload

**Files:**
- Create: `lib/orderReview.js`
- Test: `tests/unit/orderReview.test.js`

**Interfaces:**
- Produces `createOrderReviewPayload(orderId)`, `createOrderReviewUrl(origin, orderId)`, `parseOrderReviewPayload(value)`, `canReviewOrder(order)`, and `normalizeOrderReviewInput({ rating, feedback })`
- `canReviewOrder` returns true only for an order with a driver identity from the latest delivery attempt, a delivery timestamp, and either `status === "ส่งสำเร็จ"` or `deliveryCompleteness === "incomplete"`

- [ ] **Step 1: Write failing tests** for raw payload parsing, URL parsing, invalid IDs, valid complete delivery, valid incomplete delivery, pending order rejection, and rating/feedback limits.
- [ ] **Step 2: Run** `npm test -- --run tests/unit/orderReview.test.js` and confirm the new suite fails because the module does not exist.
- [ ] **Step 3: Implement** a versioned `HKO2|<orderId>` payload, an `/order-review?t=...` URL helper, strict order ID parsing, eligibility checks, and 1–5 integer rating normalization with a 2,000-character feedback limit.
- [ ] **Step 4: Run** the focused test and confirm it passes.

### Task 2: Preserve latest delivery identity through incomplete rework

**Files:**
- Modify: `lib/preparationWorkflow.js`
- Modify: `app/api/orders/workflow/route.js`
- Modify: `app/api/orders/create/route.js`
- Test: `tests/unit/orderReview.test.js`
- Test: `tests/unit/core.test.js`

**Interfaces:**
- Order fields: `deliveryAttemptNumber`, `lastDeliveryDriverId`, `lastDeliveryDriverName`, and `lastDeliveryAt`
- `driverReworkPatch` records the driver and timestamp of the incomplete attempt before clearing the active assignment
- `driver_complete` records the completed attempt as the latest delivery identity and increments `deliveryAttemptNumber`

- [ ] **Step 1: Add failing pure-function assertions** that an incomplete rework patch preserves the prior driver identity and that a newly created order starts with delivery attempt number `0`.
- [ ] **Step 2: Run** `npm test -- --run tests/unit/core.test.js tests/unit/orderReview.test.js` and confirm failure.
- [ ] **Step 3: Implement** additive fields in the rework patch and workflow transitions; use the supplied delivery timestamp or the server timestamp, never a client-supplied driver ID.
- [ ] **Step 4: Run** the focused suites and confirm pass.

### Task 3: Add public review API and public customer page

**Files:**
- Create: `app/api/public/order-review/route.js`
- Create: `app/order-review/page.jsx`
- Test: `tests/unit/orderReviewRoute.test.js`

**Interfaces:**
- `GET /api/public/order-review?t=HKO2%7C<orderId>` returns only `{ orderId, customerName, driverName, deliveryCompleteness, status, latestReview }`
- `POST /api/public/order-review` accepts `{ token, rating, feedback }` and returns `{ orderId, driverName, latestReview }`
- The API writes `orders/<orderId>/delivery_reviews/<autoId>` for history and mirrors `latestDeliveryReview`, `deliveryReviewRating`, `deliveryReviewFeedback`, `deliveryReviewDriverId`, `deliveryReviewDriverName`, `deliveryReviewAttempt`, `deliveryReviewSubmittedAt`, and `deliveryReviewCount` on the order

- [ ] **Step 1: Write failing route tests** for invalid token, not-found order, not-yet-delivered order, valid incomplete review, valid complete review, invalid rating, and a second review that becomes the latest while preserving the prior history write.
- [ ] **Step 2: Run** `npm test -- --run tests/unit/orderReviewRoute.test.js` and confirm failure.
- [ ] **Step 3: Implement** Admin Firestore GET/POST handlers, transactionally re-check eligibility, store the latest review on the order, and append immutable history. Do not expose phone, address, or other customer details.
- [ ] **Step 4: Implement** the mobile-friendly page with star buttons, feedback textarea, submit state, current latest-review display, and clear messages for pending/canceled orders.
- [ ] **Step 5: Run** the route test and focused page/lint checks.

### Task 4: Render an order-specific QR in the driver workflow

**Files:**
- Create: `app/components/OrderReviewQrCode.jsx`
- Modify: `app/page.jsx`
- Test: `tests/unit/orderReviewQr.test.jsx`

**Interfaces:**
- `OrderReviewQrCode({ orderId, className })` renders a QR image for `createOrderReviewUrl(window.location.origin, orderId)` and identifies the QR as belonging to the order

- [ ] **Step 1: Write failing component assertions** that the generated QR URL contains the order review route and the order ID payload.
- [ ] **Step 2: Run** the component test and confirm failure.
- [ ] **Step 3: Implement** the QR component using the existing `qrcode` dependency and render it on driver order cards, including the pre-completion card so the same QR works for complete and incomplete deliveries.
- [ ] **Step 4: Add visible copy** explaining that the customer scans after receiving the order and that incomplete deliveries can also be reviewed.
- [ ] **Step 5: Run** the focused component test and lint.

### Task 5: Add review KPI to driver and sales dashboards

**Files:**
- Modify: `app/page.jsx`
- Test: `tests/unit/orderReview.test.js`

**Interfaces:**
- Dashboard calculations use only each order's `latestDeliveryReview` mirror, so old reviews never count toward current KPI
- Driver dashboard shows the authenticated driver's average, review count, and latest feedback
- Sales/admin sidebar adds `KPI คะแนนคนขับ` and its panel shows per-driver average, review count, and latest feedback

- [ ] **Step 1: Add failing pure calculation tests** for latest-review-only aggregation and the case where an incomplete review is replaced after a corrected delivery.
- [ ] **Step 2: Run** the focused test and confirm failure.
- [ ] **Step 3: Implement** local aggregation helpers and render the driver/sales panels without adding a second Firestore listener.
- [ ] **Step 4: Verify** the customer reward/order count code path is not changed by review submission.
- [ ] **Step 5: Run** `npm run lint`, `npm test`, and `npm run build`.

### Task 6: Integrated verification and release gate

**Files:**
- Review only: all task files above

- [ ] **Step 1: Inspect** `git diff --check` and `git status --short`; exclude unrelated `repo/` and `repo.worktrees/` files.
- [ ] **Step 2: Run** `npm run lint`, `npm test`, and `npm run build` from the repository root.
- [ ] **Step 3: Manually reconcile** the acceptance criteria: per-order QR, no customer verification, incomplete delivery review, same QR after rework, latest review effective, review history retained, and customer rewards independent of review.
- [ ] **Step 4: Stage only task-related files and commit the verified change.

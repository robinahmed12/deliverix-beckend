# Deliverix — Driver Journey Implementation Task List

This task list tracks the step-by-step implementation of the **Driver Journey Lifecycle** with guaranteed **Dual-Channel Customer Notification** (In-App Notification and Branded Transactional Email) for every driver status change, as specified in [Docs/driver_joureny_implementation_plan.md](file:///C:/test/Deliverix/Docs/driver_joureny_implementation_plan.md) and [Docs/SRS.md](file:///C:/test/Deliverix/Docs/SRS.md).

---

## Progress Dashboard

| Category | Total Tasks | Completed | In Progress | Pending | Completion Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 1: Driver Availability & State** | 3 | 3 | 0 | 0 | 100% |
| **Phase 2: Email Integration & Templates** | 7 | 7 | 0 | 0 | 100% |
| **Phase 3: Outbox Payload Enrichment** | 6 | 0 | 2 | 4 | 15% |
| **Phase 4: Dual-Channel Notification Engine** | 4 | 0 | 0 | 4 | 0% |
| **Phase 5: Automated Verification & Tests** | 4 | 0 | 0 | 4 | 0% |
| **Phase 6: Manual Verification & E2E Validation** | 3 | 0 | 0 | 3 | 0% |
| **Total** | **27** | **10** | **2** | **15** | **~44%** |

```
Progress: [█████████▒▒▒▒▒▒▒▒▒▒▒] 44% (12 / 27 subtasks credited)
```

---

## Phase 1: Driver Availability & Fleet State Management

> Status: **Completed (100%)**

- [x] **Task 1.1**: Implement driver availability toggle endpoint `PUT /api/v1/drivers/me/availability` (`Offline`, `Available`, `Unavailable`).
  - *File*: `src/modules/drivers/drivers.routes.ts`, `src/modules/drivers/drivers.controller.ts`
- [x] **Task 1.2**: Enforce backend-controlled state guards (prevent manual toggle when in `Assigned` or `OnDelivery`, block when driver has open reservations).
  - *File*: `src/modules/drivers/drivers.service.ts` (`setAvailability`)
- [x] **Task 1.3**: Log availability state changes in `driverAvailabilityHistory` and record transactional audit logs.
  - *File*: `src/modules/drivers/drivers.service.ts`

---

## Phase 2: Branded Customer Email Templates

> Status: **Completed (100%)**
>
> Target directory: `src/integrations/email/templates/`

- [x] **Task 2.1**: Implement `driver-accepted.ts` template.
  - Generates HTML/text for `assignment.accepted`.
  - Content: Driver name/code, driver phone, order number, tracking URL.
  - *File*: `src/integrations/email/templates/driver-accepted.ts`
- [x] **Task 2.2**: Implement `order-picked-up.ts` template.
  - Generates HTML/text for `order.picked_up`.
  - Content: Custody transfer confirmation, pickup timestamp, driver code, tracking URL.
  - *File*: `src/integrations/email/templates/order-picked-up.ts`
- [x] **Task 2.3**: Implement `order-in-transit.ts` template.
  - Generates HTML/text for `order.in_transit`.
  - Content: In-transit notification, expected delivery window, live tracking URL.
  - *File*: `src/integrations/email/templates/order-in-transit.ts`
- [x] **Task 2.4**: Implement `order-out-for-delivery.ts` template.
  - Generates HTML/text for `order.out_for_delivery`.
  - Content: Proximity alert (driver in neighborhood), recipient availability reminder.
  - *File*: `src/integrations/email/templates/order-out-for-delivery.ts`
- [x] **Task 2.5**: Implement `order-delivered.ts` template.
  - Generates HTML/text for `order.delivered`.
  - Content: Delivery completion timestamp, recipient name, Proof of Delivery (POD) summary.
  - *File*: `src/integrations/email/templates/order-delivered.ts`
- [x] **Task 2.6**: Implement `order-failed.ts` template.
  - Generates HTML/text for `order.failed`.
  - Content: Failure reason code/text, customer support contact, rescheduling instructions.
  - *File*: `src/integrations/email/templates/order-failed.ts`
- [x] **Task 2.7**: Implement central template registry and dispatcher helper in `src/integrations/email/templates/index.ts`.
  - Provides typed `renderDriverStatusEmail(eventType, data)` returning `{ subject, html, text }`.
  - *File*: `src/integrations/email/templates/index.ts`
  - Content: Failure reason code/text, customer support contact, rescheduling instructions.
- [ ] **Task 2.7**: Implement central template registry and dispatcher helper in `src/integrations/email/templates/index.ts`.
  - Provides typed `renderDriverStatusEmail(eventType, data)` returning `{ subject, html, text }`.

---

## Phase 3: Outbox Payload Enrichment in Domain Services

> Status: **In Progress (~15%)**
>
> Requirements: `TXN-003` (domain mutation + outbox write committed atomically in one PostgreSQL transaction).

- [ ] **Task 3.1**: Enrich `AssignmentService.accept()` outbox payload.
  - *Current*: `{ assignmentId, orderId, driverId }`
  - *Target*: Add `orderNumber`, `customerId`, `acceptedAt`.
  - *File*: `src/modules/dispatch/assignment.service.ts`
- [ ] **Task 3.2**: Enrich `DeliveryService.pickup()` outbox payload.
  - *Current*: `{ orderId, driverId, attemptId }`
  - *Target*: Add `orderNumber`, `customerId`, `pickedUpAt`.
  - *File*: `src/modules/delivery/delivery.service.ts`
- [ ] **Task 3.3**: Enrich `DeliveryService.inTransit()` outbox payload.
  - *Current*: `{ orderId }`
  - *Target*: Add `orderNumber`, `customerId`, `driverId`.
  - *File*: `src/modules/delivery/delivery.service.ts`
- [ ] **Task 3.4**: Enrich `DeliveryService.outForDelivery()` outbox payload.
  - *Current*: `{ orderId }`
  - *Target*: Add `orderNumber`, `customerId`, `driverId`.
  - *File*: `src/modules/delivery/delivery.service.ts`
- [ ] **Task 3.5**: Enrich `DeliveryService.deliver()` outbox payload.
  - *Current*: `{ orderId, attemptId, driverId }`
  - *Target*: Add `orderNumber`, `customerId`, `podSummary`, `deliveredAt`.
  - *File*: `src/modules/delivery/delivery.service.ts`
- [ ] **Task 3.6**: Enrich `DeliveryService.fail()` outbox payload.
  - *Current*: `{ orderId, reasonCode, attemptId }`
  - *Target*: Add `orderNumber`, `customerId`, `driverId`, `reasonText`.
  - *File*: `src/modules/delivery/delivery.service.ts`

---

## Phase 4: Background Jobs & Dual-Channel Notification Engine

> Status: **Pending (0%)**
>
> Requirements: `JOB-001..006`, `NOT-001..006`, `ASM-003`.

- [ ] **Task 4.1**: Update `src/jobs/handlers/outbox-dispatch.ts` `resolveTarget()`.
  - Register all 6 driver lifecycle events (`assignment.accepted`, `order.picked_up`, `order.in_transit`, `order.out_for_delivery`, `order.delivered`, `order.failed`).
  - Resolve customer profile (`customer.name`, `customer.email`, `customer.accountId`), order number, and driver details.
- [ ] **Task 4.2**: Implement Guest Customer Notification Support (`ASM-003`).
  - If `customer.accountId` is null, do not fail or discard the event.
  - Allow target resolution to proceed for email delivery targeting `customer.email`.
  - *File*: `src/jobs/handlers/outbox-dispatch.ts`
- [ ] **Task 4.3**: Implement Dual-Channel Record Creation in `outbox-dispatch.ts`.
  - If `customer.accountId` exists: create `Notification` (InApp) + `NotificationDelivery` (`channel: 'InApp'`).
  - If `customer.email` exists: create `NotificationDelivery` (`channel: 'Email'`) with template payload.
  - *File*: `src/jobs/handlers/outbox-dispatch.ts`
- [ ] **Task 4.4**: Enhance `src/jobs/handlers/notification-retry.ts` Email Sender.
  - Resolve email recipient from `user.email` or fallback to `notification.payload.customerEmail` for guest customers.
  - Render HTML email bodies using `renderDriverStatusEmail()`.
  - Retain exponential backoff retry for failed email deliveries.

---

## Phase 5: Automated Verification & Testing Suite

> Status: **Pending (0%)**
>
> Coverage Target: &ge;90% branch coverage on driver notification flow (`TEST-012`).

- [ ] **Task 5.1**: Unit tests for all 6 driver milestone email templates.
  - *File*: `tests/unit/integrations/email/driver-status-templates.test.ts`
  - Assert correct subject, HTML rendering, tracking URLs, and interpolated fields.
- [ ] **Task 5.2**: Unit tests for enriched domain outbox payloads.
  - *File*: `tests/unit/modules/delivery/driver-outbox.test.ts`
  - Verify `assignment.service.ts` and `delivery.service.ts` emit outbox events with complete metadata.
- [ ] **Task 5.3**: Integration tests for outbox dual-channel dispatch job.
  - *File*: `tests/integration/jobs/outbox-driver-notifications.test.ts`
  - Verify registered customer gets both In-App and Email records.
  - Verify guest customer gets Email delivery record without foreign key errors.
- [ ] **Task 5.4**: Concurrency test for driver assignment acceptance.
  - *File*: `tests/concurrency/assignment-accept-concurrency.test.ts`
  - Race concurrent accept requests; assert atomic winner, single capacity deduction, and single notification emission.

---

## Phase 6: Manual Verification & E2E Validation

> Status: **Pending (0%)**

- [ ] **Task 6.1**: End-to-end execution of happy path:
  - Create Order &rarr; Dispatch &rarr; Accept (`assignment.accepted`) &rarr; Pickup (`order.picked_up`) &rarr; In-Transit (`order.in_transit`) &rarr; Out-For-Delivery (`order.out_for_delivery`) &rarr; Deliver (`order.delivered`).
  - Verify customer receives all 5 milestone emails and in-app notifications.
- [ ] **Task 6.2**: End-to-end execution of delivery failure path:
  - Create Order &rarr; Dispatch &rarr; Accept &rarr; Pickup &rarr; Fail (`order.failed`).
  - Verify customer receives `order.failed` email with failure reason and rescheduling guidelines.
- [ ] **Task 6.3**: Verification with guest customer:
  - Place order with unlinked guest customer (`accountId: null`).
  - Progress through driver workflow and confirm all emails are delivered without in-app FK errors.

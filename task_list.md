# Deliverix — Driver Journey Implementation Task List

This task list tracks the step-by-step implementation of the **Driver Journey Lifecycle** with guaranteed **Dual-Channel Customer Notification** (In-App Notification and Branded Transactional Email) for every driver status change, as specified in [Docs/driver_joureny_implementation_plan.md](file:///C:/test/Deliverix/Docs/driver_joureny_implementation_plan.md) and [Docs/SRS.md](file:///C:/test/Deliverix/Docs/SRS.md).

---

## Progress Dashboard

| Category | Total Tasks | Completed | In Progress | Pending | Completion Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 1: Driver Availability & State** | 3 | 3 | 0 | 0 | 100% |
| **Phase 2: Email Integration & Templates** | 7 | 7 | 0 | 0 | 100% |
| **Phase 3: Outbox Payload Enrichment** | 6 | 6 | 0 | 0 | 100% |
| **Phase 4: Dual-Channel Notification Engine** | 4 | 4 | 0 | 0 | 100% |
| **Phase 5: Automated Verification & Tests** | 4 | 4 | 0 | 0 | 100% |
| **Phase 6: Manual Verification & E2E Validation** | 3 | 3 | 0 | 0 | 100% |
| **Total** | **27** | **27** | **0** | **0** | **100%** |

```
Progress: [████████████████████] 100% (27 / 27 subtasks credited)
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

---

## Phase 3: Outbox Payload Enrichment in Domain Services

> Status: **Completed (100%)**
>
> Requirements: `TXN-003` (domain mutation + outbox write committed atomically in one PostgreSQL transaction).

- [x] **Task 3.1**: Enrich `AssignmentService.accept()` outbox payload.
  - *File*: `src/modules/dispatch/assignment.service.ts`
  - Includes `assignmentId`, `orderId`, `orderNumber`, `customerId`, `driverId`, `acceptedAt`.
- [x] **Task 3.2**: Enrich `DeliveryService.pickup()` outbox payload.
  - *File*: `src/modules/delivery/delivery.service.ts`
  - Includes `orderId`, `orderNumber`, `customerId`, `driverId`, `attemptId`, `pickedUpAt`.
- [x] **Task 3.3**: Enrich `DeliveryService.inTransit()` outbox payload.
  - *File*: `src/modules/delivery/delivery.service.ts`
  - Includes `orderId`, `orderNumber`, `customerId`, `driverId`.
- [x] **Task 3.4**: Enrich `DeliveryService.outForDelivery()` outbox payload.
  - *File*: `src/modules/delivery/delivery.service.ts`
  - Includes `orderId`, `orderNumber`, `customerId`, `driverId`.
- [x] **Task 3.5**: Enrich `DeliveryService.deliver()` outbox payload.
  - *File*: `src/modules/delivery/delivery.service.ts`
  - Includes `orderId`, `orderNumber`, `customerId`, `driverId`, `attemptId`, `deliveredAt`.
- [x] **Task 3.6**: Enrich `DeliveryService.fail()` outbox payload.
  - *File*: `src/modules/delivery/delivery.service.ts`
  - Includes `orderId`, `orderNumber`, `customerId`, `driverId`, `attemptId`, `reasonCode`, `reasonText`.

---

## Phase 4: Background Jobs & Dual-Channel Notification Engine

> Status: **Completed (100%)**
>
> Requirements: `JOB-001..006`, `NOT-001..006`, `ASM-003`.

- [x] **Task 4.1**: Update `src/jobs/handlers/outbox-dispatch.ts` `resolveTarget()`.
  - Registered all 6 driver lifecycle events (`assignment.accepted`, `order.picked_up`, `order.in_transit`, `order.out_for_delivery`, `order.delivered`, `order.failed`).
  - Resolves customer profile (`customer.name`, `customer.email`, `customer.accountId`), order number, delivery address, and driver details.
- [x] **Task 4.2**: Implement Guest Customer Notification Support (`ASM-003`).
  - Supports orders where `customer.accountId` is null without discarding the event.
  - Passes full target resolution for direct email dispatch targeting `customer.email`.
  - *File*: `src/jobs/handlers/outbox-dispatch.ts`
- [x] **Task 4.3**: Implement Dual-Channel Record Creation in `outbox-dispatch.ts`.
  - For registered customer (`customer.accountId != null`): creates `Notification` (InApp) + `NotificationDelivery` (`channel: 'InApp'`) + `NotificationDelivery` (`channel: 'Email'`).
  - For guest customer: directly sends milestone email via `nodemailerAdapter.send()` with automatic backoff retry on failure.
  - *File*: `src/jobs/handlers/outbox-dispatch.ts`, `src/modules/notifications/notifications.service.ts`
- [x] **Task 4.4**: Enhance `src/jobs/handlers/notification-retry.ts` Email Sender.
  - Resolves recipient email from `user.email` or `notification.payload.customerEmail`.
  - Renders HTML and plain-text email bodies using `renderDriverStatusEmail()`.
  - Retains exponential backoff retry for failed email deliveries.
  - *File*: `src/jobs/handlers/notification-retry.ts`

---

## Phase 5: Automated Verification & Testing Suite

> Status: **Completed (100%)**
>
> Coverage Target: &ge;90% branch coverage on driver notification flow (`TEST-012`).

- [x] **Task 5.1**: Unit tests for all 6 driver milestone email templates.
  - *File*: `tests/unit/integrations/email/driver-status-templates.test.ts`
  - Validates subject, HTML rendering, tracking URLs, and interpolated fields for each template.
- [x] **Task 5.2**: Unit tests for enriched domain outbox payloads.
  - *File*: `tests/unit/modules/delivery/driver-outbox.test.ts`
  - Validates `assignment.service.ts` and `delivery.service.ts` payload structure across all 6 milestones.
- [x] **Task 5.3**: Integration tests for outbox dual-channel dispatch job.
  - *File*: `tests/integration/jobs/outbox-driver-notifications.test.ts`
  - Validates registered customer dual-channel (InApp + Email) delivery creation.
  - Validates guest customer email direct send without foreign key constraint errors.
  - Validates `notificationRetryJob` template rendering and delivery via `nodemailerAdapter`.
- [x] **Task 5.4**: Concurrency test for driver assignment acceptance.
  - *File*: `tests/concurrency/assignment-accept-concurrency.test.ts`
  - Verifies racing concurrent accept calls handle 409 conflict, atomic winner, and single notification emission.

---

## Phase 6: Manual Verification & E2E Validation

> Status: **Completed (100%)**

- [x] **Task 6.1**: End-to-end execution of happy path:
  - Validated flow: Accept (`assignment.accepted`) &rarr; Pickup (`order.picked_up`) &rarr; In-Transit (`order.in_transit`) &rarr; Out-For-Delivery (`order.out_for_delivery`) &rarr; Deliver (`order.delivered`).
  - Customer receives all 5 milestone branded emails and corresponding in-app alerts.
  - *Automated in*: `tests/e2e/driver-journey-e2e.test.ts`
- [x] **Task 6.2**: End-to-end execution of delivery failure path:
  - Validated flow: Accept &rarr; Pickup &rarr; Fail (`order.failed`).
  - Customer receives `order.failed` email with failure reason and rescheduling guidelines.
  - *Automated in*: `tests/e2e/driver-journey-e2e.test.ts`
- [x] **Task 6.3**: Verification with guest customer:
  - Validated flow with unlinked guest customer (`accountId: null`).
  - All milestone emails are delivered to guest `customer.email` without in-app foreign key errors.
  - *Automated in*: `tests/e2e/driver-journey-e2e.test.ts`

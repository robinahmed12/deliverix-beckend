# Delivery Management System - Backend Software Requirements Specification

**Document ID:** DMS-BE-SRS-002  
**Version:** 2.0  
**Status:** Production Baseline Candidate  
**System:** Delivery Management System (Backend)  
**Primary technology constraints:** Express.js, TypeScript, Prisma 7, PostgreSQL, Zod, REST API  
**Primary frontend consumer:** Next.js 16  
**Document owner:** Product / Engineering  
**Approvers:** Product Owner, Engineering Lead, QA/SDET Lead, Security Reviewer, Operations/DevOps  
**Last updated:** 2026-09-14

---

## 0. Document Control

### 0.1 Purpose

This Software Requirements Specification (SRS) defines the functional, data, security, API, reliability, operational, and quality requirements for the Delivery Management System backend. It is the baseline agreement between Product, Engineering, QA/SDET, Security, and Operations for implementation and release acceptance.

This document describes **what the system must do and the quality level it must achieve**. Detailed code structure, class design, infrastructure vendor choices, and low-level implementation details belong in architecture documents, ADRs, runbooks, and source-controlled configuration unless this SRS explicitly constrains them.

### 0.2 Normative Language

The terms **MUST**, **MUST NOT**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

- **MUST / SHALL**: required for release unless formally waived.
- **SHOULD**: expected unless a documented reason is approved.
- **MAY**: optional behavior.

Each testable requirement has a stable identifier such as `ORD-001` or `SEC-012`. Requirement identifiers must not be reused for different requirements after publication.

### 0.3 Change Control

Changes that affect business behavior, security boundaries, public API contracts, state transitions, data retention, performance targets, or release criteria require:

1. an SRS change or approved change request;
2. impact analysis for database, API, frontend, tests, monitoring, and migration;
3. updated acceptance criteria and traceability;
4. approval by the accountable product and engineering owners.

### 0.4 Revision Summary

| Version | Summary |
|---|---|
| 1.0 | Initial production-oriented backend SRS |
| 2.0 | Added requirement IDs, clarified lifecycles, measurable acceptance criteria, security/privacy baseline, API conventions, data lifecycle, operations, job processing, traceability, release gates, and production readiness criteria |

---

## 1. Product Vision and System Scope

### 1.1 System Objective

The backend SHALL manage delivery orders from creation through dispatch, assignment, pickup, transportation, delivery, failure handling, rescheduling, cancellation, and return to sender/facility.

The backend is the authoritative owner of:

- business rules;
- authentication and authorization;
- workflow/state enforcement;
- persistence and data integrity;
- audit history;
- proof-of-delivery validation;
- dispatch and driver eligibility;
- reporting definitions;
- integration boundaries;
- notification event generation.

The Next.js frontend MUST consume backend APIs and MUST NOT access the application database directly.

### 1.2 In Scope

The production baseline includes:

- staff and driver authentication;
- role/permission management;
- customer management;
- delivery orders and package items;
- drivers, vehicles, zones, and service configuration;
- manual dispatch;
- assignment offers and driver acceptance/rejection;
- pickup and delivery workflow;
- delivery attempts, failures, rescheduling, and returns;
- proof of delivery;
- order tracking and customer timeline;
- in-app notifications;
- email for identity workflows;
- dashboards and reports;
- audit history;
- API validation and consistent errors;
- concurrency control and idempotency;
- file security;
- monitoring and alerting;
- backups and recovery testing;
- automated testing;
- containerized deployment;
- CI/CD and controlled database migrations.

### 1.3 Optional Extensions

The following are outside the baseline but MAY be enabled through separately approved requirements:

- live GPS tracking;
- geographic polygon zones;
- automatic assignment;
- advanced ETA estimation;
- route optimization;
- SMS notifications;
- mobile push notifications;
- OTP-based delivery confirmation;
- native mobile applications;
- multi-tenant or multi-branch isolation.

### 1.4 Explicitly Out of Scope

The baseline SHALL NOT provide:

- payment processing;
- cash collection or reconciliation;
- inventory/warehouse stock management;
- payroll;
- marketplace seller operations;
- partial package delivery;
- post-pickup driver-to-driver custody transfer unless a future custody-transfer workflow is approved.

Recording an order monetary amount does not imply payment collection, settlement, invoicing, or accounting functionality.

---

## 2. Standards and Engineering Baseline

The project SHOULD align its requirements and verification approach with recognized industry guidance, including:

- ISO/IEC/IEEE 29148 requirements-engineering practices;
- OWASP Application Security Verification Standard (ASVS) 5.0.0 as the application security verification baseline;
- OWASP API Security Top 10 (2023) for API-specific risk coverage;
- RFC 9457 for HTTP Problem Details;
- OpenAPI 3.1.x or later compatible version supported by the selected tooling;
- semantic versioning and documented API deprecation rules for public contracts.

Where external standards conflict with approved business or regulatory requirements, the stricter applicable requirement SHALL take precedence.

---

## 3. Stakeholders, Actors, and Access Boundaries

### 3.1 Primary Stakeholders

- Product Owner
- Operations / Dispatch team
- Drivers
- Customer support
- Customers
- Engineering
- QA/SDET
- Security
- DevOps / SRE
- Business/reporting stakeholders

### 3.2 Application Roles

| Capability | Admin | Dispatcher | Driver | Customer | Support |
|---|---|---|---|---|---|
| Manage users, roles, settings | Yes | No | No | No | No |
| Manage drivers, vehicles, zones | Yes | Operational update | Own availability only | No | Limited read |
| Create orders | Yes | Yes | No | No | No |
| View orders | All authorized | Operational | Own assignments | Own orders | Permitted support orders |
| Edit orders | Allowed states | Allowed states | No | No | No |
| Assign/reassign | Yes | Yes | No | No | No |
| Accept/reject assignment | No | No | Own offers | No | No |
| Update delivery progress | No | No | Own active assignment | No | No |
| Submit proof | No | No | Own active delivery | No | No |
| Cancel/reschedule/return | Yes | Yes | Limited request only if later approved | No | No |
| View tracking/proof | Authorized | Authorized | Own | Own | Limited |
| Reports | All | Operational | Own summary | No | Limited |
| Audit logs | Yes | No by default | No | No | No |

### 3.3 Authorization Rules

**AUTHZ-001** The backend MUST authorize every request independently of frontend behavior.

**AUTHZ-002** Authorization MUST evaluate role permission, resource ownership/scope, current assignment, account state, and workflow state where applicable.

**AUTHZ-003** Nested resources, file downloads, exports, reports, internal notes, proof files, and tracking endpoints MUST enforce the same authorization rules as their parent resources.

**AUTHZ-004** The backend MUST NOT trust client-supplied roles, ownership identifiers, calculated eligibility, prices, fees, or workflow state.

**AUTHZ-005** Authorization failures MUST NOT reveal the existence of resources when concealment is required; such cases MAY return `404` instead of `403`.

---

## 4. Assumptions, Constraints, and Dependencies

### 4.1 Business Assumptions

**ASM-001** The baseline serves one delivery organization; tenant and branch isolation are excluded.

**ASM-002** Admin or Dispatcher creates orders. Customer self-service booking is excluded from the baseline.

**ASM-003** Customers may exist without login accounts. Linking a customer account requires verified ownership of an approved contact method.

**ASM-004** One order represents one package group with one pickup location and one destination.

**ASM-005** Partial delivery is not supported.

**ASM-006** A driver may hold one reserved/open assignment at a time under the initial policy. A future configurable workload policy requires explicit approval and concurrency redesign/testing.

**ASM-007** Driver acceptance is required. Assignment offers expire after five minutes by default.

**ASM-008** Customer-requested cancellations are executed by authorized staff in the baseline.

**ASM-009** Reassignment is allowed before pickup. Post-pickup transfer is prohibited until a dedicated custody-transfer workflow exists.

**ASM-010** Default proof of delivery requires recipient name plus one delivery photograph.

**ASM-011** Timestamps are stored in UTC. User-visible dates and reports use a configured business timezone.

**ASM-012** Monetary values use a configured ISO 4217 currency and fixed-precision decimal representation.

### 4.2 Technical Constraints

**TEC-001** Backend services SHALL use TypeScript with strict type checking.

**TEC-002** PostgreSQL SHALL be the authoritative transactional data store.

**TEC-003** Prisma 7 SHALL be used as the primary application data-access layer, while reviewed SQL migrations MAY be used for database constraints or indexes not expressible safely through Prisma.

**TEC-004** Request validation SHALL use Zod or equivalent centrally defined schemas approved by Engineering.

**TEC-005** External proof files SHALL use private object storage rather than public object URLs or database blobs.

**TEC-006** Durable workflow state, idempotency records, jobs, and distributed coordination MUST NOT depend only on process memory.

### 4.3 External Dependencies

The production system depends on:

- PostgreSQL;
- private object storage;
- email provider;
- malware/file scanning capability;
- deployment/container platform;
- secrets management;
- centralized logging/metrics/tracing platform;
- backup storage;
- optional shared cache/coordination or durable queue technology where required by the final architecture.

Failure of a non-critical external provider MUST NOT corrupt committed delivery state.

---

## 5. Domain Terminology

| Term | Definition |
|---|---|
| Order | Delivery request containing customer, pickup, destination, package, service, fee, and promise snapshots |
| Assignment | Relationship between an order and a driver for an offered/accepted delivery responsibility |
| Assignment Offer | Time-limited reservation presented to an eligible driver |
| Attempt | One delivery execution attempt beginning at pickup or authorized retry and ending in Delivered or Failed |
| Custody | Current accountable holder of the physical delivery: driver or authorized facility |
| Proof of Delivery (POD) | Evidence required to mark an order Delivered |
| Promise Window | Original committed delivery date/time window snapshotted on the order |
| Reschedule Window | Later planned delivery window recorded without changing the original promise used for service-level reporting |
| Terminal State | Final order state after which normal workflow transitions are not allowed |
| Resource Version | Monotonic version/ETag used to detect stale writes |
| Idempotency Key | Client-provided key that identifies a logical mutation retry |
| Outbox Event | Durable event written in the same transaction as domain state for later asynchronous processing |

---

## 6. Core Business Rules

**BR-001** Historical order addresses, service type, applicable proof policy, promised window, delivery fee, and currency MUST be snapshotted and MUST NOT change when master/configuration records later change.

**BR-002** Historical orders, delivery proofs, status history, attempts, custody history, and audit records MUST NOT be hard-deleted through normal application APIs.

**BR-003** Material delivery details (destination, pickup, service, package) MUST NOT be changed after pickup unless a separately approved exception workflow exists.

**BR-004** Every workflow transition MUST be validated by the backend against the current committed state.

**BR-005** A user MUST NOT create or update a relationship to a resource the user cannot independently access or manage.

**BR-006** Business actions requiring a reason MUST store both a stable reason code and optional/required human explanation according to configuration.

**BR-007** The authoritative current state MUST be derivable from committed domain records and MUST agree with history records.

**BR-008** Notification or analytics failure MUST NOT roll back an otherwise valid committed domain transition.

**BR-009** Security-sensitive and irreversible actions MUST be attributable to an authenticated actor or clearly identified trusted system process.

---

## 7. Lifecycle Models

### 7.1 Order Status Model

To avoid ambiguity between an **assignment offer** and an **accepted assignment**, this SRS separates order status from assignment status.

Order statuses:

`Pending`, `ReadyForPickup`, `Assigned`, `PickedUp`, `InTransit`, `OutForDelivery`, `Failed`, `ReturnInProgress`, `Delivered`, `Cancelled`, `Returned`.

**Lifecycle clarification:** creating an assignment offer does **not** by itself change the order to `Assigned`. The order remains `ReadyForPickup` while the offer is `Offered`; successful driver acceptance atomically changes the order to `Assigned`.

| Current order state | Permitted next state | Mandatory condition |
|---|---|---|
| Pending | ReadyForPickup | Order passes readiness validation |
| Pending | Cancelled | Authorized actor and reason |
| ReadyForPickup | Assigned | Active offered driver accepts valid offer |
| ReadyForPickup | Cancelled | Authorized actor and reason; offer released if present |
| Assigned | ReadyForPickup | Accepted assignment withdrawn before pickup under authorized reassignment/cancellation recovery |
| Assigned | PickedUp | Current accepted driver confirms pickup |
| Assigned | Cancelled | Only before pickup; assignment released atomically |
| PickedUp | InTransit | Current driver |
| InTransit | OutForDelivery | Current driver |
| OutForDelivery | Delivered | Required POD complete and valid |
| PickedUp/InTransit/OutForDelivery | Failed | Failure reason required |
| Failed | InTransit | Authorized retry with custody retained |
| Failed | ReadyForPickup | Physical return to authorized pickup/facility verified |
| Failed | ReturnInProgress | Authorized return workflow started |
| ReturnInProgress | Returned | Return evidence and receipt verified |

`Delivered`, `Cancelled`, and `Returned` are terminal.

**WF-001** Arbitrary status assignment endpoints are prohibited.

**WF-002** Every status transition MUST record previous state, new state, actor/system actor, UTC committed timestamp, reason where applicable, resource version, and request/trace ID.

**WF-003** Duplicate logical transitions MUST be rejected or resolved idempotently without duplicate history or side effects.

### 7.2 Assignment Status Model

Assignment statuses:

`Offered`, `Accepted`, `Rejected`, `Expired`, `Withdrawn`, `Released`, `Completed`.

| Current assignment state | Next state | Condition |
|---|---|---|
| Offered | Accepted | Offered driver accepts before expiry and eligibility/capacity still valid |
| Offered | Rejected | Offered driver rejects |
| Offered | Expired | Offer timeout reached |
| Offered | Withdrawn | Authorized dispatcher/admin withdraws |
| Accepted | Released | Pre-pickup authorized cancellation/reassignment |
| Accepted | Completed | Delivery or approved return workflow ends assignment responsibility |

**ASN-001** Only one open offer/accepted assignment may exist per order.

**ASN-002** Under the initial single-workload policy, only one reserved or accepted assignment may exist per driver.

**ASN-003** Offer expiration MUST release reserved capacity exactly once.

**ASN-004** Accept, reject, withdraw, expire, and reassign operations MUST be concurrency-safe.

### 7.3 Driver Operational State

Driver operational states are `Offline`, `Available`, `Assigned`, `OnDelivery`, and `Unavailable`.

**DRV-001** Driver self-service MAY change only explicitly user-controlled availability attributes.

**DRV-002** Assignment-derived states MUST be calculated/controlled by backend workflow and MUST NOT be directly set by the driver client.

---

## 8. Functional Requirements

### 8.1 Identity, Authentication, and Session Management

**IAM-001** Public staff registration MUST be disabled.

**IAM-002** Admin MUST be able to invite staff and driver accounts.

**IAM-003** The system MUST support login, refresh, logout, logout-all, password recovery, invitation acceptance, account deactivation, and current-user profile retrieval.

**IAM-004** Admin accounts MUST use MFA. MFA for additional privileged roles SHOULD be configurable.

**IAM-005** Access tokens MUST be short-lived signed tokens. Proposed default lifetime: 15 minutes.

**IAM-006** Refresh credentials MUST rotate on use and MUST support token-family reuse detection.

**IAM-007** Proposed default refresh session lifetime is seven days, subject to final security policy.

**IAM-008** The system MUST revoke applicable sessions/token families after password reset, logout-all, confirmed refresh-token reuse, or account suspension.

**IAM-009** Passwords MUST be hashed with Argon2id using parameters reviewed for the production environment.

**IAM-010** Invitation, password-reset, and similar identity tokens MUST be random, single-use, purpose-bound, time-limited, and stored only as protected verifiers where practical.

**IAM-011** Authentication and password-recovery flows MUST avoid account enumeration.

**IAM-012** Browser authentication MUST NOT require storing long-lived credentials in browser local storage.

### 8.2 Role and Permission Management

**RBAC-001** Admin MUST be able to manage users, roles, permissions, and user-role assignments.

**RBAC-002** Permission changes MUST take effect according to a documented cache/session invalidation policy and MUST NOT require users to retain permissions until token natural expiry when immediate revocation is required.

**RBAC-003** Privilege grants, revocations, account activation/deactivation, and MFA reset actions MUST be audited.

### 8.3 Customer Management

**CUS-001** Authorized staff MUST be able to create, view, and update customer profiles.

**CUS-002** Customer profiles MUST store permitted name and contact information using normalized formats where applicable.

**CUS-003** Customer saved addresses MAY be created/updated without modifying existing order address snapshots.

**CUS-004** Duplicate contact values MUST NOT automatically merge customers or expose another customer's orders.

**CUS-005** Customer-to-login-account linking MUST require verified contact ownership and MUST be auditable.

**CUS-006** Customer users MUST only access their linked customer resources and orders.

### 8.4 Order Management

**ORD-001** Each order MUST have an opaque immutable internal ID and a unique immutable human-facing order number.

**ORD-002** Order creation MUST capture customer, recipient, pickup/delivery address snapshots, package items, service type, applicable zone, instructions, amount, currency, fee, and promised window as applicable.

**ORD-003** Quantities, weight, and dimensions MUST be positive when supplied and MUST include defined units.

**ORD-004** Zone selection and delivery fee calculation MUST be performed server-side from approved configuration.

**ORD-005** Manual fee override MUST require explicit permission, a reason, and audit history.

**ORD-006** Material order edits MUST be allowed only in `Pending` or `ReadyForPickup`, except through separately authorized workflows.

**ORD-007** The backend MUST reject material address, package, or service changes after pickup.

**ORD-008** Order cancellation MUST validate the current order state and release any open offer/assignment atomically when applicable.

**ORD-009** The customer-visible timeline MUST be generated from committed status/history data and MUST not expose internal-only notes or security-sensitive metadata.

**ORD-010** Normal APIs MUST not hard-delete orders.

**ORD-011** Order readiness MUST validate required addresses, items, zone/service availability, proof policy, and required business fields.

**ORD-012** Search/filter behavior MUST enforce role/ownership boundaries before returning results or counts.

### 8.5 Driver Management

**DRV-003** Driver records MUST contain a unique driver identifier, account link, contact details, license/qualification information, validity dates where applicable, active state, and preferred/allowed zones.

**DRV-004** Inactive, suspended, expired/unqualified, or otherwise ineligible drivers MUST NOT receive new assignment offers.

**DRV-005** Deactivating a driver with open work MUST require resolution of active reservations/assignments in the same controlled operational workflow or be rejected.

**DRV-006** Driver eligibility decisions MUST be server-side and reproducible from committed data.

### 8.6 Vehicle Management

**VEH-001** Vehicles MUST have unique registration, type, capacity value and unit, operational status, and optional qualification metadata required by policy.

**VEH-002** Maintenance, inactive, or incompatible vehicles MUST NOT be used for new assignments.

**VEH-003** Vehicle-to-driver allocation history MUST preserve effective timestamps.

**VEH-004** Vehicle suitability rules MUST define how package size/weight and service requirements map to vehicle eligibility.

### 8.7 Dispatch and Assignment

**DSP-001** Only `ReadyForPickup` orders MAY receive a new assignment offer.

**DSP-002** Eligibility MUST evaluate driver account state, qualifications, availability, existing workload/reservations, zone rules, vehicle suitability, and any configured service restrictions.

**DSP-003** Creating an assignment offer MUST reserve driver capacity before the operation succeeds.

**DSP-004** Only the offered driver MAY accept or reject an unexpired offer.

**DSP-005** Acceptance MUST revalidate assignment/open-order state and required eligibility that may have changed since offer creation.

**DSP-006** Rejection, expiry, or withdrawal MUST release reserved capacity exactly once.

**DSP-007** Reassignment before pickup MUST atomically close/release the previous assignment and create/reserve the replacement offer or return the order safely to the dispatch queue if replacement creation fails.

**DSP-008** Reassignment history MUST include actor, previous driver, new driver where known, timestamps, and reason.

**DSP-009** Automatic assignment, if later enabled, MUST use the same eligibility, authorization, auditing, and concurrency rules as manual dispatch.

**DSP-010** Dispatch queue responses SHOULD include only fields required for operational decisions and MUST not expose restricted PII unnecessarily.

### 8.8 Delivery Execution

**DEL-001** Only the current accepted driver MAY perform pickup and driver-controlled delivery transitions.

**DEL-002** Pickup MUST create/open the first delivery attempt and establish driver custody atomically.

**DEL-003** `InTransit` and `OutForDelivery` transitions MUST require current assignment/custody and valid previous state.

**DEL-004** Delivery completion MUST require the active attempt and required POD evidence.

**DEL-005** Delivery completion MUST atomically validate proof, transition order state, close the attempt, complete/release assignment responsibility, record status history, record required audit data, update custody, and write required outbox events.

**DEL-006** A successfully completed delivery MUST not be possible more than once, including under concurrent requests.

### 8.9 Attempts and Failure Handling

**ATT-001** A delivery attempt begins at pickup or an authorized retry and ends only in `Delivered` or `Failed`.

**ATT-002** Assignment rejection, expiry, or withdrawal is not a delivery attempt.

**ATT-003** Attempt numbers MUST be unique per order and sequential according to a documented rule.

**ATT-004** Failure MUST require a configured active failure reason.

**ATT-005** Failure reason `Other` MUST require a non-empty explanation with configured length limits.

**ATT-006** Proposed default maximum attempts is three. The effective limit MUST be snapshotted or otherwise historically explainable if configuration changes later.

**ATT-007** Exceeding the maximum retry policy MUST require an authorized return/escalation decision rather than silently creating additional attempts.

### 8.10 Rescheduling

**RSC-001** Rescheduling MUST preserve the original promise window used for on-time reporting.

**RSC-002** Each reschedule record MUST store previous effective window, new window, reason, actor, order/attempt reference, and timestamp.

**RSC-003** Reschedule authorization and permitted states MUST be configurable/documented and enforced server-side.

### 8.11 Returns and Custody

**RET-001** Custody MUST identify the currently accountable driver or authorized facility after physical pickup.

**RET-002** Starting a return MUST require an authorized actor and valid state.

**RET-003** `Returned` MUST require return evidence plus verified receipt by an authorized sender/facility actor or process.

**RET-004** Return evidence MUST be associated with the same order and return record.

**RET-005** Custody changes MUST be append-only events and MUST retain actor, from/to custody, timestamp, and reason/source action.

### 8.12 Proof of Delivery

**POD-001** Supported evidence types include recipient name, photo, signature, confirmation flag, and optional OTP according to the order's effective proof policy.

**POD-002** Evidence MUST belong to the same order, attempt, and authorized current driver unless an explicitly approved correction process applies.

**POD-003** Files MUST complete required validation, normalization, and malware scanning before they can satisfy final delivery proof requirements.

**POD-004** Final proof records MUST be immutable. Corrections MUST create a new attributed record or correction event and preserve previous evidence/history.

**POD-005** Default proof policy requires recipient name plus at least one valid delivery photo.

**POD-006** Proof retrieval MUST enforce order-level authorization and private file access controls.

**POD-007** If OTP is enabled, each challenge MUST be purpose-bound, protected at rest as a verifier, expire after five minutes by default, allow at most five verification attempts, enforce resend throttling, and become unusable after successful consumption.

### 8.13 Tracking and Location

**TRK-001** REST polling is the baseline tracking mechanism.

**TRK-002** If GPS is enabled, each location record MUST include driver, assignment, captured-at timestamp, received-at timestamp, coordinates, and accuracy metadata when available.

**TRK-003** Customer access MUST expose only the latest location permitted by policy during active delivery, not the driver's complete historical route.

**TRK-004** Terminal orders MUST NOT expose live driver location.

**TRK-005** Out-of-order, unreasonably future, physically implausible, or poor-quality coordinates MUST be rejected or explicitly flagged according to documented rules.

**TRK-006** Locations older than two minutes are considered stale by default and MUST be identified as such to clients.

**TRK-007** Any ETA shown to users MUST be labeled as an estimate and MUST include a calculation timestamp.

### 8.14 Zones, Services, and Configuration

**CFG-001** Admin MUST manage delivery zones, zone coverage, fees, supported service types, availability, proof policies, failure reasons, and workflow settings.

**CFG-002** Overlapping zones MUST either be rejected or resolved deterministically by explicit priority.

**CFG-003** Deactivated zones/services MUST block new applicable order readiness while preserving historical snapshots.

**CFG-004** Referenced configuration records MUST be deactivated/versioned rather than destructively deleted.

**CFG-005** Security-sensitive configuration changes MUST be audited with before/after values redacted where necessary.

**CFG-006** Configuration affecting already-created orders MUST define whether behavior is snapshotted at order creation/readiness or evaluated dynamically.

### 8.15 Notifications

**NOT-001** In-app notifications MUST support assignment, reassignment, pickup, transit, out-for-delivery, delivery, failure, overdue, and return events where applicable.

**NOT-002** Email MUST support staff invitations and password recovery in the baseline.

**NOT-003** Notification processing MUST use durable events/jobs with retries, exponential/backoff policy, deduplication, provider reference capture, and dead-letter/error handling.

**NOT-004** Notification failure MUST NOT roll back a committed domain transaction.

**NOT-005** Reprocessing the same outbox event MUST NOT create uncontrolled duplicate user notifications.

**NOT-006** Notification content MUST minimize PII and MUST not expose sensitive delivery details through insecure channels.

### 8.16 Dashboards and Reports

**REP-001** Required operational metrics include deliveries today, pending deliveries, active deliveries, driver availability, status distribution, on-time rate, average delivery time, failed rate, driver performance, and zone performance.

**REP-002** Every report response/export MUST identify timezone, date field/basis, filters, calculation timestamp, and metric definitions or version.

**REP-003** Zero denominators MUST return `null` for ratios/rates and sample size zero rather than divide-by-zero or misleading `0%`.

**REP-004** Orders without a promised window MUST be excluded from on-time calculations and counted separately where useful.

**REP-005** Lateness MUST be measured against the original promise, even after rescheduling, unless a separately named metric explicitly uses rescheduled commitment.

**REP-006** Report queries MUST enforce authorization at row and aggregate level so restricted users cannot infer hidden data from counts.

**REP-007** Synchronous reports MUST default to bounded date ranges and MUST reject or redirect queries beyond the supported synchronous limit.

### 8.17 Audit and Internal Notes

**AUD-001** Runtime logs and immutable business audit records MUST be separate concerns.

**AUD-002** Audit records for critical actions MUST include actor/system actor, action, resource type/id, timestamp, reason where applicable, redacted change summary, request/trace ID, and result.

**AUD-003** Critical audit writes MUST commit in the same transaction as the associated state change when atomic attribution is required.

**AUD-004** Application users MUST NOT edit or delete audit records.

**AUD-005** Internal notes MUST have explicit visibility rules and MUST never be exposed to customers unless a separate public-note feature is designed.

**AUD-006** Access to highly sensitive proof files and security administration actions SHOULD be audit recorded.


---

## 9. Data Model and Persistence Requirements

### 9.1 Core Entities

The baseline data model includes at least:

- `User`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `Session`
- `RefreshCredential`
- `Customer`
- `CustomerAddress`
- `Driver`
- `DriverAvailabilityHistory`
- `Vehicle`
- `DriverVehicleAssignment`
- `DeliveryZone`
- `ZoneArea`
- `DriverZone`
- `ServiceType`
- `ProofPolicyVersion`
- `DeliveryOrder`
- `DeliveryItem`
- `DeliveryAssignment`
- `DeliveryStatusHistory`
- `DeliveryAttempt`
- `DeliveryFailureReason`
- `RescheduleRecord`
- `CustodyEvent`
- `ReturnRecord`
- `DeliveryProof`
- `FileObject`
- `OtpChallenge`
- `DriverLocation`
- `InternalNote`
- `Notification`
- `NotificationDelivery`
- `OutboxEvent`
- `IdempotencyRecord`
- `AuditLog`

### 9.2 Relationship Requirements

**DATA-001** One customer MAY own many orders.

**DATA-002** One order MAY contain many items, status events, attempts, proofs, notes, notifications, and custody events.

**DATA-003** One driver MAY have many historical assignments, vehicle allocations, zone relationships, and location records.

**DATA-004** An order MUST have at most one current open assignment/offered reservation.

**DATA-005** Historical relationships MUST remain queryable after current relationships change when required for audit/reporting.

### 9.3 Database Integrity

**DATA-006** Primary business entities MUST use opaque identifiers that are not safely enumerable.

**DATA-007** Foreign keys, unique constraints, check constraints, and restrictive deletion behavior MUST enforce invariants at database level where practical.

**DATA-008** Database uniqueness MUST enforce order number, driver identifier, vehicle registration, and attempt number per order.

**DATA-009** Database constraints/transactional locking MUST prevent more than one open assignment per order and, under the initial policy, more than one reserved/accepted assignment per driver.

**DATA-010** Monetary fields MUST use PostgreSQL `numeric`/decimal-compatible storage and MUST NOT rely on floating-point arithmetic for authoritative values.

**DATA-011** Time values MUST use timezone-aware storage conventions and be persisted in UTC.

**DATA-012** Frequently queried access paths MUST be indexed, including ownership/scope, order status/date, dispatch queue, assignment state/expiry, timelines, notifications, outbox processing, idempotency lookup, and audit search.

**DATA-013** Index creation and migration strategy MUST avoid unacceptable production locking for expected table sizes.

**DATA-014** Production schema changes MUST use reviewed migrations; destructive schema synchronization commands MUST NOT be used in production.

### 9.4 Data Classification

The application SHALL classify data at minimum into:

- Public/non-sensitive configuration;
- Internal operational data;
- Personal data/PII;
- Sensitive authentication/security data;
- Sensitive proof/location data;
- Audit/security records.

**PRIV-001** Logs, metrics, traces, and error responses MUST minimize personal and secret data.

**PRIV-002** Passwords, raw refresh tokens, OTP values, secret keys, and equivalent authenticators MUST never be logged.

**PRIV-003** Sensitive data fields SHOULD be documented in a data dictionary with storage, masking, access, retention, and deletion rules.

### 9.5 Retention Baseline

Proposed retention, subject to applicable law, contracts, and approved business policy:

| Data class | Proposed retention |
|---|---|
| Operational application logs | 30 days |
| Security logs | 90 days |
| Driver GPS history | 30 days |
| In-app notifications | 90 days |
| Proof files | 180 days after terminal status |
| Orders and audit records | 24 months minimum |
| Idempotency outcomes | At least 24 hours |
| Abandoned unlinked uploads | 24 hours |

**RETENTION-001** Retention jobs MUST not delete records under legal hold or other approved preservation requirements.

**RETENTION-002** Deletion/expiry jobs MUST be observable, retry-safe, and auditable where legally or operationally required.

---

## 10. REST API Contract Requirements

### 10.1 General API Rules

**API-001** All baseline endpoints MUST be versioned under `/api/v1`.

**API-002** The API MUST publish an OpenAPI contract that describes request/response schemas, security, status codes, validation constraints, pagination, idempotency, and concurrency requirements.

**API-003** Runtime behavior and generated documentation MUST use a single source of truth or be automatically checked for drift.

**API-004** Request and response models MUST be explicit DTOs/safe projections; database models MUST NOT be serialized directly by default.

**API-005** Unknown fields in mutation requests MUST be rejected unless an endpoint explicitly documents forward-compatible extension behavior.

**API-006** Date/time values MUST use ISO 8601/RFC 3339 compatible representations with timezone/UTC semantics documented.

**API-007** Monetary JSON values MUST use a representation that avoids binary floating-point precision loss; the selected contract MUST be consistent across endpoints.

**API-008** API responses MUST include a request/trace identifier through a documented header and/or problem response extension.

**API-009** Breaking API changes require a new API version or an approved compatibility/deprecation plan.

### 10.2 Endpoint Inventory

#### Authentication

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/mfa/verify`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/accept-invitation`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/mfa/enrollment`
- `POST /api/v1/auth/mfa/enrollment/confirm`

#### Users and Roles

- `GET /api/v1/users`
- `POST /api/v1/users`
- `GET /api/v1/users/{id}`
- `PATCH /api/v1/users/{id}`
- `PUT /api/v1/users/{id}/roles`
- `GET /api/v1/roles`

#### Customers

- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/{id}`
- `PATCH /api/v1/customers/{id}`
- customer-address endpoints under `/api/v1/customers/{id}/addresses`

#### Drivers and Fleet

- `GET /api/v1/drivers`
- `POST /api/v1/drivers`
- `GET /api/v1/drivers/{id}`
- `PATCH /api/v1/drivers/{id}`
- `PUT /api/v1/drivers/me/availability`
- `GET /api/v1/drivers/me/assignments`
- driver history and zone endpoints
- vehicle CRUD endpoints
- vehicle allocation endpoints

#### Orders

- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/orders/{id}`
- `PATCH /api/v1/orders/{id}`
- `POST /api/v1/orders/{id}/ready`
- `POST /api/v1/orders/{id}/cancel`
- `GET /api/v1/orders/{id}/history`
- internal-note endpoints

#### Dispatch and Assignment

- `GET /api/v1/dispatch/queue`
- `GET /api/v1/dispatch/workloads`
- `POST /api/v1/orders/{id}/assignments`
- `POST /api/v1/assignments/{id}/accept`
- `POST /api/v1/assignments/{id}/reject`
- `POST /api/v1/assignments/{id}/withdraw`
- `POST /api/v1/orders/{id}/reassign`

#### Delivery Execution

- `POST /api/v1/orders/{id}/pickup`
- `POST /api/v1/orders/{id}/in-transit`
- `POST /api/v1/orders/{id}/out-for-delivery`
- `POST /api/v1/orders/{id}/fail`
- `POST /api/v1/orders/{id}/reschedule`
- `POST /api/v1/orders/{id}/return`
- `POST /api/v1/orders/{id}/return-proof`
- `POST /api/v1/orders/{id}/confirm-return`
- `POST /api/v1/orders/{id}/confirm-pickup-receipt`
- `POST /api/v1/orders/{id}/proofs`
- `POST /api/v1/orders/{id}/deliver`
- `GET /api/v1/orders/{id}/attempts`
- `GET /api/v1/orders/{id}/proofs`
- `GET /api/v1/orders/{id}/tracking`

#### Configuration, Notifications, Reports, Operations

- zone endpoints
- service-type endpoints
- failure-reason endpoints
- proof-policy endpoints
- settings endpoints
- notification list/read endpoints
- dashboard endpoints
- delivery/driver/zone report endpoints
- `GET /api/v1/audit-logs`
- `GET /health/live`
- `GET /health/ready`

Optional endpoint groups MAY include driver-location ingestion, OTP verification, automatic assignment, and asynchronous exports.

### 10.3 HTTP Semantics

**API-010** `GET` requests MUST be side-effect free from the client's business perspective.

**API-011** Successful resource creation SHOULD return `201 Created` and a resource identifier/location where appropriate.

**API-012** Deletion/deactivation semantics MUST be explicit; historical business records SHOULD use state/deactivation instead of destructive DELETE.

**API-013** Conditional update requirements MUST use `If-Match`/ETag or an equivalent documented resource-version mechanism.

**API-014** Endpoints requiring a concurrency precondition MUST return `428 Precondition Required` when the precondition is missing.

**API-015** A stale resource version SHOULD return `412 Precondition Failed`; business-state conflicts MAY return `409 Conflict`.

### 10.4 Pagination, Filtering, Search, and Sorting

**PAGE-001** All unbounded/growing collections MUST be paginated.

**PAGE-002** Default page size is 20 and maximum page size is 100 unless a specific endpoint defines a stricter limit.

**PAGE-003** Orders, audits, notifications, and tracking/history feeds SHOULD use opaque cursor pagination with deterministic tie-breakers.

**PAGE-004** Offset pagination MAY be used for small, bounded configuration tables.

**PAGE-005** Orders MUST support authorized filtering by order number, customer, status, driver, zone, service type, and date range as applicable.

**PAGE-006** Date filters MUST document which date field they apply to.

**PAGE-007** Sortable/filterable fields MUST be allowlisted server-side.

**PAGE-008** Unrestricted regular expressions or user-controlled database expressions are prohibited.

**PAGE-009** Search input length and complexity MUST be bounded.

**PAGE-010** Synchronous report/query windows SHOULD be limited to 90 days unless an asynchronous export/report job is implemented.

---

## 11. Validation and Error Handling

### 11.1 Validation

**VAL-001** The backend MUST validate request bodies, path parameters, query parameters, headers, IDs, enums, date/time values, decimal values, coordinates, file metadata, and allowed fields.

**VAL-002** Cross-field validation MUST be enforced for rules that cannot be validated independently per field.

**VAL-003** Schema validation does not replace database relationship, authorization, current-state, or eligibility validation.

**VAL-004** Validation rules shared with frontend code MUST remain authoritative on the backend.

### 11.2 Error Contract

Errors SHOULD use `application/problem+json` compatible with RFC 9457.

Minimum fields:

- `type`
- `title`
- `status`
- `detail` or a safe message
- `instance` where useful
- stable application `code`
- `requestId`
- structured field errors when applicable

**ERR-001** Error responses MUST NOT expose stack traces, SQL, Prisma internals, secrets, raw provider credentials, or internal filesystem paths.

**ERR-002** Stable business error codes MUST be documented and suitable for frontend handling.

### 11.3 HTTP Status Baseline

| Status | Meaning |
|---|---|
| 400 | Malformed request / parse failure |
| 401 | Missing, invalid, expired, or revoked authentication |
| 403 | Authenticated but forbidden |
| 404 | Missing or intentionally concealed resource |
| 409 | Business-state, uniqueness, reservation, or idempotency conflict |
| 412 | Resource version / precondition mismatch |
| 413 | Payload too large |
| 415 | Unsupported media type |
| 422 | Semantically invalid request |
| 428 | Required concurrency precondition missing |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 503 | Service/dependency temporarily unavailable |

---

## 12. Concurrency, Transactions, and Idempotency

### 12.1 Transaction Boundaries

**TXN-001** Assignment creation, reassignment, acceptance, expiry, pickup, delivery completion, return confirmation, and other multi-record state changes MUST use PostgreSQL transactions.

**TXN-002** Database constraints and transactional checks/locking MUST jointly prevent duplicate active assignments, driver capacity violations, duplicate attempts, and duplicate successful completion.

**TXN-003** Domain changes and required outbox events MUST commit atomically.

**TXN-004** A transaction MUST not wait on external email, storage, malware-scanning, or notification providers unless the workflow explicitly requires synchronous provider confirmation.

### 12.2 Optimistic Concurrency

**CONC-001** Mutable workflow resources MUST have a resource version or equivalent concurrency token.

**CONC-002** Stale writes MUST fail instead of silently overwriting newer committed state.

**CONC-003** Concurrency tests MUST cover at least assign-vs-assign, accept-vs-expire, accept-vs-withdraw, pickup-vs-cancel, deliver-vs-fail, and duplicate-deliver races.

### 12.3 Idempotency

**IDEM-001** Critical externally retried mutations MUST accept an `Idempotency-Key`.

**IDEM-002** Idempotency records MUST be retained at least 24 hours unless a longer operation-specific window is defined.

**IDEM-003** Repeating the same key with the same canonical request MUST return the original logical result without repeating side effects.

**IDEM-004** Reusing the same key with a materially different request MUST return a conflict.

**IDEM-005** Idempotency must be scoped by caller/tenant context and operation so keys cannot collide across unrelated principals.

**IDEM-006** Consumers of outbox/events MUST tolerate duplicate delivery and implement idempotent processing or deduplication.

---

## 13. Security and Privacy Requirements

### 13.1 Security Baseline

**SEC-001** All production traffic MUST use TLS.

**SEC-002** Secrets MUST be provided through approved secrets management and MUST NOT be committed to source control or container images.

**SEC-003** Production database identities MUST use least privilege and separate migration/runtime permissions where practical.

**SEC-004** CORS MUST use explicit trusted origins and MUST NOT use permissive credentialed wildcards.

**SEC-005** Security headers and reverse-proxy trust settings MUST be explicitly configured and tested.

**SEC-006** Request-body size, header size, timeout, and rate limits MUST be defined for public/API routes.

**SEC-007** Rate limits MUST include tighter controls for login, password reset, MFA, OTP, invitation, proof upload, tracking ingestion, and other abuse-sensitive endpoints.

**SEC-008** The application MUST protect against injection, broken object-level authorization, broken function-level authorization, broken object-property authorization/mass assignment, CSRF, SSRF, token replay, account enumeration, unrestricted resource consumption, unsafe file upload, and insecure dependency/configuration risks.

**SEC-009** The backend MUST never fetch arbitrary user-supplied URLs.

**SEC-010** Dependency vulnerability scanning and secret scanning MUST run in CI and/or approved continuous security tooling.

**SEC-011** Security-critical dependencies MUST have an owned patch/update process.

**SEC-012** Production and non-production environments MUST use separate credentials and data stores unless an approved exception exists.

### 13.2 Browser Session Security

**SEC-013** Authentication cookies MUST be `Secure`, `HttpOnly`, host-scoped where practical, and use an appropriate `SameSite` policy.

**SEC-014** Cookie-authenticated state-changing requests MUST enforce CSRF protection and origin validation appropriate to the architecture.

**SEC-015** Refresh-token verifiers rather than raw refresh tokens MUST be stored server-side.

### 13.3 Authorization and API Security

**SEC-016** Object-level authorization MUST be tested on every endpoint that receives a resource identifier.

**SEC-017** Property-level authorization MUST prevent clients from setting restricted fields through mass assignment.

**SEC-018** Function-level authorization MUST be centralized/reusable where possible and covered by role matrix tests.

**SEC-019** API inventory MUST identify active versions and MUST not expose undocumented debug/admin endpoints in production.

### 13.4 Privacy

**PRIV-004** Data collection MUST be limited to business-required fields.

**PRIV-005** Customer-visible APIs MUST not expose another customer's PII, driver private data, internal notes, security metadata, or full historical location trail.

**PRIV-006** Exports and reports containing personal data MUST be access-controlled and logged where appropriate.

**PRIV-007** Applicable data-subject access/deletion/correction obligations SHALL be finalized after service jurisdiction and contractual obligations are confirmed.

---

## 14. File Upload and Object Storage Requirements

**FILE-001** Baseline POD upload types are JPEG and PNG.

**FILE-002** Default maximum file size is 5 MB per file and maximum files per submission is five.

**FILE-003** The service MUST validate actual content, not only client-provided MIME type or extension.

**FILE-004** Uploaded images MUST be decoded/normalized before final acceptance where feasible to reduce polyglot/metadata risks.

**FILE-005** Files MUST be malware scanned and quarantined until they pass required checks.

**FILE-006** Object keys MUST be generated by the backend and MUST not be derived directly from user filenames.

**FILE-007** Original filenames, if retained for display, MUST be treated as untrusted text.

**FILE-008** Stored proof files MUST be private. Access MUST use authenticated proxying or short-lived signed URLs with a default lifetime no longer than five minutes.

**FILE-009** File download authorization MUST be evaluated before issuing access.

**FILE-010** Abandoned/unlinked uploads SHOULD be removed after 24 hours unless preservation rules require otherwise.

**FILE-011** The system MUST handle scan/provider timeouts without incorrectly marking unverified proof as valid.

---

## 15. Background Jobs and Asynchronous Processing

### 15.1 Required Job Types

Background processing SHALL support at least:

- assignment-offer expiration;
- outbox event dispatch;
- notification delivery/retry;
- email delivery/retry;
- file scan/normalization completion where asynchronous;
- abandoned upload cleanup;
- retention cleanup;
- overdue/order monitoring if required by notifications;
- optional report export generation.

### 15.2 Job Reliability

**JOB-001** Jobs MUST be durable and recoverable after process restart.

**JOB-002** Workers MUST use bounded retries with backoff and a terminal/dead-letter failure path.

**JOB-003** Job handlers MUST be idempotent or deduplicate repeated jobs.

**JOB-004** Jobs MUST use ownership/lease/locking semantics that prevent uncontrolled concurrent processing of the same logical work.

**JOB-005** Worker shutdown MUST stop accepting new work, complete or safely release in-flight work, and preserve retryability.

**JOB-006** Job backlog, age, retries, failures, and dead-letter counts MUST be observable.

---

## 16. Logging, Monitoring, Tracing, and Auditability

### 16.1 Runtime Logging

**OBS-001** Structured logs SHOULD include request/trace ID, route template, method, status, latency, safe actor reference, error class, job ID, retry count, and provider outcome where relevant.

**OBS-002** Logs MUST redact secrets and SHOULD avoid raw PII, proof content, and authentication payloads.

**OBS-003** Logging failures MUST not crash the primary request path unless required by an explicitly critical audit guarantee.

### 16.2 Metrics

The service SHOULD expose/collect at least:

- request count, latency, and error rate;
- database connection pool utilization;
- slow-query metrics;
- transaction/serialization/deadlock failures;
- assignment conflict counts;
- offer expiry lag;
- outbox backlog/age;
- worker/job failures;
- notification failure rate;
- file scan delay/failure;
- authentication failures/rate-limit events;
- unhandled exception count;
- backup/restore health where observable.

### 16.3 Tracing

**OBS-004** Distributed trace context SHOULD propagate across API, worker, and external-provider calls where supported.

**OBS-005** Trace/span attributes MUST not contain secrets or unnecessary personal data.

### 16.4 Alerting

Production alerting SHOULD cover at minimum:

- sustained elevated 5xx rate;
- severe latency degradation;
- database unavailability or pool exhaustion;
- abnormal assignment conflict rate;
- outbox/job backlog beyond defined age;
- persistent notification/provider failures;
- malware-scan pipeline failure;
- backup failure;
- readiness failures across instances.

Alert thresholds SHALL be finalized from production SLOs and capacity testing.

---

## 17. Non-Functional Requirements and Service Levels

### 17.1 Availability and Reliability

| Area | Production target |
|---|---|
| API availability | >= 99.9% monthly |
| Unexpected 5xx rate | < 0.5% under approved load profile |
| Data integrity | Zero duplicate active assignments or duplicate successful delivery completion in concurrency qualification tests |
| Notification durability | No committed notification event lost after successful domain transaction |

**NFR-001** Availability calculation MUST document included endpoints, excluded maintenance windows if any, and the success/failure measurement method.

### 17.2 Latency

| Operation class | Target |
|---|---|
| Standard read API | p95 <= 500 ms |
| Standard write API | p95 <= 800 ms, excluding explicitly asynchronous file/provider processing |
| Supported synchronous report | p95 <= 3 seconds |

**NFR-002** Latency targets MUST be measured server-side under the approved representative workload and production-like data volume.

**NFR-003** Performance tests MUST report p50, p95, p99, throughput, error rate, CPU, memory, and database saturation indicators even where only p95 is a formal release target.

### 17.3 Capacity and Load Profile

Baseline qualification target:

- at least 1,000,000 historical orders;
- 100 requests/second sustained for 30 minutes;
- no integrity violations;
- error/latency targets remain within agreed thresholds;
- database connection pools remain within safe limits.

The final performance test MUST document:

- number of concurrent users/clients;
- endpoint mix;
- read/write ratio;
- data distribution and indexes;
- file traffic assumptions;
- worker/event load;
- hardware/container resources;
- warm-up period and test duration.

**NFR-004** The 100 RPS figure is not sufficient by itself for sign-off; the workload model above MUST accompany results.

### 17.4 Maintainability

**NFR-005** TypeScript strict mode MUST be enabled for production code.

**NFR-006** Business workflow logic SHOULD be separated from transport/framework concerns sufficiently to support deterministic unit testing.

**NFR-007** Database migrations, API contracts, security checks, linting, and automated tests MUST be part of CI quality gates.

**NFR-008** Critical domain rules MUST not exist only in frontend code.

### 17.5 Accessibility of API Documentation

**NFR-009** Developers and QA MUST have access to current API documentation and example requests/responses for all supported endpoints in non-production environments.

---

## 18. Backup, Disaster Recovery, and Business Continuity

**DR-001** Target Recovery Point Objective (RPO): <= 15 minutes.

**DR-002** Target Recovery Time Objective (RTO): <= 2 hours.

**DR-003** Backups MUST include PostgreSQL and any configuration/data required to reconstruct application state; object-storage backup/versioning strategy MUST meet the approved proof-retention and recovery policy.

**DR-004** Backup success MUST be monitored.

**DR-005** Restoration MUST be tested on a scheduled basis using a documented restore procedure.

**DR-006** Restore tests MUST verify database usability, required migrations/configuration, referential integrity, authentication readiness, and sample critical workflows.

**DR-007** Recovery procedures MUST identify ownership, escalation, and communication steps.

---

## 19. Deployment, Configuration, and Scalability

### 19.1 Service Topology

**DEP-001** API, worker processes, and Next.js frontend SHOULD be deployable independently.

**DEP-002** API replicas MUST be stateless with respect to durable business state.

**DEP-003** API replicas SHOULD run behind a load balancer/reverse proxy with health checks.

**DEP-004** PostgreSQL SHOULD use managed high availability or a tested failover design appropriate to the RPO/RTO.

**DEP-005** Read replicas MAY serve analytics/reports, but workflow decisions, authorization-sensitive current state, and writes MUST use authoritative data with required consistency.

### 19.2 Health Endpoints

**DEP-006** `/health/live` MUST report process liveness and SHOULD avoid expensive dependency checks.

**DEP-007** `/health/ready` MUST indicate whether the instance can safely serve normal traffic, including critical database readiness.

**DEP-008** Health endpoints MUST not expose secrets, environment configuration, stack traces, or sensitive dependency details.

### 19.3 Graceful Shutdown

**DEP-009** On shutdown, API instances MUST stop accepting new traffic, allow a bounded drain period, and close database/resources cleanly.

**DEP-010** Workers MUST stop claiming new jobs and safely complete/release in-flight work.

### 19.4 Database Connections

**DEP-011** Connection pools MUST be budgeted across all API and worker replicas so horizontal scaling cannot exhaust database connections.

### 19.5 Schema Evolution

**DEP-012** Rolling deployments MUST use backward-compatible expand-and-contract migrations for breaking schema changes.

**DEP-013** Destructive columns/tables MUST not be removed until all deployed code no longer depends on them and rollback implications are resolved.

### 19.6 Environment Configuration

**DEP-014** Environment-specific configuration MUST be externalized from application code.

**DEP-015** Required configuration MUST be validated at startup with safe failure behavior.

**DEP-016** Secret values MUST not be printed in startup logs or diagnostics.

---

## 20. CI/CD and Software Supply Chain Requirements

**CICD-001** CI MUST use locked/reproducible dependency installation.

**CICD-002** CI MUST run type checking, linting, unit tests, required integration tests, contract validation, dependency/security scans, and secret scanning.

**CICD-003** Production container images MUST be built from reviewed source and immutable build inputs as far as practical.

**CICD-004** Container images SHOULD run as non-root and minimize unnecessary packages/tools.

**CICD-005** Production deployment MUST use controlled database migrations with failure/rollback procedures.

**CICD-006** Promotion to production MUST be traceable to a source revision, image/artifact version, and migration set.

**CICD-007** Direct unreviewed production code changes are prohibited.

---

## 21. Testing and Verification Requirements

### 21.1 Test Levels

The project MUST include:

- unit tests;
- PostgreSQL-backed integration tests;
- API contract tests;
- authorization tests;
- concurrency/race tests;
- security tests;
- provider-failure/resilience tests;
- performance/load tests;
- migration tests;
- backup/restore tests;
- frontend-to-backend E2E tests.

### 21.2 Mandatory Domain Tests

**TEST-001** The complete order-state transition matrix MUST have positive and negative tests.

**TEST-002** Assignment eligibility MUST test account state, availability, workload, zone, qualification, and vehicle constraints.

**TEST-003** POD tests MUST cover required/optional evidence, wrong order/attempt, unauthorized driver, unscanned file, correction behavior, and duplicate completion.

**TEST-004** Attempt tests MUST cover numbering, retry limit, failure reason requirements, and failed/retry/return paths.

**TEST-005** Custody tests MUST verify accountable holder after pickup, failure, facility return, and final return.

**TEST-006** Fee/zone tests MUST cover calculation, snapshotting, overrides, overlap priority, and deactivation.

**TEST-007** Metric tests MUST validate denominators, timezone boundaries, missing promise windows, reschedules, and original-promise lateness.

### 21.3 Mandatory Authorization Tests

**TEST-008** Every endpoint group MUST include allow/deny tests for applicable roles.

**TEST-009** Object-level authorization tests MUST attempt cross-customer, cross-driver, and unauthorized staff access.

**TEST-010** Property-level tests MUST attempt to set privileged/system-managed fields.

**TEST-011** File and export endpoints MUST have separate authorization tests.

### 21.4 Mandatory Concurrency Tests

At minimum:

- two dispatchers assign the same order simultaneously;
- one dispatcher assigns the same driver to two orders simultaneously;
- accept races with expiry;
- accept races with withdrawal/reassignment;
- pickup races with cancellation;
- two delivery-completion requests race;
- fail races with deliver;
- same idempotency key races across duplicate retries.

No test may produce duplicate successful completion or an invariant-breaking assignment.

### 21.5 Mandatory E2E Happy Path

`create order -> ready -> create offer -> driver accepts -> pickup -> in transit -> out for delivery -> upload/validate proof -> deliver -> customer timeline/report reflects delivery`

### 21.6 Mandatory E2E Negative Paths

At minimum:

- unavailable/ineligible driver;
- duplicate assignment;
- expired offer acceptance;
- invalid state transition;
- missing POD;
- POD for wrong order/attempt;
- unauthorized tracking;
- failed delivery without reason;
- stale `If-Match`/resource version;
- reused idempotency key with different payload;
- notification provider outage;
- file-scanning failure;
- database transaction rollback path.

### 21.7 Coverage and Quality Gate

**TEST-012** Critical domain modules MUST achieve at least 90% branch coverage.

**TEST-013** Coverage percentage alone is not release acceptance; missing state, authorization, or concurrency scenarios remain release blockers.

**TEST-014** Release requires passing migration, authorization, concurrency, critical E2E, security, and restore checks.

**TEST-015** No unresolved Critical or High severity exploitable security issue may remain at production release unless a formally approved risk exception exists.

---

## 22. Acceptance Criteria by Capability

### 22.1 Authentication

Accepted when:

- valid users can authenticate and refresh according to policy;
- revoked/deactivated sessions fail;
- Admin MFA is enforced;
- reset/invitation tokens are single-use and expire;
- enumeration protections are verified;
- logout-all invalidates expected sessions.

### 22.2 Dispatch

Accepted when:

- only eligible drivers receive offers;
- a driver reservation occurs before success is returned;
- two concurrent assignments cannot violate order/driver constraints;
- accept/reject/expire/withdraw release or consume capacity exactly once;
- reassignment history is complete.

### 22.3 Delivery

Accepted when:

- only the current accepted driver can progress the order;
- pickup establishes attempt and custody;
- invalid transitions fail consistently;
- failed delivery requires configured reason;
- required POD is enforced;
- concurrent delivery completion produces exactly one success and one committed terminal outcome.

### 22.4 Customer Tracking

Accepted when:

- customer sees only authorized own order information;
- internal notes are excluded;
- live location disappears at terminal state;
- stale location is identified;
- unauthorized users cannot infer order/location existence.

### 22.5 Operations

Accepted when:

- health endpoints behave as specified;
- logs/metrics/traces expose required operational signals without secrets;
- workers recover from restart;
- backups restore successfully within target procedure;
- deployment is traceable to versioned artifacts and migrations.

---

## 23. Release Readiness Gates

A production release MUST NOT proceed until all applicable items below pass or receive documented approval/waiver:

1. SRS/open decisions required for release are resolved.
2. OpenAPI contract is current and validated.
3. Database migrations have been tested from the supported previous production version.
4. Critical unit/integration/E2E suites pass.
5. Authorization matrix tests pass.
6. Concurrency and idempotency qualification passes.
7. Security scanning and required manual review pass.
8. No unapproved Critical/High exploitable vulnerabilities remain.
9. Load/performance test meets the approved workload and NFR targets.
10. Backup and restore procedure has a recent successful test.
11. Monitoring dashboards and alerts exist for critical signals.
12. Production secrets/configuration are validated.
13. Rollback/forward-fix plan exists for application and schema changes.
14. Operations runbooks and on-call/escalation ownership are defined.

---

## 24. Requirements Traceability

A requirements traceability matrix (RTM) SHALL be maintained for release-critical requirements.

Minimum RTM columns:

| Requirement ID | Requirement summary | Priority | Design/ADR | API/Module | Test case(s) | Status | Evidence |
|---|---|---|---|---|---|---|---|
| DSP-003 | Reserve driver capacity before offer succeeds | Must | ADR-DISPATCH-001 | Dispatch service | CONC-ASSIGN-01, INT-DSP-04 | Planned | CI link |
| POD-003 | Only validated/scanned proof can satisfy delivery | Must | ADR-FILE-001 | Proof service | INT-POD-07, E2E-DEL-02 | Planned | CI link |
| CONC-003 | Race scenarios are verified | Must | ADR-CONC-001 | Workflow layer | CONC-* | Planned | CI link |

**TRACE-001** Every `MUST` requirement MUST have at least one verification method before production acceptance.

**TRACE-002** Requirements waived for a release MUST record owner, rationale, risk, compensating control, and expiry/review date.

---

## 25. Recommended Supporting Project Artifacts

This SRS should be accompanied by the following source-controlled artifacts for a complete production project:

- System context/container diagram;
- ERD/data dictionary;
- OpenAPI specification;
- RBAC/permission matrix;
- order and assignment state diagrams;
- threat model/data-flow diagram;
- Architecture Decision Records (ADRs);
- database migration strategy;
- test strategy and RTM;
- performance test profile;
- incident response/runbook;
- backup/restore runbook;
- deployment/rollback runbook;
- observability dashboard/alert catalogue;
- data retention/privacy register;
- third-party dependency/integration register.

These artifacts MUST remain consistent with the approved SRS.

---

## 26. Production Decisions to Confirm Before Build Freeze

The following decisions remain explicit product/architecture inputs and MUST be finalized before production sign-off:

| Decision | Current proposal | Owner |
|---|---|---|
| Service country/jurisdiction | TBD | Product/Legal |
| Currency | Configured ISO currency | Product |
| Business timezone | TBD | Product/Ops |
| Driver workload limit | 1 reserved/accepted assignment | Product/Ops |
| Assignment offer timeout | 5 minutes | Product/Ops |
| Default POD policy | Recipient name + 1 photo | Product/Ops |
| Max attempts | 3 | Product/Ops |
| Cancellation boundary | Before pickup by authorized staff; exceptions TBD | Product |
| Post-pickup transfer | Not supported | Product/Ops |
| Return receipt authority | TBD | Product/Ops |
| Customer onboarding/login | Verified linked account only | Product/Security |
| GPS activation | Disabled initially | Product |
| OTP activation | Disabled initially | Product/Security |
| SMS/push | Disabled initially | Product |
| Retention periods | Proposed in Section 9.5 | Legal/Product/Security |
| RPO/RTO | 15 min / 2 hours | Engineering/Ops |
| OpenAPI version | 3.1.x+ based on tooling | Engineering |
| Shared queue/coordination technology | Architecture decision | Engineering/Ops |

---

## 27. Open Risks and Design Notes

### 27.1 Assignment Semantics

The previous design used the order state `Assigned` immediately after assignment creation even though driver acceptance was still required. This creates ambiguity for UI, reporting, concurrency, and cancellation behavior. Version 2.0 defines `Assigned` as **accepted by the driver** and keeps the order `ReadyForPickup` while an offer is only `Offered`.

If the product requires a visible intermediate order status, add a distinct status such as `AwaitingDriverAcceptance`; do not overload `Assigned` with two meanings.

### 27.2 Driver Capacity

The single-active-assignment policy is deliberately simple. Supporting multiple concurrent deliveries requires a workload model (count, weight, volume, route/time capacity, service restrictions) and must not be enabled by merely changing a numeric configuration value without updating dispatch logic and tests.

### 27.3 Reporting Consistency

Operational dashboards and official reports must share stable metric definitions. If eventual-consistency/read-replica data is used, the UI must communicate freshness where it can affect operational decisions.

### 27.4 File Processing

POD upload UX must account for asynchronous validation/scanning. A file in `Uploaded` or `Scanning` state cannot be treated as valid proof until required checks reach an accepted state.

### 27.5 Legal/Privacy Scope

Country/jurisdiction is intentionally unresolved. Final privacy rights, retention, consent/notice, and breach obligations cannot be completed until the service jurisdiction and contracts are known.

---

## Appendix A - Suggested Stable Application Error Codes

Examples (final catalogue to be maintained with OpenAPI):

| Code | Typical HTTP status | Meaning |
|---|---:|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Login failed without revealing which credential was incorrect |
| `AUTH_SESSION_REVOKED` | 401 | Session/token family is no longer valid |
| `AUTH_MFA_REQUIRED` | 401/403 | Additional authentication required |
| `FORBIDDEN` | 403 | Authenticated principal lacks permission |
| `RESOURCE_NOT_FOUND` | 404 | Missing/concealed resource |
| `VALIDATION_FAILED` | 422 | Semantic input validation failed |
| `ORDER_STATE_CONFLICT` | 409 | Requested action invalid for current order state |
| `ASSIGNMENT_CONFLICT` | 409 | Order/driver reservation conflict |
| `ASSIGNMENT_OFFER_EXPIRED` | 409 | Offer is no longer valid |
| `RESOURCE_VERSION_MISMATCH` | 412 | Stale client update |
| `PRECONDITION_REQUIRED` | 428 | Required version precondition missing |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Same key used with different request |
| `PROOF_REQUIRED` | 422 | Required POD evidence incomplete |
| `PROOF_NOT_READY` | 409/422 | Uploaded proof has not passed required validation |
| `RATE_LIMITED` | 429 | Request throttled |
| `DEPENDENCY_UNAVAILABLE` | 503 | Required dependency temporarily unavailable |

---

## Appendix B - Suggested File State Model

`Uploaded -> Scanning -> Accepted`  
`Uploaded/Scanning -> Rejected`  
`Uploaded/Scanning -> FailedProcessing`

Only `Accepted` files MAY satisfy required proof rules.

---

## Appendix C - Suggested Outbox Event Catalogue

Event names SHOULD be versioned and stable. Example events:

- `order.created.v1`
- `order.ready.v1`
- `assignment.offered.v1`
- `assignment.accepted.v1`
- `assignment.rejected.v1`
- `assignment.expired.v1`
- `order.picked_up.v1`
- `order.in_transit.v1`
- `order.out_for_delivery.v1`
- `order.failed.v1`
- `order.rescheduled.v1`
- `order.delivered.v1`
- `return.started.v1`
- `order.returned.v1`

Event payloads MUST avoid unnecessary PII and MUST include an event ID, event version/type, occurred-at timestamp, aggregate/order identifier, and trace/correlation identifier where available.

---

## Appendix D - Definition of Done for a Backend Feature

A release-ready backend feature is complete when, as applicable:

- requirement IDs and acceptance criteria are agreed;
- authorization rules are implemented and tested;
- Zod/request validation is implemented;
- safe DTO/response model is implemented;
- database constraints/migration are reviewed;
- concurrency/idempotency behavior is defined;
- audit/outbox behavior is implemented;
- OpenAPI is updated;
- unit/integration/E2E tests pass;
- security-sensitive paths are reviewed;
- logs/metrics are added without leaking secrets/PII;
- migrations and rollback/forward-fix behavior are tested;
- QA evidence is traceable to the requirement.

---

## Appendix E - Review Checklist for Each Mutation Endpoint

For every mutation, reviewers MUST answer:

1. Who is allowed to call it?
2. Which resource/ownership checks apply?
3. Which current states permit it?
4. What data is validated?
5. What database transaction/constraints protect it?
6. What happens under two simultaneous requests?
7. Does it require `If-Match`/resource version?
8. Does it require `Idempotency-Key`?
9. What audit record is written?
10. What outbox/notification events are written?
11. What stable errors can be returned?
12. What sensitive data could appear in logs/responses?
13. What tests prove the happy path, denial path, stale/race path, and retry path?

---

## Final Baseline Statement

This SRS is intended to be implementation-ready at the system requirement level. Production approval still requires the open decisions in Section 26 to be resolved and the supporting API, architecture, data, threat-model, test, and operations artifacts in Section 25 to be completed and kept traceable to these requirements.


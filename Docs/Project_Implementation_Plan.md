Deliverix — Complete Implementation Plan
1. Recommended Backend Architecture
1.1 Folder Structure
Deliverix/
├── Docs/
│   └── SRS.md
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── index.ts                          # Entry point: bootstrap + start server
│   ├── app.ts                            # Express app factory (middleware, routes, error handler)
│   │
│   ├── config/
│   │   ├── env.ts                        # Zod-validated env schema (safe startup — DEP-015)
│   │   └── constants.ts                  # Enum-like values, pagination defaults, limits
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── app-error.ts              # Base AppError class (code, status, type)
│   │   │   ├── error-codes.ts            # Stable error code enum (Appendix A)
│   │   │   └── error-handler.ts          # Global Express error middleware (RFC 9457 — ERR-001)
│   │   │
│   │   ├── middleware/
│   │   │   ├── authenticate.ts           # JWT verification, attach req.user (IAM-005/006)
│   │   │   ├── authorize.ts             # Role + permission gate (AUTHZ-001/002)
│   │   │   ├── require-owner.ts         # Resource ownership/scope guard (AUTHZ-002)
│   │   │   ├── validate.ts              # Zod schema validator for body/params/query (VAL-001)
│   │   │   ├── idempotent.ts            # Idempotency-Key header handler (IDEM-001..006)
│   │   │   ├── require-version.ts       # If-Match / resource version guard (CONC-001/002, API-013)
│   │   │   ├── rate-limiter.ts          # General + per-route rate limiting (SEC-006/007)
│   │   │   ├── security-headers.ts      # Helmet-style headers (SEC-005)
│   │   │   ├── request-id.ts            # Generate/propagate X-Request-ID (API-008)
│   │   │   └── parse-pagination.ts      # Cursor / offset pagination parser (PAGE-001..010)
│   │   │
│   │   ├── types/
│   │   │   ├── express.d.ts             # Augment Express Request with user, requestId
│   │   │   ├── pagination.ts            # PageMeta, CursorPage, OffsetPage types
│   │   │   └── api.ts                   # ApiResponse<T>, ProblemDetail types
│   │   │
│   │   └── utils/
│   │       ├── logger.ts                # Pino structured logger (OBS-001..003)
│   │       ├── prisma.ts                # Singleton PrismaClient with middleware
│   │       ├── bcrypt.ts                # Argon2id wrapper (IAM-009)
│   │       ├── jwt.ts                   # Sign/verify access + refresh tokens (IAM-005)
│   │       ├── crypto.ts                # Random token generation (IAM-010)
│   │       ├── order-number.ts          # Unique order number generator (ORD-001)
│   │       ├── cursor.ts                # Cursor encode/decode for pagination
│   │       └── sanitize.ts              # PII redaction helpers (PRIV-001/002)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.schemas.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.routes.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── users.schemas.ts
│   │   │
│   │   ├── roles/
│   │   │   ├── roles.routes.ts
│   │   │   ├── roles.controller.ts
│   │   │   ├── roles.service.ts
│   │   │   └── roles.schemas.ts
│   │   │
│   │   ├── customers/
│   │   │   ├── customers.routes.ts
│   │   │   ├── customers.controller.ts
│   │   │   ├── customers.service.ts
│   │   │   └── customers.schemas.ts
│   │   │
│   │   ├── drivers/
│   │   │   ├── drivers.routes.ts
│   │   │   ├── drivers.controller.ts
│   │   │   ├── drivers.service.ts
│   │   │   └── drivers.schemas.ts
│   │   │
│   │   ├── vehicles/
│   │   │   ├── vehicles.routes.ts
│   │   │   ├── vehicles.controller.ts
│   │   │   ├── vehicles.service.ts
│   │   │   └── vehicles.schemas.ts
│   │   │
│   │   ├── zones/
│   │   │   ├── zones.routes.ts
│   │   │   ├── zones.controller.ts
│   │   │   ├── zones.service.ts
│   │   │   └── zones.schemas.ts
│   │   │
│   │   ├── service-types/
│   │   │   ├── service-types.routes.ts
│   │   │   ├── service-types.controller.ts
│   │   │   ├── service-types.service.ts
│   │   │   └── service-types.schemas.ts
│   │   │
│   │   ├── orders/
│   │   │   ├── orders.routes.ts
│   │   │   ├── orders.controller.ts
│   │   │   ├── orders.service.ts
│   │   │   ├── orders.schemas.ts
│   │   │   └── order-number.service.ts
│   │   │
│   │   ├── dispatch/
│   │   │   ├── dispatch.routes.ts
│   │   │   ├── dispatch.controller.ts
│   │   │   ├── dispatch.service.ts       # Offer creation, reassignment logic
│   │   │   ├── assignment.routes.ts
│   │   │   ├── assignment.controller.ts
│   │   │   ├── assignment.service.ts     # Accept/reject/withdraw/expire
│   │   │   └── dispatch.schemas.ts
│   │   │
│   │   ├── delivery/
│   │   │   ├── delivery.routes.ts
│   │   │   ├── delivery.controller.ts
│   │   │   ├── delivery.service.ts       # Pickup, transit, deliver, fail, return
│   │   │   ├── proof.routes.ts
│   │   │   ├── proof.controller.ts
│   │   │   ├── proof.service.ts          # POD validation, file handling
│   │   │   └── delivery.schemas.ts
│   │   │
│   │   ├── notifications/
│   │   │   ├── notifications.routes.ts
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   └── notifications.schemas.ts
│   │   │
│   │   ├── reports/
│   │   │   ├── reports.routes.ts
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   └── reports.schemas.ts
│   │   │
│   │   ├── audit/
│   │   │   ├── audit.routes.ts
│   │   │   ├── audit.controller.ts
│   │   │   └── audit.service.ts
│   │   │
│   │   ├── files/
│   │   │   ├── files.routes.ts
│   │   │   ├── files.controller.ts
│   │   │   ├── files.service.ts          # Upload, scan, proxy/signed-URL access
│   │   │   └── files.schemas.ts
│   │   │
│   │   ├── config-management/
│   │   │   ├── config-management.routes.ts
│   │   │   ├── config-management.controller.ts
│   │   │   └── config-management.service.ts
│   │   │
│   │   └── health/
│   │       ├── health.routes.ts
│   │       └── health.controller.ts
│   │
│   ├── jobs/
│   │   ├── scheduler.ts                 # node-cron scheduler — registers all cron jobs
│   │   ├── handlers/
│   │   │   ├── offer-expiration.ts      # Expire overdue assignment offers
│   │   │   ├── outbox-dispatch.ts       # Process OutboxEvent table → dispatch
│   │   │   ├── notification-retry.ts    # Retry failed NotificationDelivery records
│   │   │   ├── file-cleanup.ts          # Remove abandoned/unlinked uploads > 24h
│   │   │   └── retention-cleanup.ts     # Enforce data retention policies
│   │   └── lib/
│   │       ├── job-runner.ts            # Poll DB, claim jobs, run handler, retry/dead-letter
│   │       └── job-lock.ts              # Advisory lock / claim semantics (JOB-004)
│   │
│   └── integrations/
│       ├── email/
│       │   ├── email.interface.ts        # Abstract email sender interface
│       │   ├── nodemailer.adapter.ts     # Nodemailer + SMTP implementation
│       │   └── templates/
│       │       ├── invitation.ts         # Staff invitation email
│       │       └── password-reset.ts     # Password reset email
│       │
│       └── storage/
│           ├── storage.interface.ts      # Abstract file storage interface
│           └── cloudinary.adapter.ts     # Cloudinary implementation (FILE-001..011)
│
├── tests/
│   ├── helpers/
│   │   ├── test-app.ts                  # Create isolated Express app for testing
│   │   ├── test-db.ts                   # Prisma test DB setup/teardown + transactions
│   │   ├── factories.ts                 # Test data factories (users, orders, drivers)
│   │   └── auth-helpers.ts              # Generate test tokens, create test users
│   │
│   ├── unit/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── orders/
│   │   │   ├── dispatch/
│   │   │   └── delivery/
│   │   └── shared/
│   │       ├── jwt.test.ts
│   │       ├── order-number.test.ts
│   │       └── cursor.test.ts
│   │
│   ├── integration/
│   │   ├── modules/
│   │   │   ├── auth.integration.test.ts
│   │   │   ├── orders.integration.test.ts
│   │   │   ├── dispatch.integration.test.ts
│   │   │   ├── delivery.integration.test.ts
│   │   │   └── customers.integration.test.ts
│   │   └── shared/
│   │       └── prisma-transaction.test.ts
│   │
│   ├── api-contract/
│   │   ├── auth.contract.test.ts
│   │   ├── orders.contract.test.ts
│   │   └── openapi.snapshot.test.ts
│   │
│   ├── authorization/
│   │   ├── authz-orders.test.ts
│   │   ├── authz-customers.test.ts
│   │   ├── authz-drivers.test.ts
│   │   └── authz-files.test.ts
│   │
│   ├── concurrency/
│   │   ├── assign-vs-assign.test.ts
│   │   ├── accept-vs-expire.test.ts
│   │   ├── accept-vs-withdraw.test.ts
│   │   ├── pickup-vs-cancel.test.ts
│   │   ├── deliver-vs-fail.test.ts
│   │   └── duplicate-deliver.test.ts
│   │
│   ├── e2e/
│   │   ├── happy-path.test.ts           # Full order lifecycle
│   │   └── negative-paths.test.ts       # All mandatory negative scenarios
│   │
│   └── security/
│       └── security-baseline.test.ts
│
├── docker/
│   ├── Dockerfile                       # Multi-stage, non-root (CICD-004)
│   └── docker-compose.yml               # Dev: API + PostgreSQL
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── tsconfig.build.json                  # Stricter build-only config
├── eslint.config.mjs                    # ESLint flat config
├── vitest.config.ts
├── nodemon.json                         # Dev watch config
└── README.md
1.2 Module Boundaries
Each module follows a strict three-layer pattern with clear responsibility:
Layer	Responsibility
Controller	Parse HTTP, validate input via Zod, call service, format response. No business logic.
Service	Business rules, state transitions, authorization logic, transaction orchestration, audit writes, outbox events. No HTTP awareness.
Prisma (repository)	Direct DB queries via Prisma Client. No business logic.
Cross-cutting concerns are handled by shared middleware, NOT by modules:
- Authentication → shared/middleware/authenticate.ts
- Authorization → shared/middleware/authorize.ts + require-owner.ts
- Idempotency → shared/middleware/idempotent.ts
- Concurrency → shared/middleware/require-version.ts + service-level transactions
- Validation → shared/middleware/validate.ts + module *.schemas.ts
- Audit → audit.service.ts called from other services (AUD-002/003)
- Outbox events → Written in same transaction as domain changes (TXN-003)
1.3 Route Registration Pattern
app.ts
  ├── /api/v1/auth       → auth.routes
  ├── /api/v1/users      → users.routes
  ├── /api/v1/roles      → roles.routes
  ├── /api/v1/customers  → customers.routes
  ├── /api/v1/drivers    → drivers.routes
  ├── /api/v1/vehicles   → vehicles.routes
  ├── /api/v1/zones      → zones.routes
  ├── /api/v1/service-types → service-types.routes
  ├── /api/v1/orders     → orders.routes
  ├── /api/v1/assignments → assignment.routes
  ├── /api/v1/dispatch   → dispatch.routes
  ├── /api/v1/notifications → notifications.routes
  ├── /api/v1/reports    → reports.routes
  ├── /api/v1/audit-logs → audit.routes
  ├── /api/v1/files      → files.routes
  ├── /api/v1/config     → config-management.routes
  ├── /health/live       → health.routes
  └── /health/ready      → health.routes
1.4 Shared Infrastructure Components
Component	File
Logger	shared/utils/logger.ts
Prisma singleton	shared/utils/prisma.ts
Argon2id	shared/utils/bcrypt.ts
JWT	shared/utils/jwt.ts
Token generator	shared/utils/crypto.ts
Order number	shared/utils/order-number.ts
Cursor codec	shared/utils/cursor.ts
PII sanitizer	shared/utils/sanitize.ts
Error codes	shared/errors/error-codes.ts
AppError	shared/errors/app-error.ts
Error handler	shared/errors/error-handler.ts
2. Database Implementation Plan
2.1 Prisma Schema Strategy
Approach: One schema.prisma file organized by model groups with clear section comments. Use Prisma's native types where they map well; use raw SQL migrations only for:
- Complex check constraints (DATA-009: one open assignment per order)
- Partial indexes for performance (DATA-012/013)
- Advisory locks for concurrency (manual, not schema-level)
ID Strategy: Use cuid() for all primary keys (opaque, non-enumerable — DATA-006). Use @default(cuid()) on all model IDs.
Monetary Fields: Use Decimal (maps to PostgreSQL numeric) — DATA-010.
Timestamps: All DateTime fields use @default(now()) and are stored as UTC (DATA-011).
Soft Deletes: Business records use deletedAt DateTime? or status-based deactivation, never hard deletes (BR-002, ORD-010).
Resource Versioning: Add version Int @default(1) on mutable workflow resources (orders, assignments, drivers). Auto-increment via Prisma middleware or application logic (CONC-001).
2.2 Migration Order
Migrations must be created in dependency order (foreign keys):
Migration 001: Core Auth & RBAC
  → User, Role, Permission, UserRole, RolePermission,
    Session, RefreshCredential

Migration 002: Customers
  → Customer, CustomerAddress

Migration 003: Drivers & Fleet
  → Driver, DriverAvailabilityHistory, Vehicle, DriverVehicleAssignment,
    DeliveryZone, ZoneArea, DriverZone

Migration 004: Services & Configuration
  → ServiceType, ProofPolicyVersion, DeliveryFailureReason

Migration 005: Orders & Items
  → DeliveryOrder, DeliveryItem

Migration 006: Dispatch & Assignment
  → DeliveryAssignment, DeliveryStatusHistory

Migration 007: Delivery Execution
  → DeliveryAttempt, RescheduleRecord, CustodyEvent, ReturnRecord

Migration 008: Proof & Files
  → DeliveryProof, FileObject, OtpChallenge

Migration 009: Tracking (optional, GPS initially disabled)
  → DriverLocation

Migration 010: Notifications & Events
  → Notification, NotificationDelivery, OutboxEvent

Migration 011: Audit & Operations
  → InternalNote, AuditLog, IdempotencyRecord

Migration 012: Indexes & Constraints (raw SQL)
  → Performance indexes, partial indexes, unique constraint
    enhancements beyond Prisma's capabilities
2.3 Core Tables and Key Relationships
User ──┬── UserRole ── Role ── RolePermission ── Permission
       ├── Session
       └── RefreshCredential

Customer ── CustomerAddress
Customer ── DeliveryOrder

Driver ──┬── DriverAvailabilityHistory
         ├── DriverVehicleAssignment ── Vehicle
         ├── DriverZone ── DeliveryZone ── ZoneArea
         └── DeliveryAssignment ── DeliveryOrder

DeliveryOrder ──┬── DeliveryItem
                ├── DeliveryAssignment (max 1 open — DATA-004)
                ├── DeliveryStatusHistory
                ├── DeliveryAttempt ──┬── DeliveryProof
                │                     └── DeliveryFailureReason
                ├── RescheduleRecord
                ├── CustodyEvent
                ├── ReturnRecord
                ├── InternalNote
                ├── Notification
                └── FileObject

ServiceType ── DeliveryOrder
ProofPolicyVersion ── DeliveryOrder (snapshot)
DeliveryZone ── DeliveryOrder (snapshot)

FileObject ── OtpChallenge (optional)

OutboxEvent (standalone, references aggregate)
Notification ── NotificationDelivery
IdempotencyRecord (standalone)
AuditLog (standalone)
2.4 Critical Constraints and Indexes
Database-Level Constraints (DATA-007/008/009):
Constraint	Type
Order number uniqueness	UNIQUE
Driver identifier uniqueness	UNIQUE
Vehicle registration uniqueness	UNIQUE
Attempt number per order	UNIQUE
One open assignment per order	Raw SQL CHECK + advisory lock
One active assignment per driver (initial policy)	Raw SQL + advisory lock
Monetary precision	Decimal(12,2)
Positive quantities	Raw SQL CHECK
Performance Indexes (DATA-012):
Table	Index
DeliveryOrder	(status, createdAt)
DeliveryOrder	(customerId)
DeliveryOrder	(orderNumber)
DeliveryOrder	(assignedDriverId) WHERE assignedDriverId IS NOT NULL
DeliveryAssignment	(orderId) WHERE status IN ('Offered','Accepted')
DeliveryAssignment	(driverId) WHERE status IN ('Offered','Accepted')
DeliveryAssignment	(expiresAt) WHERE status = 'Offered'
DeliveryStatusHistory	(orderId, createdAt)
DeliveryAttempt	(orderId, attemptNumber)
Notification	(userId, readAt)
Notification	(userId, createdAt)
OutboxEvent	(processedAt) WHERE processedAt IS NULL
OutboxEvent	(aggregateType, aggregateId)
IdempotencyRecord	(key, operation)
IdempotencyRecord	(createdAt)
AuditLog	(resourceType, resourceId)
AuditLog	(actorId, createdAt)
FileObject	(orderId, status)
FileObject	(status) WHERE status = 'Uploaded'
DriverLocation	(driverId, capturedAt)
RefreshCredential	(familyId)
RefreshCredential	(userId, revokedAt)
3. Development Phases
Phase 1: Foundation
Objectives: Project scaffolding, configuration, database schema, shared infrastructure.
Files Created:
- package.json, tsconfig.json, tsconfig.build.json, eslint.config.mjs, vitest.config.ts
- src/app.ts, src/index.ts
- src/config/env.ts, src/config/constants.ts
- src/shared/errors/app-error.ts, src/shared/errors/error-codes.ts, src/shared/errors/error-handler.ts
- src/shared/middleware/validate.ts, src/shared/middleware/request-id.ts, src/shared/middleware/rate-limiter.ts, src/shared/middleware/security-headers.ts
- src/shared/types/express.d.ts, src/shared/types/pagination.ts, src/shared/types/api.ts
- src/shared/utils/logger.ts, src/shared/utils/prisma.ts, src/shared/utils/cursor.ts
- src/modules/health/health.routes.ts, src/modules/health/health.controller.ts
- prisma/schema.prisma (all models)
- docker/Dockerfile, docker/docker-compose.yml
- .env.example, .gitignore
- Migrations 001–012
Database Changes: All 38 models created via Prisma schema. Migrations applied.
APIs Implemented:
- GET /health/live (DEP-006)
- GET /health/ready (DEP-007)
Tests Required:
- Env validation startup test
- Health endpoint tests
- Prisma connection test
- Logger redaction test
- Error handler format test (RFC 9457)
- Validation middleware test
Dependencies: None. This is the starting point.
Phase 2: Authentication and RBAC
Objectives: Full auth lifecycle: login, refresh, logout, MFA, invitations, password recovery. Role/permission management.
Files Created:
- src/modules/auth/auth.routes.ts
- src/modules/auth/auth.controller.ts
- src/modules/auth/auth.service.ts
- src/modules/auth/auth.schemas.ts
- src/shared/middleware/authenticate.ts
- src/shared/middleware/authorize.ts
- src/shared/middleware/require-owner.ts
- src/shared/utils/bcrypt.ts, src/shared/utils/jwt.ts, src/shared/utils/crypto.ts
- src/modules/users/users.routes.ts, users.controller.ts, users.service.ts, users.schemas.ts
- src/modules/roles/roles.routes.ts, roles.controller.ts, roles.service.ts, roles.schemas.ts
- src/integrations/email/email.interface.ts, src/integrations/email/nodemailer.adapter.ts
- src/integrations/email/templates/invitation.ts, src/integrations/email/templates/password-reset.ts
Database Changes: Users seeded with default roles (Admin, Dispatcher, Driver, Customer, Support) and standard permissions.
APIs Implemented (11 auth + 6 user + 1 role = 18 endpoints):
Endpoint
POST /auth/login
POST /auth/mfa/verify
POST /auth/refresh
POST /auth/logout
POST /auth/logout-all
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/accept-invitation
GET /auth/me
POST /auth/mfa/enrollment
POST /auth/mfa/enrollment/confirm
GET /users
POST /users
GET /users/{id}
PATCH /users/{id}
PUT /users/{id}/roles
GET /roles
Tests Required:
- Unit: JWT sign/verify, Argon2id hash/verify, token generation, invitation token lifecycle
- Integration: Full login flow, refresh rotation, token-family reuse detection, logout-all, MFA enrollment + verify, password reset flow, invitation acceptance, account enumeration protection
- Authorization: Role matrix tests for user/role endpoints, privilege escalation attempts
- Security: Cookie security flags, CSRF on cookie-authenticated state changes, rate limiting on auth endpoints
Dependencies: Phase 1.
Phase 3: Customer and Order Management
Objectives: Customer profiles, address management, order CRUD with full validation, zone/service configuration.
Files Created:
- src/modules/customers/customers.* (routes, controller, service, schemas)
- src/modules/orders/orders.*
- src/modules/orders/order-number.service.ts
- src/modules/zones/zones.*
- src/modules/service-types/service-types.*
- src/modules/config-management/config-management.*
Database Changes: Seed default zones, service types, failure reasons, proof policies. Create sample admin/dispatcher users.
APIs Implemented (~25 endpoints):
Group	Endpoints
Customers	GET/POST /customers, GET/PATCH /customers/{id}, GET/POST/PATCH/DELETE /customers/{id}/addresses
Orders	POST /orders, GET /orders, GET /orders/{id}, PATCH /orders/{id}, POST /orders/{id}/ready, POST /orders/{id}/cancel, GET /orders/{id}/history
Internal Notes	GET/POST /orders/{id}/notes
Zones	GET/POST /zones, GET/PATCH /zones/{id}
Service Types	GET/POST /service-types, GET/PATCH /service-types/{id}
Config	Failure reasons, proof policies, settings CRUD
Tests Required:
- Unit: Order number generation, order readiness validation, zone fee calculation, snapshot logic (BR-001)
- Integration: Order create→ready flow, order cancel with state validation, material edit prevention after pickup (BR-003), zone overlap detection (CFG-002), deactivation blocking (CFG-003)
- Authorization: Customer users can only see own orders (CUS-006), staff role matrix
- Validation: All order fields, cross-field validation (VAL-002), monetary precision (DATA-010)
Dependencies: Phase 2.
Phase 4: Dispatch and Assignment
Objectives: Assignment offer lifecycle, driver capacity reservation, accept/reject/withdraw/expire, reassignment, dispatch queue, concurrency safety.
Files Created:
- src/modules/dispatch/dispatch.* (routes, controller, service, schemas)
- src/modules/dispatch/assignment.routes.ts, assignment.controller.ts, assignment.service.ts
- src/modules/drivers/drivers.* (routes, controller, service, schemas)
- src/modules/vehicles/vehicles.* (routes, controller, service, schemas)
Database Changes: Driver vehicle assignment history tracking, zone relationships seeded.
APIs Implemented (~20 endpoints):
Group	Endpoints
Drivers	GET/POST /drivers, GET/PATCH /drivers/{id}, PUT /drivers/me/availability, GET /drivers/me/assignments, driver history/zone endpoints
Vehicles	GET/POST /vehicles, GET/PATCH /vehicles/{id}, vehicle allocation endpoints
Dispatch	GET /dispatch/queue, GET /dispatch/workloads
Assignments	POST /orders/{id}/assignments, POST /assignments/{id}/accept, POST /assignments/{id}/reject, POST /assignments/{id}/withdraw, POST /orders/{id}/reassign
Critical Logic:
- Offer creation reserves driver capacity atomically (DSP-003)
- Only ReadyForPickup orders eligible (DSP-001)
- Driver eligibility: account state, qualifications, availability, workload, zone, vehicle (DSP-002)
- Accept revalidates eligibility + order state (DSP-005)
- Rejection/expire/withdraw releases capacity exactly once (DSP-006, ASN-003)
- Reassignment atomically closes old + creates new (DSP-007)
Tests Required:
- Unit: Driver eligibility evaluation, capacity reservation logic
- Integration: Full offer→accept flow, offer→reject, offer→expire, offer→withdraw, concurrent assign-vs-assign, concurrent accept-vs-expire, concurrent accept-vs-withdraw, reassignment flow
- Concurrency: Two dispatchers assign same order simultaneously — must produce exactly one success (CONC-003, TEST-014)
- Concurrency: One dispatcher assigns same driver to two orders — must block second
- Authorization: Only authorized roles can dispatch, only offered driver can accept (DSP-004)
Dependencies: Phase 3.
Phase 5: Delivery Workflow
Objectives: Pickup, transit, delivery completion with POD, failure handling, rescheduling, return workflow, tracking.
Files Created:
- src/modules/delivery/delivery.* (routes, controller, service, schemas)
- src/modules/delivery/proof.* (routes, controller, service, schemas)
- src/modules/files/files.* (routes, controller, service, schemas)
- src/integrations/storage/storage.interface.ts
- src/integrations/storage/cloudinary.adapter.ts
Database Changes: File objects linked to orders/attempts, proof records created.
APIs Implemented (~18 endpoints):
Group	Endpoints
Delivery Transitions	POST /orders/{id}/pickup, POST /orders/{id}/in-transit, POST /orders/{id}/out-for-delivery, POST /orders/{id}/deliver, POST /orders/{id}/fail, POST /orders/{id}/reschedule
Returns	POST /orders/{id}/return, POST /orders/{id}/return-proof, POST /orders/{id}/confirm-return, POST /orders/{id}/confirm-pickup-receipt
Proof	POST /orders/{id}/proofs, GET /orders/{id}/proofs
Attempts	GET /orders/{id}/attempts
Tracking	GET /orders/{id}/tracking
Critical Logic:
- Pickup creates first attempt + custody atomically (DEL-002)
- Only current accepted driver transitions (DEL-001)
- Delivery: validate POD → transition → close attempt → release assignment → audit → outbox (DEL-005)
- Only one successful delivery possible (DEL-006)
- File: validate content type (JPEG/PNG), max 5MB/5 files (FILE-001/002), backend-generated keys (FILE-006), malware scan placeholder (FILE-005), Cloudinary private upload (FILE-008)
- Signed URLs for file access, max 5 min lifetime (FILE-008)
- Return: authorized actor required (RET-002), evidence verified (RET-003), custody tracked (RET-005)
Tests Required:
- Unit: State transition matrix validation (TEST-001), attempt numbering (ATT-003), retry limit enforcement (ATT-006/007), POD policy evaluation (POD-005)
- Integration: Full pickup→transit→deliver flow with POD, failure flow with reason, reschedule preserving original promise (RSC-001), return flow with evidence
- Concurrency: pickup-vs-cancel, deliver-vs-fail, duplicate-deliver — must produce exactly one terminal outcome (DEL-006, CONC-003)
- Authorization: Only driver's own active assignment (DEL-001), customer tracking authorization (PRIV-005)
- File: Content validation, size limits, scan state model (Appendix B), authorization before signed URL issuance (FILE-009)
Dependencies: Phase 4.
Phase 6: Notifications and Background Jobs
Objectives: Outbox event processing, in-app notifications, email sending via queue, job scheduler with DB polling, retention cleanup.
Files Created:
- src/modules/notifications/notifications.* (routes, controller, service, schemas)
- src/jobs/scheduler.ts
- src/jobs/lib/job-runner.ts, src/jobs/lib/job-lock.ts
- src/jobs/handlers/offer-expiration.ts
- src/jobs/handlers/outbox-dispatch.ts
- src/jobs/handlers/notification-retry.ts
- src/jobs/handlers/file-cleanup.ts
- src/jobs/handlers/retention-cleanup.ts
Database Changes: Outbox events written with domain transactions. NotificationDelivery records created.
APIs Implemented:
- GET /notifications (paginated list)
- PATCH /notifications/{id}/read (mark read)
- PATCH /notifications/read-all (mark all read)
Job Handlers:
Job	Schedule
Offer expiration	Every 30 seconds
Outbox dispatch	Every 10 seconds
Notification retry	Every 60 seconds
File cleanup	Every hour
Retention cleanup	Daily
Critical Logic:
- Outbox events written in same TX as domain changes (TXN-003)
- Notification failure does NOT roll back domain (BR-008, NOT-004)
- Idempotent event processing (NOT-005, IDEM-006)
- Bounded retries with backoff, dead-letter path (JOB-002)
- Job claim/lease prevents concurrent processing of same work (JOB-004)
- Worker graceful shutdown (JOB-005)
Tests Required:
- Unit: Job handler idempotency, retry logic, dead-letter path
- Integration: Outbox→notification end-to-end, offer expiration job, notification provider failure does not rollback domain
- Resilience: Notification provider outage simulation (NOT-004), DB poll under load
- Observability: Job backlog/age/failure metrics exposed (JOB-006)
Dependencies: Phase 5.
Phase 7: Reports and Audit
Objectives: Dashboard metrics, delivery/driver/zone reports, export capability, immutable audit log, full traceability.
Files Created:
- src/modules/reports/reports.* (routes, controller, service, schemas)
- src/modules/audit/audit.* (routes, controller, service)
APIs Implemented:
Endpoint	Purpose
GET /reports/dashboard	Aggregate operational metrics (REP-001)
GET /reports/deliveries	Delivery report with date range, zone, status filters
GET /reports/drivers	Driver performance metrics
GET /reports/zones	Zone performance metrics
GET /audit-logs	Audit log search with authorization (AUD-001/004)
Critical Logic:
- All reports include timezone, date basis, calculation timestamp, metric version (REP-002)
- Zero denominators → null not 0% (REP-003)
- Orders without promise window excluded from on-time calcs (REP-004)
- Lateness against original promise even after reschedule (REP-005)
- Row and aggregate level authorization (REP-006)
- Synchronous reports bounded to 90-day window (REP-007)
- Audit records immutable, never editable/deletable (AUD-004)
- Critical audit writes in same TX as state change (AUD-003)
Tests Required:
- Unit: Metric calculations — denominators, timezone boundaries, missing promise windows, reschedule lateness (TEST-007)
- Integration: Dashboard aggregation with realistic data, report date range validation, audit log immutability
- Authorization: Restricted users cannot infer hidden data from counts (REP-006), cross-customer data isolation
Dependencies: Phase 6.
Phase 8: Testing, Security Hardening, and Deployment
Objectives: Complete test coverage, security audit, performance baseline, CI/CD, production readiness.
Files Created/Modified:
- All remaining test files across test directories
- docker/Dockerfile finalization (multi-stage, non-root — CICD-004)
- CI pipeline configuration
- OpenAPI specification (generated or maintained)
Test Coverage (from SRS Section 21):
Test Category	Coverage Target
Unit tests	All services, all module schemas
PostgreSQL integration tests	All write operations, all state transitions
API contract tests	All endpoints vs OpenAPI
Authorization tests	Every endpoint allow/deny matrix
Concurrency tests	All 8 mandatory race scenarios
Security tests	OWASP Top 10 coverage
Provider failure tests	Email, storage, scan failures
Migration tests	Forward + rollback
E2E happy path	Full order lifecycle
E2E negative paths	All 13 mandatory scenarios
Performance baseline	p50/p95/p99 at 100 RPS
Restore test	DB backup/restore verification
Critical domain module branch coverage: ≥90% (TEST-012).
Release Gates Checklist (Section 23):
- SRS open decisions resolved
- OpenAPI contract current and validated
- Migrations tested from previous version
- Critical unit/integration/E2E suites pass
- Authorization matrix tests pass
- Concurrency and idempotency qualification passes
- Security scanning passes
- No unapproved Critical/High vulnerabilities
- Performance test meets workload + NFR targets
- Backup/restore recently tested
- Monitoring dashboards + alerts exist
- Production secrets validated
- Rollback plan documented
- Runbooks and on-call ownership defined
Dependencies: Phases 1–7 complete.
4. Technical Risks
4.1 Concurrency Problems
Risk	Impact
Duplicate active assignments	Two dispatchers assign same order simultaneously → driver gets two packages
Driver overbooking	Same driver assigned to two orders simultaneously exceeding 1-assignment policy
Accept vs. Expire race	Driver accepts an offer at the exact moment the expiration job fires
Duplicate delivery completion	Two concurrent POST /deliver requests both succeed
Outbox event loss	Event not written in same TX as domain change
Job double-processing	node-cron fires while previous invocation still running
4.2 Security Risks
Risk	Impact
Mass assignment	Client sets role, version, assignedDriverId via update body
BOLA / IDOR	User accesses another customer's orders or driver's assignments
JWT secret leakage	Token forgery
Refresh token theft	Session hijacking
Account enumeration	Attacker discovers valid emails
File upload abuse	Malicious file upload, storage exhaustion
Proof file exposure	Unauthorized access to delivery photos
SQL injection	Database compromise
Sensitive data in logs	PII leakage
CSRF	Cross-site request forgery via cookie auth
4.3 Database Issues
Risk	Impact
Migration lock contention	Deployment causes downtime on large tables
Connection pool exhaustion	Horizontal scaling kills DB
Transaction contention / deadlocks	High-concurrency dispatch causes serialization failures
Data growth	Orders, audit logs, GPS history accumulate rapidly
Decimal precision loss	Monetary calculations become incorrect
4.4 Scalability Concerns
Risk	Impact
DB polling overhead	node-cron + DB polling for jobs creates query load
Outbox event volume	Every domain mutation writes an outbox event → table grows fast
Dispatch queue performance	Complex eligibility queries on every dispatch request
Report query performance	Aggregation over 1M+ orders hits timeout limits
File storage throughput	Multiple proof uploads per delivery
Notification fan-out	Many orders delivered simultaneously → notification spike
5. Recommended First Implementation Task
Start with Phase 1, Task 1: Project Scaffolding + Environment + Database Schema.
Specifically, the first files to create:
1. package.json — Dependencies:
- Runtime: express, @prisma/client, zod, argon2, jsonwebtoken, uuid, helmet, cors, dotenv, pino, pino-pretty, nodemailer, cloudinary, node-cron
- Dev: typescript, prisma, @types/*, vitest, eslint, prettier, tsx, nodemon, supertest, @types/supertest
2. tsconfig.json — Strict mode enabled (NFR-005), ES2022 target, path aliases (@/ → src/)
3. prisma/schema.prisma — All 38 models with:
- cuid() IDs everywhere
- Decimal for monetary fields
- DateTime for timestamps (UTC)
- @unique constraints for order number, driver code, vehicle registration
- version Int @default(1) on mutable workflow resources
- Proper relations and cascading rules
4. src/config/env.ts — Zod-validated environment schema (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, SMTP_, CLOUDINARY_, PORT, NODE_ENV)
5. src/shared/ — Logger, Prisma singleton, error classes, base middleware
6. src/app.ts + src/index.ts — Express app with health endpoints
7. docker-compose.yml — PostgreSQL for local development
8. .env.example — All required environment variables documented
This gives you a running server with a connected database, validated configuration, structured logging, and proper error handling — the foundation everything else builds on.
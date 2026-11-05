# Deliverix — Customer Lifecycle Implementation Task List

This task list tracks the step-by-step implementation of the **Customer Lifecycle** and **Self-Service Experience** in accordance with [Docs/customer_lifecycle_implementation_plan.md](file:///C:/test/Deliverix/Docs/customer_lifecycle_implementation_plan.md) and [Docs/SRS.md](file:///C:/test/Deliverix/Docs/SRS.md) (`CUS-001..006`, `ORD-008..009`, `RSC-001..003`, `PRIV-005`). This also builds the authoritative customer context foundation for the upcoming **Customer Support LangChain RAG System**.

---

## Progress Dashboard

| Category | Total Tasks | Completed | In Progress | Pending | Completion Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Phase 1: Database Seed & Permissions** | 2 | 2 | 0 | 0 | 100% |
| **Phase 2: Schemas & Validation** | 3 | 3 | 0 | 0 | 100% |
| **Phase 3: Domain Service Methods** | 6 | 6 | 0 | 0 | 100% |
| **Phase 4: Controllers & Self-Service Routes** | 4 | 4 | 0 | 0 | 100% |
| **Phase 5: Customer Order Interactions** | 3 | 3 | 0 | 0 | 100% |
| **Phase 6: RAG Context Aggregator Service** | 2 | 2 | 0 | 0 | 100% |
| **Phase 7: Automated Verification & Test Suite** | 4 | 4 | 0 | 0 | 100% |
| **Phase 8: Build Verification & Final Checks** | 2 | 2 | 0 | 0 | 100% |
| **Total** | **26** | **26** | **0** | **0** | **100%** |

```
Progress: [████████████████████] 100% (26 / 26 tasks credited)
```

---

## Phase 1: Database Seed & Permissions

> Status: **Completed (100%)**

- [x] **Task 1.1**: Update `prisma/seed.ts` to define granular customer permissions:
  - `customers.me.view`
  - `customers.me.update`
  - `customers.me.addresses`
  - `orders.me.cancel`
  - `orders.me.reschedule`
- [x] **Task 1.2**: Assign these permissions to the `customer` role and verify permission seeding script.

---

## Phase 2: Schemas & Validation

> Status: **Completed (100%)**
> File: `src/modules/customers/customers.schemas.ts`

- [x] **Task 2.1**: Implement `updateMeProfileSchema` for customer self-service profile updates (name, phone).
- [x] **Task 2.2**: Implement `linkAccountSchema` for verified account linking.
- [x] **Task 2.3**: Implement `customerOrdersQuerySchema` for cursor-paginated customer order queries.

---

## Phase 3: Domain Service Implementation

> Status: **Completed (100%)**
> File: `src/modules/customers/customers.service.ts`

- [x] **Task 3.1**: Implement `getMe(userId: string)`:
  - Resolves customer linked to `accountId: userId`.
  - Computes address count, active orders count, and total orders count.
- [x] **Task 3.2**: Implement `updateMe(userId: string, data)`:
  - Validates and normalizes phone number.
  - Updates customer profile and emits transactional audit log (`customer.profile_updated`).
- [x] **Task 3.3**: Implement `linkAccount(userId: string, userEmail: string, userPhone?: string | null)`:
  - Verifies contact ownership (`CUS-005`).
  - Atomically links `Customer.accountId` with audit log `customer.account_linked`.
- [x] **Task 3.4**: Implement `listMyAddresses(userId: string)`:
  - Returns non-deleted addresses for the authenticated customer ordered by `isDefault: desc`.
- [x] **Task 3.5**: Implement `createMyAddress(userId: string, data)`:
  - Creates address for the linked customer; resets other defaults if `isDefault: true`.
- [x] **Task 3.6**: Implement `updateMyAddress(userId: string, addressId: string, data)` & `deleteMyAddress(userId: string, addressId: string)`:
  - Enforces strict customer ownership (`CUS-006`); prevents cross-customer address modifications.

---

## Phase 4: Controllers & Self-Service Routes

> Status: **Completed (100%)**
> Files: `src/modules/customers/customers.controller.ts`, `src/modules/customers/customers.routes.ts`

- [x] **Task 4.1**: Implement HTTP handler methods in `CustomersController` (`getMe`, `updateMe`, `linkAccount`, `listMyAddresses`, `createMyAddress`, `updateMyAddress`, `deleteMyAddress`, `getRAGContext`).
- [x] **Task 4.2**: Register `/api/v1/customers/me` profile routes with `authenticate` and `authorize("customers.me.view", "customers.me.update")`.
- [x] **Task 4.3**: Register `/api/v1/customers/me/addresses` routes with `authenticate` and `authorize("customers.me.addresses")`.
- [x] **Task 4.4**: Register `/api/v1/customers/me/link-account` route with `authenticate`.

---

## Phase 5: Customer Order Interactions

> Status: **Completed (100%)**
> Files: `src/modules/orders/orders.routes.ts`, `src/modules/orders/orders.controller.ts`, `src/modules/orders/orders.service.ts`

- [x] **Task 5.1**: Ensure `GET /api/v1/orders` and `GET /api/v1/orders/:id` correctly enforce customer isolation (`CUS-006`).
- [x] **Task 5.2**: Add customer cancellation support in `orders.service.ts`:
  - Enforces order belongs to the customer (`CUS-006`).
  - Restricts cancellation to `Pending` or `ReadyForPickup` states (`ORD-008`).
  - Writes audit record and outbox event `order.cancelled`.
- [x] **Task 5.3**: Expose `POST /api/v1/orders/:id/cancel` with `authorize("orders.cancel", "orders.me.cancel")`.

---

## Phase 6: RAG Context Aggregator Service

> Status: **Completed (100%)**
> File: `src/modules/customers/customer-context.service.ts`

- [x] **Task 6.1**: Implement `CustomerContextService.buildCustomerContext(userId: string)`:
  - Fetches customer profile, saved addresses, active orders with latest attempt notes/failure reasons, and delivery timeline events.
  - Formats data into a structured context bundle sanitized of PII and internal staff notes (`ORD-009`, `PRIV-005`).
- [x] **Task 6.2**: Provide prompt serialization helper `formatContextForPrompt` to ground LangChain customer support questions.

---

## Phase 7: Automated Verification & Testing Suite

> Status: **Completed (100%)**

- [x] **Task 7.1**: Unit tests for Customer Lifecycle service methods:
  - `tests/unit/modules/customers/customer-lifecycle.test.ts` (7 tests passing)
- [x] **Task 7.2**: Authorization & cross-customer isolation tests (`CUS-006`):
  - `tests/authorization/customer-boundary.test.ts` (4 tests passing)
  - Validates Customer A cannot access Customer B's addresses, profile, or orders.
- [x] **Task 7.3**: Customer context aggregator tests for RAG readiness:
  - `tests/unit/modules/customers/customer-context.test.ts` (1 test passing)
- [x] **Task 7.4**: End-to-End Customer Journey integration test:
  - `tests/e2e/customer-lifecycle-e2e.test.ts` (1 test passing)

---

## Phase 8: Build Verification & Final Checks

> Status: **Completed (100%)**

- [x] **Task 8.1**: Run TypeScript typechecking (`npm run typecheck` - 0 errors).
- [x] **Task 8.2**: Run full test suite (`npm test` - 10 test files, 35/35 tests passing).

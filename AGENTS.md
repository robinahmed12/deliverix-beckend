# AGENTS.md

## Project state

Greenfield. No application code yet — only `Docs/SRS.md` and an empty folder skeleton (empty dirs use `.gitkeep`). `package.json`, `tsconfig.json`, and the Prisma schema do **not exist yet**; no commands are available until scaffolding lands. Do not run `npm`/`prisma` commands expecting them to work.

## Source of truth

`Docs/SRS.md` (Delivery Management System backend SRS, v2.0) is the authoritative requirements document. Implementation MUST trace to its requirement IDs (`ORD-001`, `DSP-003`, `DEL-005`, `CONC-003`, `SEC-016`,...) and must not violate its normative (MUST/SHOULD/MAY) language, lifecycle tables (Section 7), error-code catalogue (Appendix A), or release gates (Section 23). If unclear, read the relevant SRS section before writing code.

## Mandated tech (from SRS §4.2)

- Express.js + TypeScript (strict mode)
- Prisma 7 as data-access layer; PostgreSQL as the only authoritative store
- Zod for request validation
- REST API versioned under `/api/v1`
- Private object storage for proof files (no DB blobs / public URLs)

## Decisions already made (do not re-litigate)

- Background jobs: `node-cron` + PostgreSQL polling — NO Redis, NO BullMQ
- Proof/object storage: Cloudinary
- Email: Nodemailer + SMTP
- Scope: backend API only (no Next.js frontend in this repo)
- Job scheduling / outbox / idempotency must be durable in PostgreSQL, never in process memory

## Non-negotiables baked into the SRS

- Business records are NEVER hard-deleted via APIs — use status/deactivation (BR-002, ORD-010)
- Order state and assignment state are separate lifecycles; offers do NOT set order to `Assigned` (§7.1)
- At most one open assignment per order; one reserved/accepted assignment per driver (initial policy)
- Every workflow transition validated against committed state; arbitrary status-set endpoints prohibited (`WF-001`)
- Mutations that can be retried MUST support `Idempotency-Key` (24h window); stale writes require `If-Match`/version → 412/428
- Domain change + outbox event MUST commit in one PostgreSQL transaction (TXN-003)
- Critical audit writes commit in the same transaction as the state change (AUD-003)
- Money = Prisma `Decimal`, never float; timestamps UTC (DATA-010/011)
- Non-enumerable opaque IDs (cuid style), not auto-increment

## Folders (architecture contract)

- `src/modules/<feature>/` — feature slices: `*.routes.ts` + `*.controller.ts` (HTTP only) + `*.service.ts` (business rules, transactions) + `*.schemas.ts` (Zod)
- `src/shared/` — cross-cutting: `middleware/` (auth, rbac, ownership, validation, idempotency, version, rate-limit), `errors/` (RFC 9457 problem+json), `types/`, `utils/`
- `src/jobs/handlers/` — cron job handlers; `src/jobs/lib/` — polling/lease machinery
- `src/integrations/` — providers behind interfaces (`email/`, `storage/`); code must NOT import Cloudinary/Nodemailer directly in services
- `tests/` — one dir per test level; concurrency/race suites in `tests/concurrency/`, authz matrix in `tests/authorization/`

## Conventions

- Response/error shape follows RFC 9457 problem+json; use stable codes from SRS Appendix A
- DTOs / safe projections only — never serialize Prisma models directly (`API-004`)
- Unknown fields in mutation requests are rejected (`API-005`)
- Pagination: cursor for growing collections, default 20 / max 100 (`PAGE-001..002`); write `docs/Docs`-referenced allowlist for sort/filter fields

## Testing expectations (SRS §21)

Mandatory levels planned: unit, PostgreSQL-backed integration, API contract, authorization, concurrency/race, security, provider-failure, E2E. Mandatory race scenarios (assign-vs-assign, accept-vs-expire, accept-vs-withdraw, pickup-vs-cancel, deliver-vs-fail, duplicate-deliver) live in `tests/concurrency/`. Critical domain modules need ≥90% branch coverage (TEST-012).

## Per-request reminder (Appendix E)

For every mutation endpoint, reviewers must answer: who may call it, ownership checks, which states permit it, transaction/constraint protection, `If-Match` need, `Idempotency-Key` need, audit record, outbox events, stable errors, sensitive data in logs/responses, and hot-path/denial/race/retry tests.
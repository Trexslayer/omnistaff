# OmniStaff technical architecture

## Runtime
- Next.js App Router hosts pages, route handlers, and server-side domain modules.
- Neon Postgres is the system of record; Prisma provides typed data access.
- Auth.js database sessions authenticate users; TenantMembership authorizes access per company.
- Inngest runs retryable background functions.
- Resend sends transactional notifications rendered with React Email.

## Tenant security model
1. Authenticate with Auth.js.
2. Resolve the requested tenant selector from a cookie.
3. Confirm active membership for the authenticated user and active tenant status.
4. Pass the resolved `tenantId` to every tenant-scoped query.
5. Use PostgreSQL RLS as defense in depth; establish tenant context transaction-locally and reset it automatically at transaction end.
6. Platform-level operations use explicit privileged routes and a separate authorization path.

## Leave approval invariants
- PENDING requests do not write a balance transaction.
- Submission validates current policy/balance as an early check only.
- Approval rechecks request state and balance in a transaction.
- A unique idempotency key prevents duplicate ledger debits.
- Approval decision, request state, ledger transaction, audit event, and outbox event are committed atomically.
- A policy change marks affected pending requests for review; approval must not use a stale calculation.

## Known gaps in this starter
- Full policy and approval workflow editors are not implemented.
- The included policy-recalculation function is an orchestration example and intentionally flags affected requests for review rather than pretending to implement every policy rule.
- Full RLS coverage, platform-admin controls, invitation/verification flows, tests, and production hardening remain required.

# OmniStaff

OmniStaff is a multi-tenant employee directory and leave-management application built with the Next.js App Router, Neon/PostgreSQL, Prisma, Auth.js v5, Inngest, Zod, Tailwind CSS, TanStack Table, and Resend/React Email.

This repository is a security-conscious project foundation, not a production-certified HR system. Security controls and workflows have been implemented in several areas, but the outstanding work below must be completed before storing real employee data.

## Core functionality

- Company self-registration creates a tenant in `PENDING_VERIFICATION` state.
- A server-side platform-admin console at `/admin` supports tenant approval, rejection, suspension, and reactivation. Access is checked against `User.isPlatformAdmin` on the server; hiding a navigation link is not an authorization control.
- Auth.js v5 authentication with a Prisma adapter, email/password credentials, Argon2 password verification, configurable JWT session lifetime, and optional Google OAuth configuration.
- Login-attempt tracking and account lockout support through the login limiter.
- Membership-backed tenant context. The `omni_tenant` cookie is treated only as a selector; the server checks the user's active membership and the tenant's active status in the database.
- Tenant-scoped employee directory and leave-request APIs.
- Company setup for company name, time zone, currency, work week, default approval mode, notice period, and probation period.
- Tenant-scoped employee, reporting-manager, and HR-manager invitations. Invitations expire after seven days, store a SHA-256 token hash rather than the raw token, and require the invitee to authenticate with the invited email before acceptance. Acceptance creates related records transactionally.
- HR-manager access requests. Company Admins can approve or reject pending requests at `/company/access-requests`; this is separate from platform-level company verification.
- Leave types and immutable, effective-dated leave-policy versions, including entitlement/accrual configuration, negative or unpaid fallback flags, partial-day settings, working-day/calendar-day counting, carry-forward limits and expiry, notice periods, consecutive-day limits, probation restrictions, approval mode, and policy notes.
- Leave-request day calculations use the tenant work week and holiday calendar and enforce configured notice, consecutive-day, and probation restrictions.
- Leave requests do not deduct leave balance while pending. Approval/rejection is handled transactionally, with an idempotent ledger entry for approved leave.
- Approval modes include manual decisions, a manager-then-HR sequence, and automatic approval where policy configuration does not require approval. The full workflow-definition administration and reporting-line enforcement still need further work.
- HR-manager-only insufficient-balance exception behavior.
- Inngest functions for notifications and pending-request policy recalculation.
- Resend/React Email notification template and on-screen TanStack Table/leave-summary reporting. No export endpoints are included.
- An example PostgreSQL row-level security (RLS) migration for the `Employee` table.

## Technology stack

- **Application:** Next.js App Router, React, TypeScript
- **Database:** Neon PostgreSQL, Prisma
- **Authentication:** Auth.js v5, Prisma adapter, Argon2
- **Validation:** Zod
- **UI/data tables:** Tailwind CSS, TanStack Table
- **Background jobs:** Inngest
- **Email:** Resend and React Email
- **Security assessment tools used/planned for this project:** OWASP ZAP, Semgrep, Gitleaks, npm audit, and manual code review

## Requirements and setup

- Node.js 20.9 or newer
- A Neon PostgreSQL project
- Google OAuth credentials if Google sign-in is enabled
- Inngest configuration for background functions
- Resend API key and a verified sender domain if email delivery is required

### 1. Configure environment variables

Copy `.env.example` to `.env` and configure the values used by your environment. At minimum, the application expects database connection settings and an Auth.js secret. Use the pooled Neon URL for `DATABASE_URL` and the direct connection URL for `DIRECT_URL` where required by the Prisma configuration.

Configure Google OAuth if enabled. For local development, the callback URL is:

`http://localhost:3000/api/auth/callback/google`

Configure `AUTH_URL` (or `NEXTAUTH_URL`, depending on the deployment setup) to the canonical application URL so generated invitation links point to the correct host. Never commit `.env` or real credentials to source control.

### 2. Install dependencies and initialize Prisma

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Run Inngest Dev Server in another terminal, or configure the hosted Inngest environment, and point it at:

`http://localhost:3000/api/inngest`

Configure `RESEND_API_KEY` and `EMAIL_FROM` with a verified sender domain if outbound email is needed.

### 3. Useful project commands

```bash
npm run typecheck
npm run build
npm run start
npx prisma migrate status
npx prisma migrate deploy
```

For an existing database, do not use `prisma db push` as a production migration strategy. Review migrations and apply them through a controlled deployment process. After schema changes, generate the Prisma client and create/apply a migration appropriate to the change.

## Administration and important routes

- `/admin` — platform-admin tenant review and status management.
- `/company/setup` — company profile and tenant defaults; Company Admins can edit settings and HR Managers have read-only access.
- `/company/invitations` — issue invitations and review invitation status.
- `/company/access-requests` — review pending membership access requests.
- `/company/leave-policies` — leave types, policy versions, and company holidays.
- `/invite/accept?token=...` — invitation acceptance flow; the raw token is sent to the invitee and only its hash is stored in the database.

Key API routes include:

- `POST /api/registrations` — public company registration; new tenants remain pending verification.
- `GET|POST /api/employees` — tenant-scoped employee directory.
- `GET|POST /api/leave-requests` — tenant-scoped leave requests.
- `POST /api/leave-requests/:id/decisions` — leave approval/rejection and the HR-manager exception path.
- `GET /api/admin/tenants` and `POST /api/admin/tenants/:id/verify` — platform-admin-only tenant administration.
- `GET|PUT /api/company/settings` — tenant company settings.
- `GET|POST|DELETE /api/company/holidays` — tenant holidays.
- `GET|POST /api/company/invitations` and `POST /api/company/invitations/accept` — invitation workflows.
- `GET|POST /api/leave-types` and `GET|POST /api/leave-policies` — leave-policy administration.
- `/api/inngest` — Inngest function endpoint.

## Security controls implemented

The current implementation includes the following controls, subject to regression testing and deployment verification:

- Server-side authorization for platform-admin actions and tenant-scoped routes.
- Database-backed tenant and membership validation; the tenant cookie is not treated as proof of authorization.
- Zod validation for selected API request bodies and controlled error responses for expected route errors.
- Transactional status changes and audit-event creation for platform-admin tenant decisions.
- Conditional updates and tenant scoping in membership access-request decisions to reduce cross-tenant access and duplicate-decision risks.
- Argon2 password hashing/verification and configurable login lockout/session lifetime controls.
- Hashed invitation tokens, invitation expiry, invited-email matching, and transactional invitation acceptance flows.
- Transactional leave approval and idempotent ledger posting for approved leave.
- Several HTTP security headers in `next.config.ts`, including `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS, plus an API Content Security Policy.
- Generic API error responses for unhandled route errors, with server-side logging for diagnosis.

These controls do not replace security tests. In particular, a configuration present in source code must be checked on the actual HTTP responses produced by the target deployment.

## Security testing and vulnerability review

Security review has included manual source inspection and the use/planned use of static analysis, secret scanning, dependency auditing, and dynamic testing. Use the following checks before release; exact commands may vary with the installed tool versions.

### TypeScript and production build

```bash
npm run typecheck
npm run build
```

Start the production build for dynamic testing rather than relying only on `next dev`:

```bash
npm run start
```

Run ZAP against the actual host/port where the production server is listening. Development-mode Next.js responses can include development runtime code and headers that do not represent the production build.

### Dependency audit

```bash
npm audit
```

Review each finding and its dependency path before applying changes. Use `npm audit fix` only after reviewing the proposed updates; avoid `npm audit fix --force` unless breaking changes are understood and tested.

### Semgrep

Run Semgrep against the repository with the ruleset selected for the project, then review each finding in context. Prioritize authorization, tenant isolation, injection, unsafe deserialization, secrets, and error-handling issues. Record false positives and remediation evidence rather than treating a clean tool result as proof of security.

### Gitleaks

Run Gitleaks against the working tree and, where appropriate, the repository history. If a real credential is discovered, revoke/rotate it; deleting the text from the latest commit alone does not invalidate an exposed secret.

### OWASP ZAP

Use ZAP baseline/active scanning only against an authorized test instance. Save the report, distinguish confirmed vulnerabilities from scanner observations, remediate, and rescan the same deployment configuration. Avoid testing production employee data without explicit authorization and a safe test plan.


## Tenant context and database isolation

The active company is selected with the `omni_tenant` cookie. This cookie is an untrusted selector only. `requireTenantContext()` validates the authenticated user's active membership and the active tenant in the database. If the user has multiple active memberships and no tenant is selected, the helper requires a selection.

The SQL example at `docs/sql/tenant-rls-example.sql` demonstrates an RLS policy for `Employee` only. Before production use:

- Add and review tenant-aware RLS policies for every tenant-owned table.
- Set `app.tenant_id` transaction-locally for each relevant database transaction.
- Apply RLS after the initial Prisma schema migration using a controlled migration.
- Ensure the application connects with a database role that does not own protected tables and does not have `BYPASSRLS`.
- Test cross-tenant reads and writes, including background jobs and administrative flows.

## Platform-admin bootstrap

The first platform administrator must be created through a trusted database/admin process by setting `User.isPlatformAdmin = true` for the intended account. Do not expose a public endpoint for granting this privilege. Record and protect the bootstrap procedure, and avoid using a normal company-admin role as a substitute for the platform-admin check.

## Production-readiness statement

OmniStaff contains meaningful authorization, tenant-context, invitation, authentication, and leave-approval controls, and has undergone an initial security review. It is **not yet production-certified**. Complete the remaining isolation, workflow, accounting, abuse-prevention, operational, and test work above, and resolve/retest the reported ZAP findings before loading real employee data.

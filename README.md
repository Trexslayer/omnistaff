# OmniStaff

A starter implementation for a multi-tenant employee directory and leave-management platform built with Next.js App Router, Neon Postgres, Prisma, Auth.js v5, Inngest, Zod, Tailwind CSS, TanStack Table, and Resend/React Email.

## Included

- Company self-registration creates a `PENDING_VERIFICATION` tenant. Platform-admin review endpoints are included; bootstrap the first platform administrator by setting `User.isPlatformAdmin = true` through a trusted database/admin process.
- Auth.js v5 with Prisma adapter and optional Google sign-in.
- Membership-backed tenant context; tenant cookie is only a selector and is validated against active database membership.
- Tenant-scoped employee directory and leave request APIs.
- Versioned leave policy data model and immutable leave transaction ledger.
- Leave requests do not deduct balance while pending; approval is a database transaction and creates an idempotent ledger entry.
- HR-manager-only insufficient-balance exception endpoint behavior.
- Inngest functions for notifications and pending-request policy recalculation.
- Resend + React Email notification template.
- On-screen TanStack Table and leave summary report; no export endpoints.
- Example PostgreSQL RLS policy migration.

## Quick start

1. Use Node.js 20.9+ and create a Neon project.
2. Copy `.env.example` to `.env` and fill in the Neon pooled URL (`DATABASE_URL`), direct URL (`DIRECT_URL`), and `AUTH_SECRET`.
3. Configure Google OAuth credentials if using the included sign-in page. Set the callback URL to `http://localhost:3000/api/auth/callback/google` for local development.
4. Install and initialize:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev --name init
   npm run dev
   ```

5. In another terminal, run Inngest Dev Server or configure the hosted Inngest environment, then point it at `http://localhost:3000/api/inngest`.
6. Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` domain to send email.

## Important implementation notes

This is a foundation, not a production-certified HR system. Before real employee data is loaded:

- The platform-admin console now lists all tenants and supports approve/reject/suspend/reactivate actions. Bootstrap the first platform administrator through a trusted database/admin process by setting `User.isPlatformAdmin = true`.
- Company setup now manages company name, time zone, currency, work week, default approval mode, notice period, and probation period. Tenant holiday CRUD is included.
- Employee invitations are tenant-scoped, expire after seven days, store only a SHA-256 token hash, and require the invitee to sign in with the invited email before acceptance. Acceptance creates the membership and employee record transactionally.
- Leave policy administration now supports leave types and immutable effective-dated versions with fixed entitlement, monthly accrual, manual accounting, negative/unpaid fallback flags, partial-day setting, working-day/calendar-day counting, carry-forward limits/expiry, notice periods, consecutive-day limits, probation restriction, approval-mode configuration, and policy notes.
- Leave request day calculation now reads the tenant work week and holiday calendar, and enforces policy notice, consecutive-day, and probation restrictions. Carry-forward and accrual accounting jobs still need production-grade ledger posting and reconciliation.
- Add tenant-aware RLS policies to every tenant table, and set `app.tenant_id` transaction-locally for every database transaction. The SQL example in `docs/sql/tenant-rls-example.sql` demonstrates the policy pattern for `Employee` only. Apply RLS after the initial Prisma schema migration. Never run the application as a table owner or a role with `BYPASSRLS`.
- Tighten manager approval authorization against the employee's reporting line and configured approval workflow. The starter checks role but does not yet enforce a workflow graph.
- Add anti-abuse controls to public registration, email verification of the registering admin, account recovery, invitation acceptance, and rate limiting.
- Change notification routing to actual tenant HR/manager recipients; the starter email function is a wiring example and logs/skips when no recipient is configured.
- Implement a dedicated balance row or advisory-lock strategy if contention is high. Serializable transactions should be retried on serialization failures; add a bounded retry policy.
- Verify that the selected tenant is active before allowing all app functions; the context helper enforces this for tenant-scoped routes.
- Add CSRF/origin checks for sensitive custom endpoints as appropriate, security headers, structured audit retention, backup/restore tests, and monitoring.
- Add automated tests for cross-tenant access, concurrent approvals, policy recalculation, negative balance exceptions, and tenant onboarding.

## HR Manager access approval

- HR Manager invitations create a pending company-membership request after the invitee accepts.
- Company Admins can review these requests at `/company/access-requests` and approve or reject them.
- Approval activates the HR Manager membership and employee directory record; rejection disables the membership and leaves the employee record inactive.
- This is separate from tenant/company verification. A company with `PENDING_VERIFICATION` status still must be approved by a Platform Admin at `/admin` before tenant-scoped Company Admin pages can be used.
- This workflow applies to newly accepted HR Manager invitations. Existing HR Manager memberships created before this change may need to be moved to `INVITED` and their employee record set to inactive before they appear in the request list.

## Newly implemented administration flows

- `/admin` — platform-admin console. Access is verified against `User.isPlatformAdmin` on the server; hiding a navigation link is not the security control.
- `/company/setup` — company profile and tenant-level defaults. Company admins can save settings; HR managers have read-only access.
- `/company/invitations` — issue invitations to employees, reporting managers, and HR managers; review invitation status.
- `/invite/accept?token=...` — acceptance requires an authenticated session whose email matches the invitation. The raw token is only emailed once; the database stores its SHA-256 hash.
- `/company/leave-policies` — create leave types, create immutable policy versions, and manage company holidays.
- `GET|PUT /api/company/settings`, `GET|POST|DELETE /api/company/holidays`, `GET|POST /api/company/invitations`, `POST /api/company/invitations/accept`, `GET|POST /api/leave-types`, and `GET|POST /api/leave-policies`.

After updating the Prisma schema, run:

```bash
npx prisma generate
npx prisma migrate dev --name company_admin_and_policy_setup
npm run typecheck
```

For an existing database, do not use `prisma db push` in production. Review and apply a migration in a controlled deployment. Configure `AUTH_URL` (or `NEXTAUTH_URL`) to the canonical public application URL so invitation links are generated correctly. Configure `RESEND_API_KEY` and `EMAIL_FROM` with a verified sender domain for email delivery.

## Tenant context

The active company is selected with the `omni_tenant` cookie. This value is **not trusted**: `requireTenantContext()` validates an active membership and active tenant from the database. A UI for selecting among multiple memberships should set this cookie only after listing memberships belonging to the authenticated user.

## Key endpoints

- `POST /api/registrations` — public company registration, pending verification.
- `GET|POST /api/employees` — tenant-scoped directory.
- `GET|POST /api/leave-requests` — tenant-scoped leave requests.
- `POST /api/leave-requests/:id/decisions` — approval/rejection and HR-manager exception path.
- `/api/inngest` — Inngest function endpoint.

## Remaining production work

1. Expand approval workflow tests and add full workflow-definition administration. Company and policy modes now gate manual decisions, including a manager-then-HR sequence and automatic approval for policies that do not require approval.
2. Complete accrual, carry-forward, expiry, and unpaid-leave ledger posting jobs. Configuration is captured; production ledger automation and reconciliation are not yet complete.
3. Add a tenant switcher for users with multiple active memberships.
4. Add identity-provider/email verification and invitation resend/revoke UX, plus rate limits and abuse controls.
5. Add integration and concurrency tests, apply RLS to every tenant table with transaction-local tenant context, and complete production deployment/monitoring and recovery tests.

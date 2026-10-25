import Link from "next/link";
import { auth } from "@/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import SignOutButton from "@/components/sign-out-button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const platformAdmin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformAdmin: true },
  });
  if (platformAdmin?.isPlatformAdmin) redirect("/admin");

  const cookieStore = await cookies();
  const selectedTenantId = cookieStore.get("omni_tenant")?.value;
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: session.user.id },
    include: { tenant: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  const selectedMembership = selectedTenantId
    ? memberships.find((membership) => membership.tenantId === selectedTenantId)
    : memberships.length === 1
      ? memberships[0]
      : undefined;

  if (selectedMembership?.role === "HR_MANAGER" && selectedMembership.status === "INVITED") {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Approval pending</p>
        <h1 className="mt-2 text-3xl font-semibold">Your HR Manager access is awaiting approval</h1>
        <p className="mt-3 text-slate-600">
          Your invitation has been accepted for {selectedMembership.tenant.name}, but a Company Admin must approve your HR Manager membership before you can access company information.
        </p>
        <div className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          You do not need to register again. Contact your company administrator if this status remains unchanged after approval.
        </div>
        <div className="mt-6"><SignOutButton /></div>
      </section>
    );
  }

  if (
    selectedMembership?.role === "COMPANY_ADMIN" &&
    selectedMembership.status === "ACTIVE" &&
    selectedMembership.tenant.status === "PENDING_VERIFICATION"
  ) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">Company verification pending</p>
        <h1 className="mt-2 text-3xl font-semibold">Your company is awaiting Platform Admin verification</h1>
        <p className="mt-3 text-slate-600">
          {selectedMembership.tenant.name} has been registered successfully. A Platform Admin must approve the company before the tenant workspace becomes available.
        </p>
        <div className="mt-6"><SignOutButton /></div>
      </section>
    );
  }

  if (memberships.length > 1 && !selectedTenantId) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-3xl font-semibold">Choose your company</h1>
        <p className="mt-2 text-slate-600">Your account belongs to more than one company. Select a company workspace before continuing.</p>
        <p className="mt-4 text-sm text-slate-500">For security, workspace selection must be implemented through an authorized tenant selector; contact your administrator if no selector is available.</p>
      </section>
    );
  }

  let ctx;
  try {
    ctx = await requireTenantContext();
  } catch {
    const platformAdmin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPlatformAdmin: true },
    });
    if (platformAdmin?.isPlatformAdmin) redirect("/admin");
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-3xl font-semibold">Workspace unavailable</h1>
        <p className="mt-2 text-slate-600">Your account does not currently have an active membership in a verified company. If you have just accepted an invitation, check your approval status or contact your company administrator.</p>
      </section>
    );
  }

  const ownEmployee = await prisma.employee.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
    select: { id: true, firstName: true, lastName: true, employeeNumber: true, jobTitle: true },
  });
  const teamFilter = ctx.role === "REPORTING_MANAGER" ? { employee: { managerUserId: ctx.userId } } : {};
  const ownFilter = ctx.role === "EMPLOYEE" ? { employeeId: ownEmployee?.id ?? "__no_employee__" } : {};
  const [activeEmployees, pendingLeave, approvedLeave, pendingHrApprovals, teamMembers] = await Promise.all([
    prisma.employee.count({
      where: {
        tenantId: ctx.tenantId,
        active: true,
        ...(ctx.role === "REPORTING_MANAGER" ? { managerUserId: ctx.userId } : {}),
        ...(ctx.role === "EMPLOYEE" ? { userId: ctx.userId } : {}),
      },
    }),
    prisma.leaveRequest.count({
      where: { tenantId: ctx.tenantId, status: { in: ["PENDING", "NEEDS_REVIEW"] }, ...teamFilter, ...ownFilter },
    }),
    prisma.leaveRequest.count({
      where: { tenantId: ctx.tenantId, status: "APPROVED", ...teamFilter, ...ownFilter },
    }),
    ctx.role === "COMPANY_ADMIN"
      ? prisma.tenantMembership.count({ where: { tenantId: ctx.tenantId, role: "HR_MANAGER", status: "INVITED" } })
      : Promise.resolve(0),
    ctx.role === "REPORTING_MANAGER"
      ? prisma.employee.count({ where: { tenantId: ctx.tenantId, active: true, managerUserId: ctx.userId } })
      : Promise.resolve(0),
  ]);

  const roleDetails = {
    COMPANY_ADMIN: {
      title: "Company Admin dashboard",
      subtitle: "Manage your company workspace, users, and access requests.",
      cards: [
        { label: "Active employees", value: activeEmployees, href: "/employees" },
        { label: "Pending HR approvals", value: pendingHrApprovals, href: "/company/access-requests" },
        { label: "Leave requests awaiting review", value: pendingLeave, href: "/leave" },
      ],
    },
    HR_MANAGER: {
      title: "HR Manager dashboard",
      subtitle: "Manage employee records and day-to-day HR operations.",
      cards: [
        { label: "Active employees", value: activeEmployees, href: "/employees" },
        { label: "Leave requests awaiting review", value: pendingLeave, href: "/leave" },
        { label: "Approved leave requests", value: approvedLeave, href: "/reports" },
      ],
    },
    REPORTING_MANAGER: {
      title: "Reporting Manager dashboard",
      subtitle: "Review your team and team-related leave activity.",
      cards: [
        { label: "Active team members", value: teamMembers, href: "/employees" },
        { label: "Team leave requests awaiting review", value: pendingLeave, href: "/leave" },
        { label: "Approved team leave requests", value: approvedLeave, href: "/reports" },
      ],
    },
    EMPLOYEE: {
      title: "Employee dashboard",
      subtitle: "View your employment details and personal leave activity.",
      cards: [
        { label: "Employment record", value: ownEmployee ? "Available" : "Not linked", href: "/leave" },
        { label: "My pending leave requests", value: pendingLeave, href: "/leave" },
        { label: "My approved leave requests", value: approvedLeave, href: "/leave" },
      ],
    },
  } as const;
  const details = roleDetails[ctx.role as keyof typeof roleDetails] ?? roleDetails.EMPLOYEE;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{ctx.tenant.name} · {ctx.role.replaceAll("_", " ")}</p>
          <h1 className="mt-1 text-3xl font-semibold">{details.title}</h1>
          <p className="mt-2 text-slate-600">{details.subtitle}</p>
        </div>
        <SignOutButton />
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {details.cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-400">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold">{card.value}</p>
            <p className="mt-3 text-sm text-indigo-700">Open details →</p>
          </Link>
        ))}
      </div>

      {ctx.role === "COMPANY_ADMIN" && pendingHrApprovals > 0 && (
        <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">HR Manager approval required</h2>
          <p className="mt-1 text-sm text-amber-900">{pendingHrApprovals} HR Manager request{pendingHrApprovals === 1 ? " is" : "s are"} waiting for your decision.</p>
          <Link href="/company/access-requests" className="mt-3 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Review requests</Link>
        </section>
      )}

      {ctx.role === "EMPLOYEE" && ownEmployee && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold">My employment</h2>
          <p className="mt-2 text-slate-600">{ownEmployee.firstName} {ownEmployee.lastName}</p>
          <p className="text-sm text-slate-500">Employee number: {ownEmployee.employeeNumber}{ownEmployee.jobTitle ? ` · ${ownEmployee.jobTitle}` : ""}</p>
        </section>
      )}
    </>
  );
}

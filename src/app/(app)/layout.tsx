import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

type NavItem = { href: string; label: string };

const companyAdminNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/leave", label: "Leave" },
  { href: "/reports", label: "Reports" },
  { href: "/company/setup", label: "Company setup" },
  { href: "/company/invitations", label: "Invitations" },
  { href: "/company/access-requests", label: "HR approvals" },
  { href: "/company/leave-policies", label: "Leave policies" },
];

const hrManagerNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "Employees" },
  { href: "/leave", label: "Leave" },
  { href: "/reports", label: "Reports" },
  { href: "/company/setup", label: "Company details" },
  { href: "/company/invitations", label: "Invitations" },
  { href: "/company/leave-policies", label: "Leave policies" },
];

const reportingManagerNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/employees", label: "My team" },
  { href: "/leave", label: "Team leave" },
  { href: "/reports", label: "Reports" },
];

const employeeNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leave", label: "My leave" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const [cookieStore, user] = await Promise.all([
    cookies(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPlatformAdmin: true },
    }),
  ]);
  const selectedTenantId = cookieStore.get("omni_tenant")?.value;

  // Resolve navigation from a database membership, never from client-provided role data.
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: session.user.id },
    include: { tenant: { select: { id: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  const selectedMembership = selectedTenantId
    ? memberships.find((membership) => membership.tenantId === selectedTenantId)
    : undefined;
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "ACTIVE" && membership.tenant.status === "ACTIVE",
  );
  const pendingHrMemberships = memberships.filter(
    (membership) => membership.role === "HR_MANAGER" && membership.status === "INVITED" && membership.tenant.status === "ACTIVE",
  );
  const pendingCompanyAdminMemberships = memberships.filter(
    (membership) => membership.role === "COMPANY_ADMIN" && membership.status === "ACTIVE" && membership.tenant.status === "PENDING_VERIFICATION",
  );

  const selectedMembershipIsRelevant = selectedMembership && (
    (selectedMembership.status === "ACTIVE" && selectedMembership.tenant.status === "ACTIVE") ||
    (selectedMembership.role === "HR_MANAGER" && selectedMembership.status === "INVITED" && selectedMembership.tenant.status === "ACTIVE") ||
    (selectedMembership.role === "COMPANY_ADMIN" && selectedMembership.status === "ACTIVE" && selectedMembership.tenant.status === "PENDING_VERIFICATION")
  );
  const currentMembership = (selectedMembershipIsRelevant ? selectedMembership : undefined)
    ?? (activeMemberships.length === 1 ? activeMemberships[0] : undefined)
    ?? (activeMemberships.length === 0 && pendingHrMemberships.length === 1 ? pendingHrMemberships[0] : undefined)
    ?? (activeMemberships.length === 0 && pendingCompanyAdminMemberships.length === 1 ? pendingCompanyAdminMemberships[0] : undefined);

  let nav: NavItem[] = [];
  if (user?.isPlatformAdmin) {
    nav = [{ href: "/admin", label: "Platform admin" }];
  } else if (currentMembership?.role === "COMPANY_ADMIN") {
    nav = companyAdminNav;
  } else if (currentMembership?.role === "HR_MANAGER" && currentMembership.status === "INVITED") {
    nav = [{ href: "/dashboard", label: "Approval status" }];
  } else if (currentMembership?.role === "HR_MANAGER") {
    nav = hrManagerNav;
  } else if (currentMembership?.role === "REPORTING_MANAGER") {
    nav = reportingManagerNav;
  } else if (currentMembership?.role === "EMPLOYEE") {
    nav = employeeNav;
  } else if (activeMemberships.length > 1) {
    nav = [{ href: "/dashboard", label: "Choose workspace" }];
  } else {
    nav = [{ href: "/dashboard", label: "Dashboard" }];
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href={user?.isPlatformAdmin ? "/admin" : "/dashboard"} className="font-semibold">OmniStaff</Link>
          <nav aria-label="Main navigation" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
          <span className="text-sm text-slate-500">{session.user.email}</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

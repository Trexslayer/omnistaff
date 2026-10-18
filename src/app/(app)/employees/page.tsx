import { requireTenantContext } from "@/lib/tenancy/context";
import { prisma } from "@/lib/db/prisma";
import { EmployeeDataTable } from "@/components/reports/employee-data-table";
export default async function EmployeesPage() {
  const ctx = await requireTenantContext([
    "COMPANY_ADMIN",
    "HR_MANAGER",
    "REPORTING_MANAGER",
  ]);
  const employees = await prisma.employee.findMany({
    where: {
      tenantId: ctx.tenantId,
      active: true,
      ...(ctx.role === "REPORTING_MANAGER"
        ? { managerUserId: ctx.userId }
        : {}),
    },
    select: {
      employeeNumber: true,
      firstName: true,
      lastName: true,
      workEmail: true,
      jobTitle: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return (
    <>
      <h1 className="text-3xl font-semibold">Employee directory</h1>
      <p className="mt-2 mb-6 text-slate-600">
        Active employees in {ctx.tenant.name}. Data is scoped to your company.
      </p>
      <EmployeeDataTable data={employees} />
    </>
  );
}

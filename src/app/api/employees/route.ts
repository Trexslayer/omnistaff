import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { employeeInput } from "@/lib/validation/employee";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER", "REPORTING_MANAGER"]);
    const employees = await prisma.employee.findMany({ where: { tenantId: ctx.tenantId, active: true, ...(ctx.role === "REPORTING_MANAGER" ? { managerUserId: ctx.userId } : {}) }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500, select: { id: true, employeeNumber: true, firstName: true, lastName: true, workEmail: true, jobTitle: true, startDate: true, department: { select: { name: true } } } });
    return NextResponse.json({ data: employees });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
    const parsed = employeeInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid employee", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    if (input.departmentId) {
      const department = await prisma.department.findFirst({ where: { id: input.departmentId, tenantId: ctx.tenantId } });
      if (!department) return NextResponse.json({ error: "Department not found" }, { status: 400 });
    }
    const employee = await prisma.employee.create({ data: { ...input, tenantId: ctx.tenantId } });
    await prisma.auditEvent.create({ data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "EMPLOYEE_CREATED", entityType: "Employee", entityId: employee.id } });
    return NextResponse.json({ data: employee }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

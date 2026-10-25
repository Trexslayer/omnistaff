
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";

const APPROVABLE_ROLES = [
  "HR_MANAGER",
  "REPORTING_MANAGER",
  "EMPLOYEE",
] as const;

export async function GET() {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN"]);

    const memberships = await prisma.tenantMembership.findMany({
      where: {
        tenantId: ctx.tenantId,
        role: { in: [...APPROVABLE_ROLES] },
        status: "INVITED",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const employeeRecords = await prisma.employee.findMany({
      where: {
        tenantId: ctx.tenantId,
        userId: {
          in: memberships.map((membership) => membership.userId),
        },
      },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        jobTitle: true,
      },
    });

    const employeesByUserId = new Map(
      employeeRecords.map((employee) => [employee.userId, employee]),
    );

    return NextResponse.json({
      data: memberships.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        name: membership.user.name,
        email: membership.user.email,
        createdAt: membership.createdAt,
        employee:
          employeesByUserId.get(membership.userId) ?? null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

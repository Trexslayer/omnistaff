import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
import { Role } from "@prisma/client";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});

const APPROVABLE_ROLES = [
  "HR_MANAGER",
  "REPORTING_MANAGER",
  "EMPLOYEE",
] as const;

const ROLE_ACTIONS = {
  HR_MANAGER: {
    approved: "HR_MANAGER_ACCESS_APPROVED",
    rejected: "HR_MANAGER_ACCESS_REJECTED",
    label: "HR Manager",
  },
  REPORTING_MANAGER: {
    approved: "REPORTING_MANAGER_ACCESS_APPROVED",
    rejected: "REPORTING_MANAGER_ACCESS_REJECTED",
    label: "Reporting Manager",
  },
  EMPLOYEE: {
    approved: "EMPLOYEE_ACCESS_APPROVED",
    rejected: "EMPLOYEE_ACCESS_REJECTED",
    label: "Employee",
  },
} as const;
function isApprovableRole(role: Role): role is keyof typeof ROLE_ACTIONS {
  return Object.prototype.hasOwnProperty.call(ROLE_ACTIONS, role);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Only authenticated Company Admins can approve or reject requests.
    const ctx = await requireTenantContext(["COMPANY_ADMIN"]);

    const parsed = schema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose approve or reject." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const decision = parsed.data.decision;
    const approved = decision === "APPROVE";

    const result = await prisma.$transaction(async (tx) => {
      // Only pending memberships in the current tenant are eligible.
      const membership = await tx.tenantMembership.findFirst({
        where: {
          id,
          tenantId: ctx.tenantId,
          role: { in: [...APPROVABLE_ROLES] },
          status: "INVITED",
        },
        select: {
          id: true,
          userId: true,
          role: true,
        },
      });

      if (!membership) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      const role = membership.role;

      // Recheck the pending status to prevent duplicate decisions.
      const updated = await tx.tenantMembership.updateMany({
        where: {
          id: membership.id,
          tenantId: ctx.tenantId,
          role,
          status: "INVITED",
        },
        data: {
          status: approved ? "ACTIVE" : "DISABLED",
        },
      });

      if (updated.count !== 1) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      // Keep the associated employee record consistent with the decision.
      await tx.employee.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId: membership.userId,
        },
        data: {
          active: approved,
        },
      });

      if (!isApprovableRole(role)) {
        throw new Error("UNSUPPORTED_ROLE");
      }

      const roleActions = ROLE_ACTIONS[role];

      await tx.auditEvent.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: approved ? roleActions.approved : roleActions.rejected,
          entityType: "TenantMembership",
          entityId: membership.id,
          metadata: {
            requestedUserId: membership.userId,
            role,
            decision,
          },
        },
      });

      return {
        userId: membership.userId,
        role,
        status: approved ? "ACTIVE" : "DISABLED",
      };
    });
    if (!(result.role in ROLE_ACTIONS)) {
      return NextResponse.json(
        { error: "Unsupported role for access request" },
        { status: 400 },
      );
    }
    
    const roleLabel = ROLE_ACTIONS[result.role].label;

    return NextResponse.json({
      data: result,
      message: approved
        ? `${roleLabel} access approved.`
        : `${roleLabel} access rejected.`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return NextResponse.json(
        { error: "Pending access request not found." },
        { status: 404 },
      );
    }

    return handleRouteError(error);
  }
}

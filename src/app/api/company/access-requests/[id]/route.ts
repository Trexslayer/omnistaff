import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";

const schema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN"]);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Choose approve or reject" }, { status: 400 });
    }
    const { id } = await params;
    const decision = parsed.data.decision;
    const result = await prisma.$transaction(async (tx) => {
      const membership = await tx.tenantMembership.findFirst({
        where: {
          id,
          tenantId: ctx.tenantId,
          role: "HR_MANAGER",
          status: "INVITED",
        },
        select: { id: true, userId: true },
      });
      if (!membership) throw new Error("REQUEST_NOT_FOUND");

      const updated = await tx.tenantMembership.updateMany({
        where: {
          id: membership.id,
          tenantId: ctx.tenantId,
          role: "HR_MANAGER",
          status: "INVITED",
        },
        data: { status: decision === "APPROVE" ? "ACTIVE" : "DISABLED" },
      });
      if (updated.count !== 1) throw new Error("REQUEST_NOT_FOUND");

      await tx.employee.updateMany({
        where: { tenantId: ctx.tenantId, userId: membership.userId },
        data: { active: decision === "APPROVE" },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: decision === "APPROVE" ? "HR_MANAGER_ACCESS_APPROVED" : "HR_MANAGER_ACCESS_REJECTED",
          entityType: "TenantMembership",
          entityId: membership.id,
          metadata: { requestedUserId: membership.userId },
        },
      });
      return { userId: membership.userId, status: decision === "APPROVE" ? "ACTIVE" : "DISABLED" };
    });
    return NextResponse.json({
      data: result,
      message: decision === "APPROVE" ? "HR Manager access approved." : "HR Manager access rejected.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ error: "Pending HR Manager request not found." }, { status: 404 });
    }
    return handleRouteError(error);
  }
}

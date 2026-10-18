import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
        const { id } = await params;
        const result = await prisma.employeeInvitation.updateMany({
            where: { id, tenantId: ctx.tenantId, status: "PENDING" },
            data: { status: "REVOKED" },
        });
        if (!result.count)
            return NextResponse.json(
                { error: "Pending invitation not found" },
                { status: 404 },
            );
        await prisma.auditEvent.create({
            data: {
                tenantId: ctx.tenantId,
                actorUserId: ctx.userId,
                action: "EMPLOYEE_INVITATION_REVOKED",
                entityType: "EmployeeInvitation",
                entityId: id,
            },
        });
        return NextResponse.json({ data: { id, status: "REVOKED" } });
    } catch (e) {
        return handleRouteError(e);
    }
}

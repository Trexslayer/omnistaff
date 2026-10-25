import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
const schema = z.object({ token: z.string().min(32).max(256) });

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id || !session.user.email)
        return NextResponse.json(
            { error: "Sign in with the invited email address first" },
            { status: 401 },
        );
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
        return NextResponse.json(
            { error: "Invitation token is required" },
            { status: 400 },
        );
    const tokenHash = createHash("sha256")
        .update(parsed.data.token)
        .digest("hex");
    try {
        const result = await prisma.$transaction(async (tx) => {
            const invitation = await tx.employeeInvitation.findUnique({
                where: { tokenHash },
                include: { tenant: true },
            });
            if (!invitation) throw new Error("INVITE_NOT_FOUND");
            if (invitation.status !== "PENDING") throw new Error("INVITE_USED");
            if (invitation.expiresAt <= new Date()) {
                await tx.employeeInvitation.update({
                    where: { id: invitation.id },
                    data: { status: "EXPIRED" },
                });
                throw new Error("INVITE_EXPIRED");
            }
            if (
                session.user.email!.toLowerCase() !==
                invitation.email.toLowerCase()
            )
                throw new Error("EMAIL_MISMATCH");
            if (invitation.tenant.status !== "ACTIVE")
                throw new Error("TENANT_INACTIVE");
            const existingMembership = await tx.tenantMembership.findUnique({
                where: {
                    tenantId_userId: {
                        tenantId: invitation.tenantId,
                        userId: session.user.id,
                    },
                },
            });
            if (existingMembership?.status === "ACTIVE")
                throw new Error("ALREADY_MEMBER");
            const claimed = await tx.employeeInvitation.updateMany({
                where: {
                    id: invitation.id,
                    status: "PENDING",
                    expiresAt: { gt: new Date() },
                },
                data: { status: "ACCEPTED", acceptedAt: new Date() },
            });
            if (claimed.count !== 1) throw new Error("INVITE_USED");
            // HR managers must be approved by a company admin before they can
            // enter the tenant workspace. Other invited roles activate on acceptance.
            const membershipStatus =
                invitation.role === "HR_MANAGER" ||
                    invitation.role === "REPORTING_MANAGER"
                    ? "INVITED"
                    : "ACTIVE";
            const membership = await tx.tenantMembership.upsert({
                where: {
                    tenantId_userId: {
                        tenantId: invitation.tenantId,
                        userId: session.user.id,
                    },
                },
                create: {
                    tenantId: invitation.tenantId,
                    userId: session.user.id,
                    role: invitation.role,
                    status: membershipStatus,
                },
                update: { role: invitation.role, status: membershipStatus },
            });
            let departmentId: string | undefined;
            if (invitation.departmentName) {
                const department = await tx.department.upsert({
                    where: {
                        tenantId_name: {
                            tenantId: invitation.tenantId,
                            name: invitation.departmentName,
                        },
                    },
                    create: {
                        tenantId: invitation.tenantId,
                        name: invitation.departmentName,
                    },
                    update: {},
                });
                departmentId = department.id;
            }
            const employee = await tx.employee.create({
                data: {
                    tenantId: invitation.tenantId,
                    userId: session.user.id,
                    employeeNumber: invitation.employeeNumber,
                    firstName: invitation.firstName,
                    lastName: invitation.lastName,
                    workEmail: invitation.email,
                    jobTitle: invitation.jobTitle,
                    departmentId,
                    active: invitation.role !== "HR_MANAGER" &&
                        invitation.role !== "REPORTING_MANAGER",
                },
            });
            await tx.auditEvent.create({
                data: {
                    tenantId: invitation.tenantId,
                    actorUserId: session.user.id,
                    action: "EMPLOYEE_INVITATION_ACCEPTED",
                    entityType: "EmployeeInvitation",
                    entityId: invitation.id,
                    metadata: {
                        employeeId: employee.id,
                        role: membership.role,
                    },
                },
            });
            return {
                tenantId: invitation.tenantId,
                tenantSlug: invitation.tenant.slug,
                employeeId: employee.id,
                role: membership.role,
                membershipStatus: membership.status,
            };
        });
        const response = NextResponse.json({
            data: result,
            message:
                result.role === "HR_MANAGER"
                    ? "Invitation accepted. Your HR Manager access is pending Company Admin approval."
                    : "Invitation accepted. You can now open your company workspace.",
        });
        response.cookies.set("omni_tenant", result.tenantId, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });
        return response;
    } catch (e) {
        const m = e instanceof Error ? e.message : "";
        if (m === "INVITE_EXPIRED")
            await prisma.employeeInvitation.updateMany({
                where: {
                    tokenHash,
                    status: "PENDING",
                    expiresAt: { lte: new Date() },
                },
                data: { status: "EXPIRED" },
            });
        const known: Record<string, { status: number; message: string }> = {
            ALREADY_MEMBER: {
                status: 409,
                message:
                    "Your account already has an active membership in this company",
            },
            INVITE_NOT_FOUND: { status: 404, message: "Invitation not found" },
            INVITE_USED: {
                status: 409,
                message: "This invitation has already been used or revoked",
            },
            INVITE_EXPIRED: {
                status: 410,
                message: "This invitation has expired",
            },
            EMAIL_MISMATCH: {
                status: 403,
                message:
                    "Sign in with the email address that received the invitation",
            },
            TENANT_INACTIVE: {
                status: 403,
                message: "This company is not active yet",
            },
        };
        if (known[m])
            return NextResponse.json(
                { error: known[m].message },
                { status: known[m].status },
            );
        if (e && typeof e === "object" && "code" in e && e.code === "P2002")
            return NextResponse.json(
                {
                    error: "This employee number or email already exists in the company",
                },
                { status: 409 },
            );
        console.error(e);
        return NextResponse.json(
            { error: "Could not accept invitation" },
            { status: 500 },
        );
    }
}

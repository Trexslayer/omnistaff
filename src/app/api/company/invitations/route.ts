import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
import { sendEmployeeInvitation } from "@/lib/email/send";

const schema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  employeeNumber: z.string().trim().min(1).max(40),
  jobTitle: z.string().trim().max(120).optional(),
  departmentName: z.string().trim().max(120).optional(),
  role: z
    .enum(["EMPLOYEE", "REPORTING_MANAGER", "HR_MANAGER"])
    .default("EMPLOYEE"),
});

export async function GET() {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
    await prisma.employeeInvitation.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: "PENDING",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    const invitations = await prisma.employeeInvitation.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ data: invitations });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        {
          error: "Invalid invitation details",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    const input = parsed.data;
    const [existingEmployee, existingInvite] = await Promise.all([
      prisma.employee.findFirst({
        where: { tenantId: ctx.tenantId, workEmail: input.email },
        select: { id: true },
      }),
      prisma.employeeInvitation.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: input.email,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (existingEmployee)
      return NextResponse.json(
        { error: "An active employee already uses this email address" },
        { status: 409 },
      );
    if (existingInvite)
      return NextResponse.json(
        { error: "A pending invitation already exists for this email" },
        { status: 409 },
      );
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const invitation = await prisma.employeeInvitation.create({
      data: {
        tenantId: ctx.tenantId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        employeeNumber: input.employeeNumber,
        jobTitle: input.jobTitle || null,
        departmentName: input.departmentName || null,
        role: input.role,
        tokenHash,
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const url = `${process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? new URL(request.url).origin}/invite/accept?token=${token}`;
    await sendEmployeeInvitation({
      to: input.email,
      companyName: ctx.tenant.name,
      firstName: input.firstName,
      inviteUrl: url,
    });
    await prisma.auditEvent.create({
      data: {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "EMPLOYEE_INVITATION_CREATED",
        entityType: "EmployeeInvitation",
        entityId: invitation.id,
        metadata: { email: input.email, role: input.role },
      },
    });
    return NextResponse.json(
      {
        data: {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          invitationUrl: url,
          emailSent: Boolean(
            process.env.RESEND_API_KEY && process.env.EMAIL_FROM,
          ),
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      return NextResponse.json(
        { error: "Employee number or invitation already exists" },
        { status: 409 },
      );
    return handleRouteError(e);
  }
}

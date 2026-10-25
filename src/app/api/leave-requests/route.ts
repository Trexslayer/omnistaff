import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
import { leaveRequestInput } from "@/lib/validation/leave";
import { calculatePolicyDays, getLeaveBalance } from "@/lib/leave/balance";
import { inngest } from "@/inngest/client";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const employee = await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId } });
    if (ctx.role === "EMPLOYEE" && !employee) return NextResponse.json({ error: "No employee record is linked to this account" }, { status: 403 });
    const requests = await prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId, ...(ctx.role === "EMPLOYEE" ? { employeeId: employee!.id } : ctx.role === "REPORTING_MANAGER" ? { employee: { managerUserId: ctx.userId } } : {}) }, include: { leaveType: { select: { name: true, code: true } }, employee: { select: { firstName: true, lastName: true, employeeNumber: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json({ data: requests });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireTenantContext();
    const parsed = leaveRequestInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid leave request", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    const employee = await prisma.employee.findFirst({ where: { tenantId: ctx.tenantId, userId: ctx.userId, active: true } });
    if (!employee && !["COMPANY_ADMIN", "HR_MANAGER"].includes(ctx.role)) return NextResponse.json({ error: "No employee record is linked to this account" }, { status: 403 });
    const targetEmployee = employee;
    if (!targetEmployee) return NextResponse.json({ error: "Administrative submissions must specify an employee through the HR workflow" }, { status: 400 });
    const leaveType = await prisma.leaveType.findFirst({ where: { id: input.leaveTypeId, tenantId: ctx.tenantId, active: true } });
    if (!leaveType) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });
    const policy = await prisma.leavePolicyVersion.findFirst({ where: { tenantId: ctx.tenantId, leaveTypeId: leaveType.id, effectiveFrom: { lte: input.startDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.startDate } }] }, orderBy: { version: "desc" } });
    if (!policy) return NextResponse.json({ error: "No applicable leave policy for the requested start date" }, { status: 422 });
    const policyConfig = policy.config && typeof policy.config === "object" && !Array.isArray(policy.config) ? policy.config as Record<string, unknown> : {};
    const tenantSettings = ctx.tenant.settings && typeof ctx.tenant.settings === "object" && !Array.isArray(ctx.tenant.settings) ? ctx.tenant.settings as Record<string, unknown> : {};
    const workWeekDays = Array.isArray(tenantSettings.workWeekDays) ? tenantSettings.workWeekDays.filter((v): v is number => typeof v === "number") : [1,2,3,4,5];
    const holidays = await prisma.tenantHoliday.findMany({ where: { tenantId: ctx.tenantId, date: { gte: input.startDate, lte: input.endDate } }, select: { date: true } });
    const countingMode = policyConfig.countingMode === "CALENDAR_DAYS" ? "CALENDAR_DAYS" : "WORKING_DAYS";
    const days = calculatePolicyDays(input.startDate, input.endDate, { countingMode, workWeekDays, holidayDates: holidays.map(h => h.date.toISOString().slice(0,10)) });
    if (days <= 0) return NextResponse.json({ error: "The selected dates contain no chargeable leave days" }, { status: 422 });
    const minimumNoticeDays = typeof policyConfig.minimumNoticeDays === "number" ? policyConfig.minimumNoticeDays : (typeof tenantSettings.minimumNoticeDays === "number" ? tenantSettings.minimumNoticeDays : 0);
    const noticeDays = Math.floor((new Date(input.startDate).setUTCHours(0,0,0,0) - new Date().setUTCHours(0,0,0,0)) / 86400000);
    if (noticeDays < minimumNoticeDays) return NextResponse.json({ error: `This leave policy requires at least ${minimumNoticeDays} calendar day(s) of notice.` }, { status: 422 });
    const maxConsecutiveDays = typeof policyConfig.maxConsecutiveDays === "number" ? policyConfig.maxConsecutiveDays : null;
    if (maxConsecutiveDays !== null && days > maxConsecutiveDays) return NextResponse.json({ error: `This policy allows at most ${maxConsecutiveDays} consecutive leave day(s).` }, { status: 422 });
    const probationMonths = typeof tenantSettings.probationPeriodMonths === "number" ? tenantSettings.probationPeriodMonths : 0;
    if (policyConfig.probationRestricted === true && targetEmployee.startDate && probationMonths > 0) {
      const probationEnd = new Date(targetEmployee.startDate); probationEnd.setUTCMonth(probationEnd.getUTCMonth() + probationMonths);
      if (input.startDate < probationEnd) return NextResponse.json({ error: "This leave type is restricted during the employee probation period." }, { status: 422 });
    }
    const balance = await getLeaveBalance(prisma, ctx.tenantId, targetEmployee.id, leaveType.id);
    // Requests do not reserve balance. This is an early validation only; final approval rechecks atomically.
    if (balance.toNumber() < days && !policy.allowNegative && !policy.allowUnpaid) {
      return NextResponse.json({ error: "Insufficient leave balance. HR must approve an authorized exception or the policy must permit an alternative." }, { status: 422 });
    }
    const noApprovalRequired = !leaveType.requiresApproval || policyConfig.approvalMode === "NONE";
    const autoApprove = noApprovalRequired && (balance.greaterThanOrEqualTo(days) || policy.allowNegative);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({ data: { tenantId: ctx.tenantId, employeeId: targetEmployee.id, leaveTypeId: leaveType.id, policyVersionId: policy.id, startDate: input.startDate, endDate: input.endDate, requestedDays: days, calculatedDays: days, reason: input.reason, status: autoApprove ? "APPROVED" : "PENDING", decidedAt: autoApprove ? new Date() : null, calculation: { method: "POLICY_CALENDAR_V1", days }, policySnapshot: { version: policy.version, accountingMethod: policy.accountingMethod, allowNegative: policy.allowNegative, allowUnpaid: policy.allowUnpaid, config: policyConfig as Prisma.InputJsonValue, workWeekDays, countingMode, holidayDates: holidays.map(h => h.date.toISOString().slice(0,10)) } } });
      if (autoApprove) {
        await tx.approvalDecision.create({ data: { tenantId: ctx.tenantId, requestId: row.id, actorUserId: ctx.userId, outcome: "APPROVED", comment: "Automatically approved by the applicable leave policy." } });
        await tx.leaveTransaction.create({ data: { tenantId: ctx.tenantId, employeeId: targetEmployee.id, leaveTypeId: leaveType.id, policyVersionId: policy.id, requestId: row.id, type: "APPROVAL", quantity: new Prisma.Decimal(days).neg(), idempotencyKey: `leave-approval:${row.id}`, description: `Auto-approved leave request ${row.id}` } });
      }
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: autoApprove ? "LEAVE_REQUEST_AUTO_APPROVED" : "LEAVE_REQUEST_SUBMITTED", entityType: "LeaveRequest", entityId: row.id, metadata: { days, autoApprove } } });
      await tx.outboxEvent.create({ data: { tenantId: ctx.tenantId, eventName: autoApprove ? "leave/request.decided" : "leave/request.submitted", payload: { requestId: row.id, tenantId: ctx.tenantId, ...(autoApprove ? { outcome: "APPROVED" } : {}) } } });
      return row;
    });
    await inngest.send({ name: autoApprove ? "leave/request.decided" : "leave/request.submitted", data: { requestId: created.id, tenantId: ctx.tenantId, ...(autoApprove ? { outcome: "APPROVED" } : {}) } });
    return NextResponse.json({ data: created, message: autoApprove ? "Request auto-approved by policy and leave balance updated." : "Request submitted. No leave balance has been deducted while the request is pending." }, { status: 201 });
  } catch (error) { return handleRouteError(error); }
}

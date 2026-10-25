import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
import { decisionInput } from "@/lib/validation/leave";
import { getLeaveBalance } from "@/lib/leave/balance";
import { inngest } from "@/inngest/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER", "REPORTING_MANAGER"]);
    const { id } = await params;
    const parsed = decisionInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid decision", details: parsed.error.flatten() }, { status: 400 });
    const input = parsed.data;
    if (input.outcome === "EXCEPTION_APPROVED" && ctx.role !== "HR_MANAGER") return NextResponse.json({ error: "Only an HR manager may approve a balance exception" }, { status: 403 });

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { leaveType: true, policyVersion: true, employee: true } });
      if (!row) throw new Error("REQUEST_NOT_FOUND");
      if (row.status !== "PENDING" && row.status !== "NEEDS_REVIEW") throw new Error("REQUEST_NOT_PENDING");

      const policyConfig = row.policyVersion.config && typeof row.policyVersion.config === "object" && !Array.isArray(row.policyVersion.config) ? row.policyVersion.config as Record<string, unknown> : {};
      const tenantSettings = ctx.tenant.settings && typeof ctx.tenant.settings === "object" && !Array.isArray(ctx.tenant.settings) ? ctx.tenant.settings as Record<string, unknown> : {};
      let approvalMode = typeof policyConfig.approvalMode === "string" ? policyConfig.approvalMode : "INHERIT";
      if (!["INHERIT", "MANAGER", "HR", "MANAGER_THEN_HR", "NONE"].includes(approvalMode)) approvalMode = "INHERIT";
      if (approvalMode === "INHERIT") {
        const requestedCompanyMode = typeof tenantSettings.approvalMode === "string" ? tenantSettings.approvalMode : "MANAGER_THEN_HR";
        const companyMode = ["MANAGER", "HR", "MANAGER_THEN_HR", "CONFIGURABLE"].includes(requestedCompanyMode) ? requestedCompanyMode : "MANAGER_THEN_HR";
        approvalMode = companyMode === "CONFIGURABLE" ? "MANAGER_THEN_HR" : companyMode;
      }
      if (approvalMode === "NONE" && row.status !== "NEEDS_REVIEW") throw new Error("NO_APPROVAL_REQUIRED");
      const isAssignedManager = row.employee.managerUserId === ctx.userId;
      if (ctx.role === "REPORTING_MANAGER" && !isAssignedManager) throw new Error("NOT_ASSIGNED_MANAGER");
      if (approvalMode === "MANAGER" && input.outcome !== "EXCEPTION_APPROVED" && (ctx.role !== "REPORTING_MANAGER" || !isAssignedManager)) throw new Error("MANAGER_APPROVAL_REQUIRED");
      if (approvalMode === "HR" && !["HR_MANAGER", "COMPANY_ADMIN"].includes(ctx.role)) throw new Error("HR_APPROVAL_REQUIRED");

      const priorDecisions = await tx.approvalDecision.findMany({ where: { tenantId: ctx.tenantId, requestId: row.id }, select: { actorUserId: true, outcome: true, actor: { select: { memberships: { where: { tenantId: ctx.tenantId, status: "ACTIVE" }, select: { role: true }, take: 1 } } } } });
      const managerApproved = priorDecisions.some(d => d.outcome === "APPROVED" && d.actor.memberships.some(m => m.role === "REPORTING_MANAGER"));
      if (approvalMode === "MANAGER_THEN_HR") {
        if (ctx.role === "REPORTING_MANAGER") {
          if (!isAssignedManager) throw new Error("NOT_ASSIGNED_MANAGER");
          if (managerApproved) throw new Error("MANAGER_ALREADY_APPROVED");
          if (input.outcome === "APPROVED") {
            await tx.approvalDecision.create({ data: { tenantId: ctx.tenantId, requestId: row.id, actorUserId: ctx.userId, outcome: "APPROVED", comment: input.comment ?? "Reporting manager approval stage completed." } });
            await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "LEAVE_REQUEST_MANAGER_STAGE_APPROVED", entityType: "LeaveRequest", entityId: row.id, metadata: { approvalMode } } });
            return { row, awaitingHrReview: true };
          }
        } else if (!managerApproved && input.outcome !== "REJECTED") {
          throw new Error("MANAGER_APPROVAL_REQUIRED");
        }
      }

      const balance = await getLeaveBalance(tx, ctx.tenantId, row.employeeId, row.leaveTypeId);
      const required = new Prisma.Decimal(row.calculatedDays);
      const insufficient = balance.lessThan(required);
      if (input.outcome === "APPROVED" && insufficient && !row.policyVersion.allowNegative && !row.policyVersion.allowUnpaid) throw new Error("INSUFFICIENT_BALANCE");
      if (input.outcome === "EXCEPTION_APPROVED" && !input.exceptionType) throw new Error("EXCEPTION_TYPE_REQUIRED");
      const approved = input.outcome !== "REJECTED";
      const updated = await tx.leaveRequest.update({ where: { id: row.id }, data: { status: approved ? "APPROVED" : "REJECTED", decidedAt: new Date() } });
      await tx.approvalDecision.create({ data: { tenantId: ctx.tenantId, requestId: row.id, actorUserId: ctx.userId, outcome: input.outcome, comment: input.comment, exceptionType: input.exceptionType } });
      if (approved) {
        await tx.leaveTransaction.create({ data: { tenantId: ctx.tenantId, employeeId: row.employeeId, leaveTypeId: row.leaveTypeId, policyVersionId: row.policyVersionId, requestId: row.id, type: "APPROVAL", quantity: required.neg(), idempotencyKey: `leave-approval:${row.id}`, description: `Approved leave request ${row.id}` } });
      }
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: `LEAVE_REQUEST_${input.outcome}`, entityType: "LeaveRequest", entityId: row.id, metadata: { previousBalance: balance.toString(), days: required.toString(), exceptionType: input.exceptionType ?? null, approvalMode } } });
      await tx.outboxEvent.create({ data: { tenantId: ctx.tenantId, eventName: "leave/request.decided", payload: { requestId: row.id, tenantId: ctx.tenantId, outcome: input.outcome } } });
      return { row: updated, awaitingHrReview: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.awaitingHrReview) return NextResponse.json({ data: result.row, message: "Manager approval recorded. The request remains pending for HR review." });
    await inngest.send({ name: "leave/request.decided", data: { requestId: id, tenantId: ctx.tenantId, outcome: input.outcome } });
    return NextResponse.json({ data: result.row });
  } catch (error) {
    if (error instanceof Error) {
      const map: Record<string, [string, number]> = {
        REQUEST_NOT_FOUND: ["Leave request not found", 404],
        NOT_ASSIGNED_MANAGER: ["You are not the assigned manager for this employee", 403],
        REQUEST_NOT_PENDING: ["Request is no longer pending", 409],
        INSUFFICIENT_BALANCE: ["Insufficient balance. An HR-manager exception or an applicable policy exception is required.", 422],
        EXCEPTION_TYPE_REQUIRED: ["Exception type is required", 400],
        NO_APPROVAL_REQUIRED: ["This request is configured for automatic approval and should not require a manual decision", 409],
        MANAGER_APPROVAL_REQUIRED: ["The reporting manager must approve this request before final review", 409],
        HR_APPROVAL_REQUIRED: ["Only an HR manager or company administrator may decide this request", 403],
        MANAGER_ALREADY_APPROVED: ["The manager approval stage has already been completed", 409],
      };
      if (map[error.message]) return NextResponse.json({ error: map[error.message][0] }, { status: map[error.message][1] });
    }
    return handleRouteError(error);
  }
}

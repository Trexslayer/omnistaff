import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db/prisma";
import { sendLeaveNotification } from "@/lib/email/send";

export const notifyLeaveSubmitted = inngest.createFunction(
  { id: "notify-leave-submitted", retries: 3 },
  { event: "leave/request.submitted" },
  async ({ event, step }) => {
    const request = await step.run("load-request", () => prisma.leaveRequest.findFirst({ where: { id: event.data.requestId, tenantId: event.data.tenantId }, include: { employee: true, leaveType: true } }));
    if (!request) return { skipped: true };
    await step.run("send-notification", () => sendLeaveNotification({ to: process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] ?? "", subject: "Leave request submitted", message: `${request.employee.firstName} ${request.employee.lastName} submitted ${request.calculatedDays.toString()} day(s) of ${request.leaveType.name}.` }));
    return { requestId: request.id };
  },
);

export const recalculatePendingRequests = inngest.createFunction(
  { id: "recalculate-pending-leave-requests", retries: 3 },
  { event: "leave/policy.version-created" },
  async ({ event, step }) => {
    const { tenantId, leaveTypeId, policyVersionId } = event.data as { tenantId: string; leaveTypeId: string; policyVersionId: string };
    const policy = await step.run("load-policy", () => prisma.leavePolicyVersion.findFirst({ where: { id: policyVersionId, tenantId, leaveTypeId } }));
    if (!policy) return { skipped: true };
    const requests = await step.run("load-affected-requests", () => prisma.leaveRequest.findMany({ where: { tenantId, leaveTypeId, status: "PENDING", startDate: { lte: policy.effectiveTo ?? new Date("9999-12-31") }, endDate: { gte: policy.effectiveFrom } }, select: { id: true, startDate: true, endDate: true, calculatedDays: true, policyVersionId: true } }));
    let updated = 0;
    for (const request of requests) {
      await step.run(`recalculate-${request.id}`, async () => {
        // Policy-specific calendar calculations should be injected here. This version refreshes policy linkage and flags review.
        await prisma.$transaction(async (tx) => {
          const current = await tx.leaveRequest.findFirst({ where: { id: request.id, tenantId, status: "PENDING" } });
          if (!current) return;
          await tx.leaveRequest.update({ where: { id: current.id }, data: { policyVersionId: policy.id, status: "NEEDS_REVIEW", policySnapshot: { version: policy.version, accountingMethod: policy.accountingMethod, allowNegative: policy.allowNegative, allowUnpaid: policy.allowUnpaid }, calculation: { recalculationRequired: true, previousPolicyVersionId: request.policyVersionId, previousCalculatedDays: request.calculatedDays.toString() } } });
          await tx.auditEvent.create({ data: { tenantId, action: "PENDING_LEAVE_POLICY_RECALCULATED", entityType: "LeaveRequest", entityId: current.id, metadata: { previousPolicyVersionId: request.policyVersionId, newPolicyVersionId: policy.id } } });
        });
        return true;
      });
      updated++;
    }
    return { scanned: requests.length, updated };
  },
);

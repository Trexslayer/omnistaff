import { z } from "zod";
export const leaveRequestInput = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().max(2000).optional(),
}).refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after start date" });

export const decisionInput = z.object({
  outcome: z.enum(["APPROVED", "REJECTED", "EXCEPTION_APPROVED"]),
  comment: z.string().trim().max(2000).optional(),
  exceptionType: z.enum(["NEGATIVE_BALANCE", "UNPAID_LEAVE", "POLICY_OVERRIDE"]).optional(),
}).superRefine((v, ctx) => {
  if (v.outcome === "EXCEPTION_APPROVED" && !v.exceptionType) ctx.addIssue({ code: "custom", path: ["exceptionType"], message: "An exception type is required" });
});

import { z } from "zod";
export const employeeInput = z.object({
  employeeNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  workEmail: z.string().trim().email().max(254),
  jobTitle: z.string().trim().max(120).optional(),
  departmentId: z.string().optional(),
  managerUserId: z.string().optional(),
  startDate: z.coerce.date().optional(),
});

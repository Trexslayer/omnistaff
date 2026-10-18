import { Prisma, type PrismaClient } from "@prisma/client";

/** Balance is a projection of immutable ledger transactions. Pending requests are deliberately excluded. */
export async function getLeaveBalance(db: Prisma.TransactionClient | PrismaClient, tenantId: string, employeeId: string, leaveTypeId: string) {
  const result = await db.leaveTransaction.aggregate({
    where: { tenantId, employeeId, leaveTypeId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? new Prisma.Decimal(0);
}

/** Baseline weekday calculation. Production deployments should replace this with a tenant calendar-aware calculator. */
export function calculateWeekdays(start: Date, end: Date): number {
  let days = 0;
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cursor <= last) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function calculatePolicyDays(start: Date, end: Date, options: { countingMode?: "WORKING_DAYS" | "CALENDAR_DAYS"; workWeekDays?: number[]; holidayDates?: string[] }) {
  const cursor = new Date(start); cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end); last.setUTCHours(0, 0, 0, 0);
  const holidays = new Set(options.holidayDates ?? []);
  const workWeek = new Set(options.workWeekDays ?? [1, 2, 3, 4, 5]);
  let days = 0;
  while (cursor <= last) {
    const dateKey = cursor.toISOString().slice(0, 10);
    if (options.countingMode === "CALENDAR_DAYS") days++;
    else {
      const weekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      if (workWeek.has(weekday) && !holidays.has(dateKey)) days++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

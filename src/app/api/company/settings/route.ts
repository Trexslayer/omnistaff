import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3).transform(v => v.toUpperCase()),
  workWeekDays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  approvalMode: z.enum(["MANAGER", "HR", "MANAGER_THEN_HR", "CONFIGURABLE"]),
  minimumNoticeDays: z.number().int().min(0).max(365),
  probationPeriodMonths: z.number().int().min(0).max(24),
  allowPartialDays: z.boolean(),
}).refine(v => new Set(v.workWeekDays).size === v.workWeekDays.length, { path: ["workWeekDays"], message: "Working days cannot repeat" });

export async function GET() {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
    return NextResponse.json({ data: { id: ctx.tenant.id, name: ctx.tenant.name, slug: ctx.tenant.slug, status: ctx.tenant.status, settings: ctx.tenant.settings } });
  } catch (e) { return handleRouteError(e); }
}
export async function PUT(request: Request) {
  try {
    const ctx = await requireTenantContext(["COMPANY_ADMIN"]);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid company settings", details: parsed.error.flatten() }, { status: 400 });
    const current = ctx.tenant.settings && typeof ctx.tenant.settings === "object" && !Array.isArray(ctx.tenant.settings) ? ctx.tenant.settings as Record<string, unknown> : {};
    const settings = { ...current, timezone: parsed.data.timezone, currency: parsed.data.currency, workWeekDays: parsed.data.workWeekDays, approvalMode: parsed.data.approvalMode, minimumNoticeDays: parsed.data.minimumNoticeDays, probationPeriodMonths: parsed.data.probationPeriodMonths, allowPartialDays: parsed.data.allowPartialDays };
    const updated = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.update({ where: { id: ctx.tenantId }, data: { name: parsed.data.name, settings } });
      await tx.auditEvent.create({ data: { tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "COMPANY_SETTINGS_UPDATED", entityType: "Tenant", entityId: ctx.tenantId, metadata: { settings } } });
      return tenant;
    });
    return NextResponse.json({ data: { id: updated.id, name: updated.name, settings: updated.settings } });
  } catch (e) { return handleRouteError(e); }
}

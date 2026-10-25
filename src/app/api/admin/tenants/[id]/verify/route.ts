import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getPlatformAdmin } from "@/lib/auth/platform-admin";
const schema = z.object({ decision: z.enum(["APPROVE", "REJECT", "SUSPEND", "REACTIVATE"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getPlatformAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  const { id } = await params;
  try {
    const tenant = await prisma.$transaction(async tx => {
      const current = await tx.tenant.findUnique({ where: { id } });
      if (!current) throw new Error("TENANT_NOT_FOUND");
      const target = parsed.data.decision === "APPROVE" || parsed.data.decision === "REACTIVATE" ? "ACTIVE" : parsed.data.decision === "REJECT" ? "REJECTED" : "SUSPENDED";
      const allowed = parsed.data.decision === "APPROVE" ? current.status === "PENDING_VERIFICATION" :
        parsed.data.decision === "REJECT" ? current.status === "PENDING_VERIFICATION" :
        parsed.data.decision === "SUSPEND" ? current.status === "ACTIVE" : current.status === "SUSPENDED";
      if (!allowed) throw new Error("INVALID_TRANSITION");
      const updated = await tx.tenant.update({ where: { id }, data: { status: target, verifiedAt: parsed.data.decision === "APPROVE" ? new Date() : current.verifiedAt, verifiedById: admin.userId } });
      await tx.auditEvent.create({ data: { tenantId: id, actorUserId: admin.userId, action: `TENANT_${parsed.data.decision}`, entityType: "Tenant", entityId: id, metadata: { previousStatus: current.status, newStatus: updated.status } } });
      return updated;
    });
    return NextResponse.json({ data: { id: tenant.id, status: tenant.status } });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "TENANT_NOT_FOUND") return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (message === "INVALID_TRANSITION") return NextResponse.json({ error: "That status transition is not allowed" }, { status: 409 });
    console.error(e); return NextResponse.json({ error: "Unable to update company status" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getPlatformAdmin } from "@/lib/auth/platform-admin";

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });
  const tenants = await prisma.tenant.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: { id: true, name: true, slug: true, status: true, createdAt: true, verifiedAt: true,
      memberships: { where: { role: "COMPANY_ADMIN" }, select: { user: { select: { name: true, email: true } } }, take: 1 },
      _count: { select: { employees: true, memberships: true } } }
  });
  return NextResponse.json({ data: tenants });
}

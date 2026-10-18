import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { Role } from "@prisma/client";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/** Tenant selection is a hint only. Membership and active tenant status are always checked in the database. */
export async function requireTenantContext(allowedRoles?: Role[]) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError("Authentication required");
  const cookieStore = await cookies();
  const requestedTenantId = cookieStore.get("omni_tenant")?.value;
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: session.user.id, status: "ACTIVE", tenant: { status: "ACTIVE" }, ...(requestedTenantId ? { tenantId: requestedTenantId } : {}) },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) throw new ForbiddenError("No active company membership found");
  if (!requestedTenantId && memberships.length > 1) throw new ForbiddenError("Select a company before continuing");
  const membership = memberships[0];
  if (allowedRoles && !allowedRoles.includes(membership.role)) throw new ForbiddenError("Insufficient permissions");
  return { userId: session.user.id, tenantId: membership.tenantId, role: membership.role, tenant: membership.tenant };
}

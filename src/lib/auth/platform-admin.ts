import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";

export async function getPlatformAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, status: 401, error: "Authentication required" };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPlatformAdmin: true } });
  if (!user?.isPlatformAdmin) return { ok: false as const, status: 403, error: "Platform administrator access required" };
  return { ok: true as const, userId: session.user.id };
}

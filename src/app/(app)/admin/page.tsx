import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import AdminConsole from "@/components/admin/admin-console";

export default async function PlatformAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPlatformAdmin: true } });
  if (!user?.isPlatformAdmin) redirect("/dashboard");
  return <AdminConsole />;
}

import { requireTenantContext } from "@/lib/tenancy/context";
import { prisma } from "@/lib/db/prisma";
export default async function ReportsPage() {
  const ctx = await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER", "REPORTING_MANAGER"]);
  const rows = await prisma.leaveRequest.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId }, _count: { _all: true }, _sum: { calculatedDays: true } });
  return <><h1 className="text-3xl font-semibold">Leave reports</h1><p className="mt-2 mb-6 text-slate-600">On-screen summary only. Export is intentionally not enabled in Release 1.</p><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3">Request status</th><th className="px-4 py-3">Requests</th><th className="px-4 py-3">Days requested</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r=><tr key={r.status}><td className="px-4 py-3">{r.status.replaceAll("_"," ")}</td><td className="px-4 py-3">{r._count._all}</td><td className="px-4 py-3">{r._sum.calculatedDays?.toString() ?? "0"}</td></tr>)}</tbody></table></div></>;
}

import { requireTenantContext } from "@/lib/tenancy/context";
import { redirect } from "next/navigation";
import CompanySetupForm from "@/components/company/company-setup-form";
export default async function CompanySetupPage() {
  let ctx; try { ctx = await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER"]); } catch { redirect("/dashboard"); }
  return <div className="mx-auto max-w-3xl"><p className="text-sm font-medium text-indigo-600">COMPANY CONFIGURATION</p><h1 className="mt-1 text-3xl font-semibold">Company setup</h1><p className="mt-2 text-slate-600">Configure organization identity, work week, time zone, and default approval behavior.</p><CompanySetupForm initial={{ name: ctx.tenant.name, slug: ctx.tenant.slug, status: ctx.tenant.status, settings: (ctx.tenant.settings ?? {}) as Record<string, unknown> }} editable={ctx.role==="COMPANY_ADMIN"} /></div>;
}

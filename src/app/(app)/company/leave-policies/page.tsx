import { requireTenantContext } from "@/lib/tenancy/context";
import { redirect } from "next/navigation";
import LeavePolicyManager from "@/components/company/leave-policy-manager";
import HolidayManager from "@/components/company/holiday-manager";
export default async function LeavePoliciesPage(){try{await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER"]);}catch{redirect("/dashboard");}return <div><p className="text-sm font-medium text-indigo-600">POLICY ADMINISTRATION</p><h1 className="mt-1 text-3xl font-semibold">Leave policies</h1><p className="mt-2 max-w-3xl text-slate-600">Define leave categories, effective-dated policy versions, entitlement or accrual rules, carry-forward, eligibility constraints, and approval behavior.</p><LeavePolicyManager/><HolidayManager/></div>}

import { requireTenantContext } from "@/lib/tenancy/context";
import { redirect } from "next/navigation";
import HrAccessRequests from "@/components/company/hr-access-requests";

export default async function CompanyAccessRequestsPage() {
  try {
    await requireTenantContext(["COMPANY_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  return <HrAccessRequests />;
}

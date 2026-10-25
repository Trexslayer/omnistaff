import { requireTenantContext } from "@/lib/tenancy/context";
import { redirect } from "next/navigation";
import InvitationsManager from "@/components/company/invitations-manager";
export default async function InvitationsPage() {
    try {
        await requireTenantContext(["COMPANY_ADMIN", "HR_MANAGER"]);
    } catch {
        redirect("/dashboard");
    }
    return (
        <div>
            <p className="text-sm font-medium text-indigo-600">
                PEOPLE OPERATIONS
            </p>
            <h1 className="mt-1 text-3xl font-semibold">
                Employee invitations
            </h1>
            <p className="mt-2 text-slate-600">
                Invite employees and managers to sign in and join the active
                company workspace.
            </p>
            <InvitationsManager />
        </div>
    );
}

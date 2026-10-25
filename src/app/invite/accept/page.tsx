import InviteAcceptance from "@/components/company/invite-acceptance";
export default async function InviteAcceptPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const params = await searchParams;
    return (
        <main className="min-h-screen bg-slate-50 px-5 py-16">
            <div className="mx-auto max-w-lg rounded-2xl border bg-white p-7">
                <p className="text-sm font-semibold text-indigo-600">
                    OMNISTAFF
                </p>
                <h1 className="mt-2 text-2xl font-semibold">
                    Accept employee invitation
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                    Create an account or sign in with the invited email address. We will then process your invitation and assign the appropriate company access.
                </p>
                <InviteAcceptance token={params.token ?? ""} />
            </div>
        </main>
    );
}

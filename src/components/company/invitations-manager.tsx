"use client";
import { useEffect, useState } from "react";

type Invite = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    role: string;
    status: string;
    expiresAt: string;
    createdAt: string;
};
export default function InvitationsManager() {
    const [items, setItems] = useState<Invite[]>([]);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        email: "",
        firstName: "",
        lastName: "",
        employeeNumber: "",
        jobTitle: "",
        departmentName: "",
        role: "EMPLOYEE",
    });
    const [invitationUrl, setInvitationUrl] = useState("");
    async function load() {
        const r = await fetch("/api/company/invitations");
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Could not load invitations");
        setItems(j.data);
    }
    useEffect(() => {
        load().catch((e) => setError(e.message));
    }, []);
    function change(
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }
    async function revoke(id: string) {
        setError("");
        try {
            const r = await fetch(`/api/company/invitations/${id}`, {
                method: "DELETE",
            });
            const j = await r.json();
            if (!r.ok)
                throw new Error(j.error ?? "Could not revoke invitation");
            await load();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not revoke invitation",
            );
        }
    }
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        setInvitationUrl("");
        try {
            const r = await fetch("/api/company/invitations", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(form),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? "Invitation failed");
            setInvitationUrl(j.data.invitationUrl ?? "");
            setMessage(
                j.data.emailSent
                    ? "Invitation email sent."
                    : "Invitation created. Configure Resend to send the email; development logs include the invitation link.",
            );
            setForm({
                email: "",
                firstName: "",
                lastName: "",
                employeeNumber: "",
                jobTitle: "",
                departmentName: "",
                role: "EMPLOYEE",
            });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Invitation failed");
        } finally {
            setBusy(false);
        }
    }
    async function copyInvitationLink() {
        if (!invitationUrl) return;

        try {
            await navigator.clipboard.writeText(invitationUrl);
            setMessage("Invitation link copied successfully.");
        } catch {
            setError(
                "Could not copy the link. Select the URL and copy it manually.",
            );
        }
    }
    return (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <form
                onSubmit={submit}
                className="h-fit space-y-4 rounded-xl border bg-white p-5"
            >
                <h2 className="font-semibold">Create invitation</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    {[
                        ["firstName", "First name"],
                        ["lastName", "Last name"],
                        ["email", "Work email"],
                        ["employeeNumber", "Employee number"],
                        ["jobTitle", "Job title"],
                        ["departmentName", "Department"],
                    ].map(([key, label]) => (
                        <label key={key} className="block text-sm font-medium">
                            {label}
                            <input
                                required={[
                                    "firstName",
                                    "lastName",
                                    "email",
                                    "employeeNumber",
                                ].includes(key)}
                                type={key === "email" ? "email" : "text"}
                                name={key}
                                value={form[key as keyof typeof form]}
                                onChange={change}
                                className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                            />
                        </label>
                    ))}
                </div>
                <label className="block text-sm font-medium">
                    Role
                    <select
                        name="role"
                        value={form.role}
                        onChange={change}
                        className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"
                    >
                        <option value="EMPLOYEE">Employee</option>
                        <option value="REPORTING_MANAGER">
                            Reporting manager
                        </option>
                        <option value="HR_MANAGER">HR manager</option>
                    </select>
                </label>
                {error && (
                    <p role="alert" className="text-sm text-red-700">
                        {error}
                    </p>
                )}
                {message && (
                    <p role="status" className="text-sm text-emerald-700">
                        {message}
                    </p>
                )}
                <button
                    disabled={busy}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {busy ? "Creating…" : "Send invitation"}
                </button>

                {invitationUrl && (
                    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                        <h3 className="font-semibold text-slate-900">
                            Invitation link
                        </h3>

                        <input
                            type="text"
                            readOnly
                            value={invitationUrl}
                            aria-label="Invitation link"
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700"
                        />

                        <button
                            type="button"
                            onClick={copyInvitationLink}
                            className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
                        >
                            Copy invitation link
                        </button>

                        <p className="text-xs text-slate-600">
                            Share this link with the invited employee. The
                            invitation expires after seven days.
                        </p>
                    </div>
                )}
            </form>
            <section className="overflow-hidden rounded-xl border bg-white">
                <div className="border-b px-5 py-4">
                    <h2 className="font-semibold">Recent invitations</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                            <tr>
                                {["Employee", "Role", "Status", "Expires"].map(
                                    (x) => (
                                        <th
                                            key={x}
                                            className="px-3 py-3 font-medium"
                                        >
                                            {x}
                                        </th>
                                    ),
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((i) => (
                                <tr key={i.id}>
                                    <td className="px-3 py-3">
                                        <div className="font-medium">
                                            {i.firstName} {i.lastName}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {i.email}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            #{i.employeeNumber}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        {i.role.replaceAll("_", " ")}
                                    </td>
                                    <td className="px-3 py-3">{i.status}</td>
                                    <td className="px-3 py-3 whitespace-nowrap">
                                        <div>
                                            {new Date(
                                                i.expiresAt,
                                            ).toLocaleDateString()}
                                        </div>
                                        {i.status === "PENDING" && (
                                            <button
                                                onClick={() => revoke(i.id)}
                                                className="mt-1 text-xs text-red-700"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!items.length && (
                    <p className="p-5 text-sm text-slate-500">
                        No invitations yet.
                    </p>
                )}
            </section>
        </div>
    );
}

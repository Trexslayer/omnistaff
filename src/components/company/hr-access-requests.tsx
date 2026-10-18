"use client";

import { useEffect, useState } from "react";

type RequestItem = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  employee: {
    firstName: string;
    lastName: string;
    employeeNumber: string;
    jobTitle: string | null;
  } | null;
};

export default function HrAccessRequests() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const response = await fetch("/api/company/access-requests", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error ?? "Could not load access requests");
    setItems(json.data);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load access requests"));
  }, []);

  async function decide(id: string, decision: "APPROVE" | "REJECT") {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/company/access-requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not update request");
      setMessage(json.message);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update request");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-indigo-600">COMPANY ADMIN</p>
        <h1 className="mt-1 text-3xl font-semibold">HR Manager access requests</h1>
        <p className="mt-2 text-slate-600">
          Review HR Managers who accepted an invitation. Approval activates their company membership and employee record.
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Pending requests ({items.length})</h2>
        </div>
        {items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No pending HR Manager access requests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["HR Manager", "Email", "Employee number", "Job title", "Requested", "Actions"].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.employee ? `${item.employee.firstName} ${item.employee.lastName}` : item.name ?? "—"}</td>
                    <td className="px-4 py-3">{item.email ?? "—"}</td>
                    <td className="px-4 py-3">{item.employee?.employeeNumber ?? "—"}</td>
                    <td className="px-4 py-3">{item.employee?.jobTitle ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button disabled={busy === item.id} onClick={() => decide(item.id, "APPROVE")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-50">Approve</button>
                        <button disabled={busy === item.id} onClick={() => decide(item.id, "REJECT")} className="rounded-md border border-red-200 px-3 py-1.5 text-red-700 disabled:opacity-50">Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

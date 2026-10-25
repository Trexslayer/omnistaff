
"use client";

import { useCallback, useEffect, useState } from "react";


type RequestRole =
  | "HR_MANAGER"
  | "REPORTING_MANAGER"
  | "EMPLOYEE";

const ROLE_LABELS: Record<RequestRole, string> = {
  HR_MANAGER: "HR Manager",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
};


type RequestItem = {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  role: RequestRole;
  employee: {
    firstName: string;
    lastName: string;
    employeeNumber: string;
    jobTitle: string | null;
  } | null;
};



type RoleFilter = "ALL" | RequestRole;

export default function HrAccessRequests() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [filter, setFilter] = useState<RoleFilter>("ALL");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/company/access-requests", {
      cache: "no-store",
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error ?? "Could not load access requests");
    }

    setItems(json.data);
  }, []);

  useEffect(() => {
    load().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load access requests"
      )
    );
  }, [load]);

  async function decide(
    id: string,
    decision: "APPROVE" | "REJECT"
  ) {
    setBusy(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/company/access-requests/${id}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error ?? "Could not update request");
      }

      setMessage(
        json.message ??
          `Request ${decision === "APPROVE" ? "approved" : "rejected"} successfully`
      );

      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update request"
      );
    } finally {
      setBusy("");
    }
  }

  const visibleItems = items.filter(
    (item) => filter === "ALL" || item.role === filter
  );

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm font-medium text-indigo-600">
          COMPANY ADMIN
        </p>
        <h1 className="mt-1 text-3xl font-semibold">
          User access requests
        </h1>
        <p className="mt-2 text-slate-600">
          Review and approve HR Managers, Reporting Managers,
          and Employees for your company.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {message && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", "All roles"],
            ["HR_MANAGER", "HR Managers"],
            ["REPORTING_MANAGER", "Reporting Managers"],
            ["EMPLOYEE", "Employees"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-lg border px-4 py-2 text-sm ${
              filter === value
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {label}
            {" ("}
            {value === "ALL"
              ? items.length
              : items.filter((item) => item.role === value).length}
            {")"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">
            Pending requests ({visibleItems.length})
          </h2>
        </div>

        {visibleItems.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No pending requests for this selection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {[
                    "Name",
                    "Role",
                    "Email",
                    "Employee number",
                    "Job title",
                    "Requested",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y">
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      {item.employee
                        ? `${item.employee.firstName} ${item.employee.lastName}`
                        : item.name ?? "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {ROLE_LABELS[item.role]}
                    </td>

                    <td className="px-4 py-3">
                      {item.email ?? "—"}
                    </td>

                    <td className="px-4 py-3">
                      {item.employee?.employeeNumber ?? "—"}
                    </td>

                    <td className="px-4 py-3">
                      {item.employee?.jobTitle ?? "—"}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy !== "" || busy === item.id}
                          onClick={() => decide(item.id, "APPROVE")}
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-50"
                        >
                          {busy === item.id ? "Processing..." : "Approve"}
                        </button>

                        <button
                          type="button"
                          disabled={busy !== ""}
                          onClick={() => decide(item.id, "REJECT")}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
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

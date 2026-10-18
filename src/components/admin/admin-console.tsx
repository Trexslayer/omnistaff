"use client";
import { useEffect, useState } from "react";

type Tenant = { id: string; name: string; slug: string; status: string; createdAt: string; verifiedAt: string | null; memberships: { user: { name: string | null; email: string | null } }[]; _count: { employees: number; memberships: number } };
export default function AdminConsole() {
  const [items, setItems] = useState<Tenant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function load() { const r = await fetch("/api/admin/tenants", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Could not load companies"); setItems(j.data); }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function act(id: string, decision: string) {
    setBusy(id); setError("");
    try { const r = await fetch(`/api/admin/tenants/${id}/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Action failed"); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); } finally { setBusy(""); }
  }
  const count = (status: string) => items.filter(x => x.status === status).length;
  return <div className="space-y-7">
    <div><p className="text-sm font-medium text-indigo-600">PLATFORM OPERATIONS</p><h1 className="mt-1 text-3xl font-semibold">Platform admin</h1><p className="mt-2 text-slate-600">Review registrations, manage company status, and monitor tenant footprint.</p></div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-4">{[["All companies",items.length],["Pending verification",count("PENDING_VERIFICATION")],["Active",count("ACTIVE")],["Suspended",count("SUSPENDED")]].map(([label,value]) => <div className="rounded-xl border bg-white p-4" key={label}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="font-semibold">Company tenants</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{["Company","Primary admin","Status","Employees","Registered","Actions"].map(x=><th className="px-4 py-3 font-medium" key={x}>{x}</th>)}</tr></thead><tbody className="divide-y">{items.map(t=><tr key={t.id}><td className="px-4 py-4"><div className="font-medium">{t.name}</div><div className="text-xs text-slate-500">{t.slug}</div></td><td className="px-4 py-4">{t.memberships[0]?.user.name ?? "—"}<div className="text-xs text-slate-500">{t.memberships[0]?.user.email ?? "No admin"}</div></td><td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{t.status.replaceAll("_"," ")}</span></td><td className="px-4 py-4">{t._count.employees}</td><td className="px-4 py-4 whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString()}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2">{t.status==="PENDING_VERIFICATION" && <><button disabled={busy===t.id} onClick={()=>act(t.id,"APPROVE")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-white disabled:opacity-50">Approve</button><button disabled={busy===t.id} onClick={()=>act(t.id,"REJECT")} className="rounded-md border px-3 py-1.5 disabled:opacity-50">Reject</button></>}{t.status==="ACTIVE" && <button disabled={busy===t.id} onClick={()=>act(t.id,"SUSPEND")} className="rounded-md border border-red-200 px-3 py-1.5 text-red-700 disabled:opacity-50">Suspend</button>}{t.status==="SUSPENDED" && <button disabled={busy===t.id} onClick={()=>act(t.id,"REACTIVATE")} className="rounded-md border px-3 py-1.5 disabled:opacity-50">Reactivate</button>}</div></td></tr>)}</tbody></table></div>{!items.length && <p className="p-6 text-sm text-slate-500">No companies registered yet.</p>}</section>
  </div>;
}

import Link from "next/link";
import { auth } from "@/auth";
export default async function Home() {
  const session = await auth();
  return <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16"><div className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-700">OmniStaff</div><h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">Workforce operations, with leave management at the core.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Manage employee records, leave policies, approval workflows, and company-level reporting in one secure workspace.</p><div className="mt-8 flex gap-3">{session ? <Link className="rounded-lg bg-slate-900 px-5 py-3 text-white" href="/dashboard">Open dashboard</Link> : <Link className="rounded-lg bg-slate-900 px-5 py-3 text-white" href="/signin">Sign in</Link>}<Link className="rounded-lg border border-slate-300 bg-white px-5 py-3" href="/register">Register a company</Link></div></main>;
}

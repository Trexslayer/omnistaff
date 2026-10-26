import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">404</h1>
      <p className="mt-4 text-base text-slate-600">The page you are looking for does not exist.</p>
      <div className="mt-6">
        <Link
          href="/"
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Return home
        </Link>
      </div>
    </main>
  );
}

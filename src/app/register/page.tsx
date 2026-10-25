
"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    companyName: "",
    slug: "",
    adminName: "",
    adminEmail: "",
    password: "",
  });

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      setMessage(
        res.ok
          ? "Registration submitted. Check your email to verify your account. Your company must also be approved by a platform administrator."
          : data.error ?? "Registration failed."
      );

      if (res.ok) {
        setForm({
          companyName: "",
          slug: "",
          adminName: "",
          adminEmail: "",
          password: "",
        });
      }
    } catch {
      setMessage("Unable to submit registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold">
        Register your company
      </h1>

      <p className="mt-2 text-slate-600">
        Create your administrator account and submit your company
        for verification.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Company name
          <input
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
            value={form.companyName}
            onChange={(e) => update("companyName", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          Company URL slug
          <input
            required
            minLength={3}
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
            placeholder="example-company"
            value={form.slug}
            onChange={(e) =>
              update(
                "slug",
                e.target.value.toLowerCase().replace(/\s+/g, "-")
              )
            }
          />
        </label>

        <label className="block text-sm font-medium">
          Administrator name
          <input
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
            value={form.adminName}
            onChange={(e) => update("adminName", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          Administrator email
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
            value={form.adminEmail}
            onChange={(e) => update("adminEmail", e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border px-3 py-2.5 font-normal"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            Use at least 12 characters.
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Create account and submit company"}
        </button>
      </form>

      {message && (
        <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm">
          {message}
        </p>
      )}
    </main>
  );
}

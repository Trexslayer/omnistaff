
"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  // Active countdown timer if account is temporarily locked out
  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          setError("Lockout expired. You may now attempt to sign in again.");
          return null;
        }
        const updated = prev - 1;
        const mins = Math.floor(updated / 60);
        const secs = updated % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setError(`Account is temporarily locked due to too many failed attempts. Try again in ${timeStr}.`);
        return updated;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lockoutSeconds !== null && lockoutSeconds > 0) return;

    setBusy(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        if (result?.code?.startsWith("locked_out")) {
          const parts = result.code.split(":");
          const seconds = parts[1] ? parseInt(parts[1], 10) : 180;
          setLockoutSeconds(seconds);
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          setError(
            `Account is temporarily locked due to too many failed attempts. Try again in ${timeStr}.`
          );
        } else if (result?.code?.startsWith("attempts_remaining")) {
          const remaining = result.code.split(":")[1];
          setLockoutSeconds(null);
          setError(
            `Invalid email or password. ${remaining} attempt${
              remaining === "1" ? "" : "s"
            } remaining before a 3-minute lockout.`
          );
        } else {
          setLockoutSeconds(null);
          setError("Invalid email or password.");
        }
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Sign in to OmniStaff</h1>
      <p className="mt-2 text-slate-600">
        Use your registered email and password.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2.5 disabled:bg-slate-100"
            type="email"
            autoComplete="email"
            required
            disabled={isLocked}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2.5 disabled:bg-slate-100"
            type="password"
            autoComplete="current-password"
            required
            disabled={isLocked}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && (
          <div
            role="alert"
            className={`rounded-lg p-3 text-sm ${
              isLocked
                ? "border border-amber-300 bg-amber-50 text-amber-900"
                : "border border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {error}
          </div>
        )}

        <button
          disabled={busy || isLocked}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : isLocked ? "Locked out" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

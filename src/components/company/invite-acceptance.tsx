"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

type Mode = "register" | "signin";

export default function InviteAcceptance({ token }: { token: string }) {
  const [mode, setMode] = useState<Mode>("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function acceptInvitation() {
    const response = await fetch("/api/company/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not accept invitation.");
    window.location.assign("/dashboard");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Invitation token is missing. Open the complete invitation link sent by your company.");
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError("Password must contain 12–128 characters.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      let accountEmail = email.trim().toLowerCase();

      if (mode === "register") {
        const registerResponse = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const registerResult = await registerResponse.json();
        if (!registerResponse.ok) {
          if (registerResponse.status === 409 && String(registerResult.error ?? "").toLowerCase().includes("account already exists")) {
            setMode("signin");
            setEmail(accountEmail);
            throw new Error("An account already exists for this invitation. Sign in with that account to continue.");
          }
          throw new Error(registerResult.error ?? "Registration failed.");
        }
        accountEmail = String(registerResult.data?.email ?? "").trim().toLowerCase();
        if (!accountEmail) throw new Error("Account created, but the invitation email was not returned. Switch to sign in and enter the invited email.");
        setEmail(accountEmail);
      }

      const signInResult = await signIn("credentials", {
        email: accountEmail,
        password,
        redirect: false,
      });
      if (!signInResult || signInResult.error || !signInResult.ok) {
        if (mode === "register") setMode("signin");
        throw new Error("Account created, but sign-in failed. Check the email and password, then sign in to continue.");
      }

      await acceptInvitation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete invitation acceptance.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="mt-5 text-sm text-red-700">Invitation token is missing. Open the complete invitation link sent by your company.</p>;
  }

  return (
    <div className="mt-6">
      <div className="mb-5 flex gap-2 rounded-lg bg-slate-100 p-1">
        <button type="button" onClick={() => { setMode("register"); setError(""); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === "register" ? "bg-white shadow-sm" : "text-slate-600"}`}>Create account</button>
        <button type="button" onClick={() => { setMode("signin"); setError(""); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === "signin" ? "bg-white shadow-sm" : "text-slate-600"}`}>Already registered</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signin" && (
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">Invitation email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="you@company.com" />
          </div>
        )}
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">{mode === "register" ? "Create password" : "Password"}</label>
          <input id="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="12–128 characters" />
        </div>
        {mode === "register" && (
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Re-enter your password" />
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {busy ? "Processing invitation..." : mode === "register" ? "Register and accept invitation" : "Sign in and accept invitation"}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">Your invitation email must match the email address on the account. HR Manager access remains pending until a Company Admin approves it.</p>
      <p className="mt-3 text-sm text-slate-600"><Link href="/signin" className="font-medium text-indigo-600 hover:underline">Go to sign in</Link></p>
    </div>
  );
}

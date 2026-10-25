
"use client";

import { useState } from "react";

type CopyInvitationLinkProps = {
  token: string;
};

export default function CopyInvitationLink({
  token,
}: CopyInvitationLinkProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleCopy() {
    setCopied(false);
    setError("");

    if (!token) {
      setError("Invitation token is missing.");
      return;
    }

    // Match this path to your actual invitation acceptance route.
    const invitationUrl = new URL(
      `/invite/accept?token=${encodeURIComponent(token)}`,
      window.location.origin
    ).toString();

    try {
      await navigator.clipboard.writeText(invitationUrl);
      setCopied(true);

      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy the link. Check browser clipboard permissions.");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300
          bg-white px-3 py-2 text-sm font-medium text-slate-700
          hover:bg-slate-50 focus:outline-none focus:ring-2
          focus:ring-blue-500 focus:ring-offset-2"
      >
        {copied ? (
          <>
            <span aria-hidden="true">✓</span>
            Copied!
          </>
        ) : (
          <>
            <span aria-hidden="true">⧉</span>
            Copy invitation link
          </>
        )}
      </button>

      {copied && (
        <p role="status" className="text-sm text-green-700">
          Invitation link copied to clipboard.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

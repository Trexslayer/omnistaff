
"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100"
    >
      Sign out
    </button>
  );
}

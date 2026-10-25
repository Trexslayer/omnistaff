
"use client";

import { signOut } from "next-auth/react";
import React from "react";

export default function SignOutButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      className={
        className ??
        "rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100"
      }
    >
      {children ?? "Sign out"}
    </button>
  );
}

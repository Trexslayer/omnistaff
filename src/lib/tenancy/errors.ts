import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/tenancy/context";
export function handleRouteError(error: unknown) {
  if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
  if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

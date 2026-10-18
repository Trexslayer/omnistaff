
import { NextResponse } from "next/server";
import { z } from "zod";
import argon2 from "argon2";

import { prisma } from "@/lib/db/prisma";

const schema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3).max(60),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().trim().email().max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid registration details.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    // Hash before opening the database transaction.
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const result = await prisma.$transaction(async (tx) => {
      // Never attach a new company to an existing account based
      // only on the email supplied by the requester.
      const existingUser = await tx.user.findUnique({
        where: { email: input.adminEmail },
        select: { id: true },
      }
    );

      if (existingUser) {
        throw new RegistrationConflictError();
      }

      const user = await tx.user.create({
        data: {
          name: input.adminName,
          email: input.adminEmail,
          passwordHash,
          // emailVerified deliberately remains null.
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: input.companyName,
          slug: input.slug,
          status: "PENDING_VERIFICATION",
        },
      });

      await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "COMPANY_ADMIN",
          status: "ACTIVE",
        },
      });

      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          actorUserId: user.id,
          action: "TENANT_REGISTRATION_SUBMITTED",
          entityType: "Tenant",
          entityId: tenant.id,
        },
      });

      return {
        tenantId: tenant.id,
        status: tenant.status,
      };
    },
    {
      maxWait: 10000,
      timeout: 20000,
    }
  );

    return NextResponse.json(
      {
        ...result,
        message:
          "Registration received. Complete email verification and wait for company approval.",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof RegistrationConflictError) {
      return NextResponse.json(
        {
          error:
            "Unable to complete registration with these details. Try signing in or use a different email address.",
        },
        { status: 409 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Unable to complete registration with these details." },
        { status: 409 }
      );
    }

    console.error("Company registration failed", error);

    return NextResponse.json(
      { error: "Could not submit registration." },
      { status: 500 }
    );
  }
}

class RegistrationConflictError extends Error {
  constructor() {
    super("Registration conflict");
  }
}

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const schema = z.object({
    token: z.string().min(32).max(256),
    password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
    const parsed = schema.safeParse(
        await request.json().catch(() => null),
    );

    if (!parsed.success) {
        return NextResponse.json(
            { error: "A valid invitation token and password of 12–128 characters are required." },
            { status: 400 },
        );
    }

    const { token, password } = parsed.data;
    const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

    try {
        const invitation = await prisma.employeeInvitation.findUnique({
            where: { tokenHash },
            include: { tenant: true },
        });

        if (!invitation) {
            return NextResponse.json(
                { error: "Invitation not found." },
                { status: 404 },
            );
        }

        if (invitation.status !== "PENDING") {
            return NextResponse.json(
                { error: "This invitation has already been used or revoked." },
                { status: 409 },
            );
        }

        if (invitation.expiresAt <= new Date()) {
            await prisma.employeeInvitation.updateMany({
                where: {
                    id: invitation.id,
                    status: "PENDING",
                    expiresAt: { lte: new Date() },
                },
                data: { status: "EXPIRED" },
            });

            return NextResponse.json(
                { error: "This invitation has expired." },
                { status: 410 },
            );
        }

        if (invitation.tenant.status !== "ACTIVE") {
            return NextResponse.json(
                { error: "This company is not active." },
                { status: 403 },
            );
        }

        const email = invitation.email.trim().toLowerCase();

        const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            return NextResponse.json(
                {
                    error: "An account already exists for this email. Sign in to accept the invitation.",
                },
                { status: 409 },
            );
        }

        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
        });

        const user = await prisma.user.create({
            data: {
                name: `${invitation.firstName} ${invitation.lastName}`,
                email,
                passwordHash,
                // Do not mark email as verified automatically.
            },
            select: { id: true },
        });

        return NextResponse.json(
            {
                message: "Account created. Sign in to accept your invitation.",
                data: { userId: user.id, email },
            },
            { status: 201 },
        );
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "P2002"
        ) {
            return NextResponse.json(
                {
                    error: "An account already exists for this email. Sign in to accept the invitation.",
                },
                { status: 409 },
            );
        }

        console.error("Employee registration error:", error);

        return NextResponse.json(
            { error: "Could not create the employee account." },
            { status: 500 },
        );
    }
}
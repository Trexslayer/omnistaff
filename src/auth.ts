
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import argon2 from "argon2";

import { prisma } from "@/lib/db/prisma";
import {
  checkLockout,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from "@/lib/auth/login-limiter";

export class CustomCredentialsSignin extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

// Session expiration: default 8 hours (28,800 seconds), configurable via SESSION_MAX_AGE
const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 8;
const SESSION_UPDATE_AGE = Number(process.env.SESSION_UPDATE_AGE) || 60 * 15; // 15 minutes

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Retain the adapter for users and other Auth.js data.
  adapter: PrismaAdapter(prisma),

  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const password = parsed.data.password;

        // 1. Check if email/account is currently locked out
        const lockoutStatus = await checkLockout(email);
        if (lockoutStatus.isLocked) {
          throw new CustomCredentialsSignin(`locked_out:${lockoutStatus.remainingSeconds}`);
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // A missing hash or missing user account counts as a failed attempt to avoid timing/enumeration leaks
        if (!user?.passwordHash) {
          const failStatus = await recordFailedAttempt(email);
          if (failStatus.isLocked) {
            throw new CustomCredentialsSignin(`locked_out:${failStatus.remainingSeconds}`);
          }
          throw new CustomCredentialsSignin(`attempts_remaining:${failStatus.remainingAttempts}`);
        }

        const valid = await argon2.verify(
          user.passwordHash,
          password
        );

        if (!valid) {
          const failStatus = await recordFailedAttempt(email);
          if (failStatus.isLocked) {
            throw new CustomCredentialsSignin(`locked_out:${failStatus.remainingSeconds}`);
          }
          throw new CustomCredentialsSignin(`attempts_remaining:${failStatus.remainingAttempts}`);
        }

        // Authentication succeeded: clear failed attempts and reset lockout
        await recordSuccessfulLogin(user.id, email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],

  // Credentials authentication requires JWT sessions in Auth.js.
  // Explicit session expiration configuration.
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
    updateAge: SESSION_UPDATE_AGE,
  },

  jwt: {
    maxAge: SESSION_MAX_AGE,
  },

  pages: {
    signIn: "/signin",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },

  trustHost: true,
});

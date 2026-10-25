import { prisma } from "@/lib/db/prisma";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_SECONDS = 3 * 60; // 3 minutes
export const LOCKOUT_DURATION_MS = LOCKOUT_DURATION_SECONDS * 1000;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // Reset attempts after 15 minutes of inactivity

type MemoryRecord = {
  attempts: number;
  lockoutUntil: number | null;
  lastAttemptAt: number;
};

// In-memory fallback map to handle unknown emails and quick in-process rate checks
const memoryStore = new Map<string, MemoryRecord>();

function getMemoryRecord(key: string): MemoryRecord {
  const existing = memoryStore.get(key);
  const now = Date.now();
  if (!existing) {
    const record: MemoryRecord = { attempts: 0, lockoutUntil: null, lastAttemptAt: now };
    memoryStore.set(key, record);
    return record;
  }
  // If lockout expired, reset
  if (existing.lockoutUntil && existing.lockoutUntil <= now) {
    existing.attempts = 0;
    existing.lockoutUntil = null;
  } else if (!existing.lockoutUntil && now - existing.lastAttemptAt > ATTEMPT_WINDOW_MS) {
    // Inactivity reset
    existing.attempts = 0;
  }
  return existing;
}

export type LockoutCheckResult = {
  isLocked: boolean;
  remainingSeconds: number;
  attempts: number;
  remainingAttempts: number;
};

/**
 * Checks whether an email is currently locked out from logging in.
 */
export async function checkLockout(email: string): Promise<LockoutCheckResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  // 1. Check in-memory state first
  const mem = getMemoryRecord(normalizedEmail);
  if (mem.lockoutUntil && mem.lockoutUntil > now) {
    const remainingSeconds = Math.max(1, Math.ceil((mem.lockoutUntil - now) / 1000));
    return {
      isLocked: true,
      remainingSeconds,
      attempts: mem.attempts,
      remainingAttempts: 0,
    };
  }

  // 2. Check DB user record
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        failedLoginAttempts: true,
        lockoutUntil: true,
        lastFailedLoginAt: true,
      },
    });

    if (!user) {
      return {
        isLocked: false,
        remainingSeconds: 0,
        attempts: mem.attempts,
        remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - mem.attempts),
      };
    }

    if (user.lockoutUntil) {
      const lockTime = user.lockoutUntil.getTime();
      if (lockTime > now) {
        const remainingSeconds = Math.max(1, Math.ceil((lockTime - now) / 1000));
        // Keep in-memory store in sync
        mem.lockoutUntil = lockTime;
        mem.attempts = user.failedLoginAttempts;
        return {
          isLocked: true,
          remainingSeconds,
          attempts: user.failedLoginAttempts,
          remainingAttempts: 0,
        };
      } else {
        // Lockout expired - clear it from DB and in-memory
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lockoutUntil: null,
            failedLoginAttempts: 0,
          },
        });
        mem.lockoutUntil = null;
        mem.attempts = 0;
        return {
          isLocked: false,
          remainingSeconds: 0,
          attempts: 0,
          remainingAttempts: MAX_LOGIN_ATTEMPTS,
        };
      }
    }

    // Check if previous failed attempts should be reset due to inactivity
    if (
      user.failedLoginAttempts > 0 &&
      user.lastFailedLoginAt &&
      now - user.lastFailedLoginAt.getTime() > ATTEMPT_WINDOW_MS
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0 },
      });
      mem.attempts = 0;
      return {
        isLocked: false,
        remainingSeconds: 0,
        attempts: 0,
        remainingAttempts: MAX_LOGIN_ATTEMPTS,
      };
    }

    const attempts = Math.max(mem.attempts, user.failedLoginAttempts);
    return {
      isLocked: false,
      remainingSeconds: 0,
      attempts,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts),
    };
  } catch (err) {
    console.error("Error checking lockout status:", err);
    // In case of DB query error, fall back safely to in-memory state
    return {
      isLocked: mem.lockoutUntil ? mem.lockoutUntil > now : false,
      remainingSeconds: mem.lockoutUntil ? Math.max(1, Math.ceil((mem.lockoutUntil - now) / 1000)) : 0,
      attempts: mem.attempts,
      remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - mem.attempts),
    };
  }
}

/**
 * Records a failed login attempt for the specified email.
 * If failed attempts exceed MAX_LOGIN_ATTEMPTS, locks out the user for 3 minutes.
 */
export async function recordFailedAttempt(email: string): Promise<LockoutCheckResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  // Update in-memory record
  const mem = getMemoryRecord(normalizedEmail);
  mem.attempts += 1;
  mem.lastAttemptAt = now;

  let isLocked = false;
  let remainingSeconds = 0;
  let attempts = mem.attempts;

  if (mem.attempts >= MAX_LOGIN_ATTEMPTS) {
    isLocked = true;
    remainingSeconds = LOCKOUT_DURATION_SECONDS;
    mem.lockoutUntil = now + LOCKOUT_DURATION_MS;
  }

  // Update database record if user exists
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, failedLoginAttempts: true, lastFailedLoginAt: true },
    });

    if (user) {
      let currentAttempts = (user.failedLoginAttempts || 0) + 1;
      // If inactive for a long time, treat as attempt 1
      if (
        user.lastFailedLoginAt &&
        now - user.lastFailedLoginAt.getTime() > ATTEMPT_WINDOW_MS &&
        user.failedLoginAttempts < MAX_LOGIN_ATTEMPTS
      ) {
        currentAttempts = 1;
      }

      attempts = currentAttempts;
      const willLock = currentAttempts >= MAX_LOGIN_ATTEMPTS;
      const lockoutDate = willLock ? new Date(now + LOCKOUT_DURATION_MS) : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: currentAttempts,
          lastFailedLoginAt: new Date(now),
          lockoutUntil: lockoutDate,
        },
      });

      if (willLock) {
        isLocked = true;
        remainingSeconds = LOCKOUT_DURATION_SECONDS;
        mem.lockoutUntil = now + LOCKOUT_DURATION_MS;
      }
    }
  } catch (err) {
    console.error("Error updating failed login attempts in DB:", err);
  }

  return {
    isLocked,
    remainingSeconds,
    attempts,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - attempts),
  };
}

/**
 * Resets failed login attempts and lockout state upon successful authentication.
 */
export async function recordSuccessfulLogin(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Clear in-memory record
  memoryStore.delete(normalizedEmail);

  // Clear database record
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastFailedLoginAt: null,
      },
    });
  } catch (err) {
    console.error("Error resetting failed login attempts in DB:", err);
  }
}

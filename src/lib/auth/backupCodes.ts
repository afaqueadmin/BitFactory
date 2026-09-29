import { randomInt, timingSafeEqual } from "node:crypto";
import { compare, hash } from "bcrypt";
import { prisma } from "@/lib/prisma";

/**
 * 2FA backup codes (H-2). Generated with a CSPRNG, stored only as bcrypt
 * hashes, shown to the user once in plaintext at generation time.
 *
 * Rows written before H-2 hold plaintext codes; those still verify (compared
 * in constant time) until scripts hash them in place, so deploying this code
 * and hashing existing rows can happen in either order.
 *
 * Node runtime only (Prisma + bcrypt).
 */

// No 0/O or 1/I, so codes read back off paper unambiguously.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
const HASH_ROUNDS = 10;
const MAX_INPUT_LENGTH = 32;

export const BACKUP_CODE_COUNT = 10;

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  return Array.from({ length: count }, () =>
    Array.from(
      { length: CODE_LENGTH },
      () => ALPHABET[randomInt(ALPHABET.length)],
    ).join(""),
  );
}

export function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hash(code, HASH_ROUNDS)));
}

export function isHashedBackupCode(stored: string): boolean {
  return stored.startsWith("$2");
}

/** Case- and separator-insensitive, so "abcd-efgh 12" matches "ABCDEFGH12". */
export function normalizeBackupCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

async function storedMatches(stored: string, code: string): Promise<boolean> {
  if (isHashedBackupCode(stored)) return compare(code, stored);
  const a = Buffer.from(stored);
  const b = Buffer.from(code);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * If `input` is one of the user's unused backup codes, removes it and returns
 * true. The removal is a single conditional UPDATE, so two concurrent requests
 * presenting the same code can't both succeed.
 *
 * `storedCodes` is the user's current TwoFactorAuth.backupCodes.
 */
export async function consumeBackupCode(
  userId: string,
  storedCodes: string[] | null | undefined,
  input: string,
): Promise<boolean> {
  if (!storedCodes?.length || input.length > MAX_INPUT_LENGTH) return false;
  const code = normalizeBackupCode(input);
  if (!code) return false;

  let match: string | undefined;
  for (const stored of storedCodes) {
    if (await storedMatches(stored, code)) {
      match = stored;
      break;
    }
  }
  if (!match) return false;

  const removed = await prisma.$executeRaw`
    UPDATE two_factor_auth
    SET "backupCodes" = array_remove("backupCodes", ${match}),
        "lastUsedAt" = now(),
        "updatedAt" = now()
    WHERE "userId" = ${userId} AND ${match} = ANY("backupCodes")`;
  return removed === 1;
}

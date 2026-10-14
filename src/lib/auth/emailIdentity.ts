import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * One rule for "which account does this email identify" (M-4):
 * case-insensitive, surrounding whitespace ignored, dots significant.
 *
 * Every path that stores User.email stores canonicalEmail(input), and every
 * lookup matches canonicalEmail(input) exactly. Exact matching is deliberate:
 * it avoids depending on how Prisma's `mode: "insensitive"` is compiled
 * (ILIKE on Postgres, where `_`/`%` in the input could act as wildcards).
 *
 * Backed at the DB level by a unique index on lower(email).
 */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True if any account - soft-deleted ones included, since a deleted account
 * keeps its email and the unique index still covers it - already has this
 * email, as its primary email or as a secondary login. `excludeUserId` skips
 * the account being edited.
 */
export async function isEmailTaken(
  email: string,
  excludeUserId?: string,
): Promise<boolean> {
  const canonical = canonicalEmail(email);
  const notThisAccount = excludeUserId ? { NOT: { id: excludeUserId } } : {};
  const [account, login] = await Promise.all([
    prisma.user.findFirst({
      where: { email: canonical, ...notThisAccount },
      select: { id: true },
    }),
    prisma.userLogin.findFirst({
      where: {
        email: canonical,
        // Only that account's primary - moving its primary email onto its
        // own secondary login's address is still a clash.
        ...(excludeUserId
          ? { NOT: { userId: excludeUserId, isPrimary: true } }
          : {}),
      },
      select: { id: true },
    }),
  ]);
  return !!account || !!login;
}

/**
 * True if `error` is a unique-constraint violation on the email column -
 * the race the isEmailTaken pre-check can't close on its own (two requests
 * both pass the check, then both write).
 */
export function isEmailUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return false;
  }
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target);
  return fields.includes("email");
}

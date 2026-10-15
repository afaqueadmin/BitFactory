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
 * A soft-deleted account keeps its email (and the unique indexes keep
 * covering it). It can be given up so the address can be added as another
 * account's second sign-in email - the only place that's allowed. Its primary
 * email then becomes `<email>#released-<id>`, which also blocks a restore
 * until a super admin sets a new email.
 */
const RELEASED_MARKER = "#released-";

export function releasedEmail(email: string, userId: string): string {
  return `${email}${RELEASED_MARKER}${userId.slice(-6)}`;
}

export function isReleasedEmail(email: string): boolean {
  return email.includes(RELEASED_MARKER);
}

export interface DeletedEmailHolder {
  userId: string;
  name: string | null;
  /** Null when the email is only on users.email with no login row. */
  loginId: string | null;
  isPrimary: boolean;
}

/**
 * The deleted account holding this email, or null when the email is free or
 * any live account holds it (then the normal "already in use" rule applies).
 */
export async function findDeletedHolder(
  email: string,
): Promise<DeletedEmailHolder | null> {
  const canonical = canonicalEmail(email);
  const [account, login] = await Promise.all([
    prisma.user.findFirst({
      where: { email: canonical },
      select: { id: true, name: true, isDeleted: true },
    }),
    prisma.userLogin.findFirst({
      where: { email: canonical },
      select: {
        id: true,
        isPrimary: true,
        user: { select: { id: true, name: true, isDeleted: true } },
      },
    }),
  ]);

  if (!account && !login) return null;
  if (account && !account.isDeleted) return null;
  if (login && !login.user.isDeleted) return null;
  // Both rows are the same deleted account's primary email in practice; if
  // they somehow belong to two accounts, leave it to the "in use" rule.
  if (account && login && account.id !== login.user.id) return null;

  const owner = login?.user ?? account!;
  return {
    userId: owner.id,
    name: owner.name,
    loginId: login?.id ?? null,
    isPrimary: login ? login.isPrimary : true,
  };
}

/**
 * Frees the email of a deleted account (see findDeletedHolder): a primary
 * email is renamed to its released form, a second sign-in email is removed
 * (its 2FA and passkeys go with it).
 */
export async function releaseEmailFromDeletedAccount(
  tx: Prisma.TransactionClient,
  holder: DeletedEmailHolder,
  email: string,
  { actorId, toUserId }: { actorId: string; toUserId: string },
): Promise<void> {
  const canonical = canonicalEmail(email);
  if (holder.isPrimary) {
    const placeholder = releasedEmail(canonical, holder.userId);
    await tx.user.update({
      where: { id: holder.userId },
      data: { email: placeholder },
    });
    await tx.userLogin.updateMany({
      where: { userId: holder.userId, isPrimary: true },
      data: { email: placeholder },
    });
  } else if (holder.loginId) {
    await tx.userLogin.delete({ where: { id: holder.loginId } });
  }

  await tx.auditLog.create({
    data: {
      action: "USER_UPDATED",
      entityType: "User",
      entityId: holder.userId,
      userId: actorId,
      description: `Email ${canonical} released from deleted account ${
        holder.name || holder.userId
      }`,
      changes: JSON.stringify({
        emailReleased: canonical,
        wasPrimary: holder.isPrimary,
        releasedTo: toUserId,
      }),
    },
  });
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

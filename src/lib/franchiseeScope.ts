/**
 * Scoping helpers for the FRANCHISEE role.
 *
 * A FRANCHISEE user owns exactly one Franchise record (Franchise.franchiseeId
 * -> User.id). A CLIENT user optionally belongs to a franchise via
 * User.franchiseeId -> Franchise.id (null = direct BitFactory customer).
 *
 * Because of this indirection, "give me this franchisee's customers" cannot
 * compare User.franchiseeId to the franchisee's own user id directly — it
 * has to go through the Franchise relation.
 */

import { prisma } from "@/lib/prisma";

interface ScopedUser {
  id: string;
  role: string;
}

/** Spread into a `prisma.user.findMany({ where: {...} })` clause. */
export function franchiseeUserFilter(currentUser: ScopedUser) {
  return currentUser.role === "FRANCHISEE"
    ? { franchisee: { franchiseeId: currentUser.id } }
    : {};
}

/** Spread into a `prisma.miner.findMany({ where: {...} })` clause. */
export function franchiseeMinerFilter(currentUser: ScopedUser) {
  return currentUser.role === "FRANCHISEE"
    ? { user: { franchisee: { franchiseeId: currentUser.id } } }
    : {};
}

/** Returns the Franchise record owned by this FRANCHISEE user, or null. */
export async function getOwnFranchise(franchiseeUserId: string) {
  return prisma.franchise.findFirst({
    where: { franchiseeId: franchiseeUserId, deletedAt: null },
  });
}

/** True if `customerId` is a CLIENT user attached to this franchisee's franchise. */
export async function assertFranchiseeOwnsCustomer(
  franchiseeUserId: string,
  customerId: string,
): Promise<boolean> {
  const owned = await prisma.user.findFirst({
    where: {
      id: customerId,
      franchisee: { franchiseeId: franchiseeUserId },
    },
    select: { id: true },
  });
  return !!owned;
}

/** True if `minerId` belongs to a customer attached to this franchisee's franchise. */
export async function assertFranchiseeOwnsMiner(
  franchiseeUserId: string,
  minerId: string,
): Promise<boolean> {
  const owned = await prisma.miner.findFirst({
    where: {
      id: minerId,
      user: { franchisee: { franchiseeId: franchiseeUserId } },
    },
    select: { id: true },
  });
  return !!owned;
}

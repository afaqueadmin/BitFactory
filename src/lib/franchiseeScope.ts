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

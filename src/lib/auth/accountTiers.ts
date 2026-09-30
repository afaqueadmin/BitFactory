/**
 * Which staff role may act on which account: reset its password, sign it
 * out everywhere, delete it. One rule for every such route (N-8).
 *
 *   ADMIN       → CLIENT, FRANCHISEE
 *   SUPER_ADMIN → CLIENT, FRANCHISEE, ADMIN (not another SUPER_ADMIN)
 *
 * Nobody else manages other accounts through these routes.
 */
export function canManageAccount(
  actorRole: string,
  targetRole: string,
): boolean {
  if (actorRole === "SUPER_ADMIN") return targetRole !== "SUPER_ADMIN";
  if (actorRole === "ADMIN") {
    return targetRole === "CLIENT" || targetRole === "FRANCHISEE";
  }
  return false;
}

/**
 * Which staff role may act on which account: reset its password, sign it
 * out everywhere, delete it. One rule for every such route (N-8).
 *
 *   ADMIN       → CLIENT, FRANCHISEE, SIMULATED
 *   ACCOUNTING  → CLIENT, FRANCHISEE, SIMULATED (a peer of ADMIN)
 *   SUPER_ADMIN → CLIENT, FRANCHISEE, SIMULATED, ADMIN, ACCOUNTING
 *                 (not another SUPER_ADMIN)
 *
 * Nobody else manages other accounts through these routes.
 */
export function canManageAccount(
  actorRole: string,
  targetRole: string,
): boolean {
  if (actorRole === "SUPER_ADMIN") return targetRole !== "SUPER_ADMIN";
  if (actorRole === "ADMIN" || actorRole === "ACCOUNTING") {
    return (
      targetRole === "CLIENT" ||
      targetRole === "FRANCHISEE" ||
      targetRole === "SIMULATED"
    );
  }
  return false;
}

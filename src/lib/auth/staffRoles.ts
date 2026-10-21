/**
 * Staff roles: the accounts that use the admin panel. ACCOUNTING has the same
 * privileges as ADMIN; SUPER_ADMIN-only rules are checked separately.
 * Safe for the edge runtime (no imports).
 */
export const STAFF_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "ACCOUNTING",
]);

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role);
}

/** How a staff actor is named in audit and activity entries. */
export function staffActorLabel(
  role: string,
): "super admin" | "admin" | "accounting" {
  if (role === "SUPER_ADMIN") return "super admin";
  if (role === "ACCOUNTING") return "accounting";
  return "admin";
}

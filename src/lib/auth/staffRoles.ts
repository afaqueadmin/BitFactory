/**
 * Staff roles: the accounts that use the admin panel. What each may do comes
 * from its permissions (src/lib/auth/permissions.ts): ACCOUNTING has the same
 * as ADMIN, STAFF only what its custom roles grant.
 * Safe for the edge runtime (no imports).
 */
export const STAFF_ROLES: ReadonlySet<string> = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "ACCOUNTING",
  "STAFF",
]);

export function isStaffRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES.has(role);
}

/** How a staff actor is named in audit and activity entries. */
export function staffActorLabel(
  role: string,
): "super admin" | "admin" | "accounting" | "staff" {
  if (role === "SUPER_ADMIN") return "super admin";
  if (role === "ACCOUNTING") return "accounting";
  if (role === "STAFF") return "staff";
  return "admin";
}

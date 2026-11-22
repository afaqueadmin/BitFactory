import type { Permission } from "@/lib/auth/permissions";

/**
 * For hiding UI only: whether the signed-in user (from useUser, which carries
 * their permissions) has the permission. The API checks again on every call.
 */
export function can(
  user: { permissions?: string[] } | null | undefined,
  permission: Permission,
): boolean {
  return !!user?.permissions?.includes(permission);
}

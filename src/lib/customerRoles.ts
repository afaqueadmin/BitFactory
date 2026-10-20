/**
 * The end-customer side of the app: a CLIENT, or a simulated (SIMULATED) account.
 * Both see only their own records - never internal ticket notes, priority or
 * other customers' data. Dependency-free so client components can use it.
 */
export function isCustomerRole(role: string | null | undefined): boolean {
  return role === "CLIENT" || role === "SIMULATED";
}

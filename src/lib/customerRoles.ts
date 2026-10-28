/**
 * The end-customer side of the app: a CLIENT, a simulated (SIMULATED)
 * account, or a guild account (GUILDMASTER / GUILDMEMBER). All see only their
 * own records - never internal ticket notes, priority or other customers'
 * data. Dependency-free so client components and the edge proxy can use it.
 */
export function isCustomerRole(role: string | null | undefined): boolean {
  return (
    role === "CLIENT" ||
    role === "SIMULATED" ||
    role === "GUILDMASTER" ||
    role === "GUILDMEMBER"
  );
}

/** Guildmaster or Guildmember. */
export function isGuildRole(role: string | null | undefined): boolean {
  return role === "GUILDMASTER" || role === "GUILDMEMBER";
}

/**
 * A view-only account: a Guildmember sees the whole guild but can't change
 * anything except their own login security (password, 2FA, secondary login).
 */
export function isReadOnlyRole(role: string | null | undefined): boolean {
  return role === "GUILDMEMBER";
}

/**
 * Accounts treated as a client for their own mining: the CLIENT page set and
 * client APIs. A Guildmaster is one (the guild's miners sit on their account).
 */
export function actsAsClient(role: string | null | undefined): boolean {
  return role === "CLIENT" || role === "GUILDMASTER";
}

/**
 * Roles billed as customers (hosting invoices, statements, balances): a
 * CLIENT, and a Guildmaster for their guild. Spread into a Prisma
 * `role: { in: ... }` filter.
 */
export const BILLED_CUSTOMER_ROLES: ("CLIENT" | "GUILDMASTER")[] = [
  "CLIENT",
  "GUILDMASTER",
];

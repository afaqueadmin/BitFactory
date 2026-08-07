export type PaybackAccountType = "CLIENT" | "SELF_MINING";

/**
 * Single source of truth for whether an account should see CLIENT or
 * COMPANY payback data. Driven entirely by the User.segment DB field —
 * never by comparing the account's name/email — so it stays correct for
 * any account tagged SELF_MINING (e.g. "Higgs Self Mining"), not just one
 * hardcoded name.
 */
export const resolvePaybackAccountType = (
  segment: string | null | undefined,
): PaybackAccountType => (segment === "SELF_MINING" ? "SELF_MINING" : "CLIENT");

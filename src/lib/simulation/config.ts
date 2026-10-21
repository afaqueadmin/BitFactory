/**
 * Constants for simulated accounts. The admin-managed settings (mirrored
 * miner, welcome bonus, rate, display name) live in ./settings.
 */

/**
 * Ends the audit-log description written when an admin turns a customer
 * into a simulated account; getSimContext looks for it to start the simulation
 * at the conversion instead of the original registration.
 */
export const SIM_CONVERSION_NOTE = "converted to a simulated account";
/** The same note as written before the "demo" -> "simulated" rename. */
export const SIM_CONVERSION_NOTE_LEGACY = "converted to a demo account";

/**
 * Ends the audit-log description written when someone signs up again with
 * an inactive simulated account's email; the simulation restarts from it.
 */
export const SIM_REREGISTER_NOTE = "re-registered as a simulated account";

/** Shown wherever a real subaccount name would appear. */
export const SIM_SUBACCOUNT_NAME = "Simulation";

/**
 * The simulated invoice's id (see ./invoice); any other id is a real one.
 * Here so client components can tell it apart without the server code.
 */
export const SIM_INVOICE_ID = "sim-hardware-invoice";

/** Narration on the ledger row that starts every simulated account. */
export const SIM_WELCOME_BONUS_NARRATION = "Welcome bonus";

export function isSimulatedRole(role: string | null | undefined): boolean {
  return role === "SIMULATED";
}

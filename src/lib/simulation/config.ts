/**
 * Settings for simulated accounts. All code-based: nothing about the
 * simulation is stored in the database.
 *
 *   SIM_DEMO_MINER_ID    the one real miner every simulated account mirrors
 *   SIM_BONUS_USD        welcome bonus each simulated account starts with
 *   SIM_DEMO_MINER_NAME  name the simulated miner is shown under (the real one
 *                        can identify its owner)
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

export function simDemoMinerId(): string | null {
  return process.env.SIM_DEMO_MINER_ID?.trim() || null;
}

export function simBonusUsd(): number {
  const value = Number(process.env.SIM_BONUS_USD);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function simDemoMinerName(): string {
  return process.env.SIM_DEMO_MINER_NAME?.trim() || "Simulated Miner";
}

export function isSimulatedRole(role: string | null | undefined): boolean {
  return role === "SIMULATED";
}

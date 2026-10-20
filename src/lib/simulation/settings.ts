/**
 * Admin-managed settings for simulated accounts (simulation_settings, one
 * row), edited on the Simulated Accounts page. Until that row exists the old
 * env vars still apply - SIM_DEMO_MINER_ID, SIM_BONUS_USD and
 * SIM_DEMO_MINER_NAME - with the mirrored miner's own latest rate.
 */

import { prisma } from "@/lib/prisma";

export const SIM_SETTINGS_ID = 1;
export const DEFAULT_SIM_DISPLAY_NAME = "Simulated Miner";

export interface SimSettings {
  sourceMinerId: string;
  displayName: string;
  welcomeBonusUsd: number;
  /** Null only on the env fallback: use the mirrored miner's own rate. */
  ratePerKwh: number | null;
  /** False when read from the env vars rather than the settings row. */
  stored: boolean;
}

function envSettings(): SimSettings | null {
  const sourceMinerId = process.env.SIM_DEMO_MINER_ID?.trim();
  if (!sourceMinerId) return null;
  const bonus = Number(process.env.SIM_BONUS_USD);
  return {
    sourceMinerId,
    displayName:
      process.env.SIM_DEMO_MINER_NAME?.trim() || DEFAULT_SIM_DISPLAY_NAME,
    welcomeBonusUsd: Number.isFinite(bonus) && bonus > 0 ? bonus : 0,
    ratePerKwh: null,
    stored: false,
  };
}

/** The welcome bonus a simulated account starting now gets. */
export async function currentWelcomeBonusUsd(): Promise<number> {
  return (await getSimSettings())?.welcomeBonusUsd ?? 0;
}

/** The current settings, or null when simulation isn't configured at all. */
export async function getSimSettings(): Promise<SimSettings | null> {
  const row = await prisma.simulationSettings.findUnique({
    where: { id: SIM_SETTINGS_ID },
  });
  if (!row) return envSettings();
  return {
    sourceMinerId: row.sourceMinerId,
    displayName: row.displayName,
    welcomeBonusUsd: Number(row.welcomeBonusUsd),
    ratePerKwh: Number(row.ratePerKwh),
    stored: true,
  };
}

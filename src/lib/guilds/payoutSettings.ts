/** GuildPayoutSettings: one row (id = 1), created with defaults on first read. */

import type { GuildPayoutMethod, GuildPayoutSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DUST_SATS } from "./distribution";
import { isMultisigEnabled } from "./multisig/network";

export async function getPayoutSettings() {
  return prisma.guildPayoutSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

/** The settings for the browser: key A's ciphertext never leaves the server. */
export function publicPayoutSettings(
  settings: GuildPayoutSettings,
): Omit<GuildPayoutSettings, "appKeyEncrypted"> {
  const copy: Partial<GuildPayoutSettings> = { ...settings };
  delete copy.appKeyEncrypted;
  return copy as Omit<GuildPayoutSettings, "appKeyEncrypted">;
}

/** How a guild is paid: its own setting, else the default. */
export function effectivePayoutMethod(
  guild: { payoutMethod: GuildPayoutMethod | null },
  settings: { defaultPayoutMethod: GuildPayoutMethod },
): GuildPayoutMethod {
  return guild.payoutMethod ?? settings.defaultPayoutMethod;
}

/**
 * Methods that can send here. Multisig only where it's switched on
 * (GUILD_MULTISIG_ENABLED), so production stays manual until then.
 */
export function availablePayoutMethods(): GuildPayoutMethod[] {
  return isMultisigEnabled() ? ["MANUAL", "MULTISIG_BTC"] : ["MANUAL"];
}

/** The lowest minimum payout allowed: nothing below the dust limit. */
export const MIN_PAYOUT_FLOOR_SATS = DUST_SATS;

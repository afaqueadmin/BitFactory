/** GuildPayoutSettings: one row (id = 1), created with defaults on first read. */

import { GuildPayoutMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DUST_SATS } from "./distribution";

export async function getPayoutSettings() {
  return prisma.guildPayoutSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

/** How a guild is paid: its own setting, else the default. */
export function effectivePayoutMethod(
  guild: { payoutMethod: GuildPayoutMethod | null },
  settings: { defaultPayoutMethod: GuildPayoutMethod },
): GuildPayoutMethod {
  return guild.payoutMethod ?? settings.defaultPayoutMethod;
}

/** Methods that can send today; the rest are coming in Phase 2b. */
export const AVAILABLE_PAYOUT_METHODS: GuildPayoutMethod[] = ["MANUAL"];

/** The lowest minimum payout allowed: nothing below the dust limit. */
export const MIN_PAYOUT_FLOOR_SATS = DUST_SATS;

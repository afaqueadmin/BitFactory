/**
 * /api/guilds/payout-settings - admin only. GET / PATCH the one row of
 * GuildPayoutSettings:
 *   { feePayer?, minPayoutSats?, minConfirmations?, companyWalletAddress? }
 * The payout method and auto-run stay locked to manual until multisig
 * payouts exist (Phase 2b).
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction, GuildFeePayer, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { GuildInputError, parseWalletAddress } from "@/lib/guilds/accounts";
import {
  availablePayoutMethods,
  MIN_PAYOUT_FLOOR_SATS,
  getPayoutSettings,
  publicPayoutSettings,
} from "@/lib/guilds/payoutSettings";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  try {
    const settings = publicPayoutSettings(await getPayoutSettings());
    return NextResponse.json({
      success: true,
      data: { ...settings, availableMethods: availablePayoutMethods() },
    });
  } catch (error) {
    console.error("[Guild Payout Settings API] GET error:", error);
    return jsonError("Failed to load payout settings", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const data: Prisma.GuildPayoutSettingsUpdateInput = {};

    if (body.feePayer !== undefined) {
      if (
        !Object.values(GuildFeePayer).includes(body.feePayer as GuildFeePayer)
      ) {
        throw new GuildInputError("Unknown fee payer");
      }
      data.feePayer = body.feePayer as GuildFeePayer;
    }
    if (body.minPayoutSats !== undefined) {
      const sats = Number(body.minPayoutSats);
      if (!Number.isInteger(sats) || sats < MIN_PAYOUT_FLOOR_SATS) {
        throw new GuildInputError(
          `Minimum payout must be a whole number of at least ${MIN_PAYOUT_FLOOR_SATS} sats`,
        );
      }
      data.minPayoutSats = sats;
    }
    if (body.minConfirmations !== undefined) {
      const n = Number(body.minConfirmations);
      if (!Number.isInteger(n) || n < 1 || n > 100) {
        throw new GuildInputError("Confirmations must be between 1 and 100");
      }
      data.minConfirmations = n;
    }
    if (body.companyWalletAddress !== undefined) {
      data.companyWalletAddress = parseWalletAddress(body.companyWalletAddress);
    }
    if (Object.keys(data).length === 0)
      throw new GuildInputError("Nothing to change");

    const before = await getPayoutSettings();
    const after = await prisma.guildPayoutSettings.update({
      where: { id: 1 },
      data: { ...data, updatedBy: { connect: { id: auth.decoded.userId } } },
    });
    await prisma.auditLog.create({
      data: {
        action: AuditAction.GUILD_PAYOUT_SETTINGS_UPDATED,
        entityType: "GuildPayoutSettings",
        entityId: "1",
        userId: auth.decoded.userId,
        description: "Guild payout settings updated",
        changes: JSON.stringify({
          before: {
            feePayer: before.feePayer,
            minPayoutSats: before.minPayoutSats,
            minConfirmations: before.minConfirmations,
            companyWalletAddress: before.companyWalletAddress,
          },
          after: data,
        }),
      },
    });
    const saved = publicPayoutSettings(after);
    return NextResponse.json({
      success: true,
      data: { ...saved, availableMethods: availablePayoutMethods() },
    });
  } catch (error) {
    if (error instanceof GuildInputError) return jsonError(error.message);
    console.error("[Guild Payout Settings API] PATCH error:", error);
    return jsonError("Failed to save payout settings", 500);
  }
}

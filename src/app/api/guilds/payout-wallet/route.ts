/**
 * /api/guilds/payout-wallet - admin only. The 2-of-3 multisig payout wallet.
 *
 * GET: its status - network, key A's public key, the saved descriptor and
 * its keys, whether a guild already uses it (then it's locked), approvers.
 *
 * POST (step-up re-authentication required):
 *   { action: "create-app-key" }
 *   { action: "save-descriptor", descriptor }
 *   { action: "set-approvers", userIds }
 *   { action: "set-max-fee", maxFeeRateSatVb }
 */

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { multisigErrorMessage } from "@/lib/guilds/multisig/routeErrors";
import {
  createAppKey,
  saveDescriptor,
  setApprovers,
  walletStatus,
} from "@/lib/guilds/multisig/wallet";
import { RECEIVE, deriveAddress } from "@/lib/guilds/multisig/descriptor";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  try {
    const status = await walletStatus();
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
      select: { id: true, name: true, email: true },
      orderBy: { email: "asc" },
    });
    return NextResponse.json({ success: true, data: { ...status, admins } });
  } catch (error) {
    console.error("[Guild Payout Wallet API] GET error:", error);
    return jsonError("Failed to load the payout wallet", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      descriptor?: unknown;
      userIds?: unknown;
      maxFeeRateSatVb?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    const actions = [
      "create-app-key",
      "save-descriptor",
      "set-approvers",
      "set-max-fee",
    ];
    if (!body.action || !actions.includes(body.action)) {
      return jsonError("Unknown action");
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      "change the guild payout wallet",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }
    const actorId = auth.decoded.userId;

    if (body.action === "create-app-key") {
      const key = await createAppKey(actorId);
      return NextResponse.json({ success: true, data: { appKey: key } });
    }
    if (body.action === "save-descriptor") {
      if (typeof body.descriptor !== "string" || !body.descriptor.trim()) {
        return jsonError("Paste the wallet descriptor");
      }
      const wallet = await saveDescriptor(body.descriptor, actorId);
      return NextResponse.json({
        success: true,
        data: {
          descriptor: wallet.descriptor,
          firstReceiveAddress: deriveAddress(wallet, RECEIVE, 0).address,
        },
      });
    }
    if (body.action === "set-approvers") {
      const ids = Array.isArray(body.userIds)
        ? body.userIds.filter((x): x is string => typeof x === "string")
        : [];
      await setApprovers(ids, actorId);
      return NextResponse.json({ success: true });
    }
    // set-max-fee
    const rate = Number(body.maxFeeRateSatVb);
    if (!Number.isInteger(rate) || rate < 1 || rate > 1000) {
      return jsonError(
        "The fee cap must be a whole number from 1 to 1000 sat/vB",
      );
    }
    await prisma.$transaction([
      prisma.guildPayoutSettings.update({
        where: { id: 1 },
        data: { maxFeeRateSatVb: rate, updatedById: actorId },
      }),
      prisma.auditLog.create({
        data: {
          action: AuditAction.GUILD_PAYOUT_SETTINGS_UPDATED,
          entityType: "GuildPayoutSettings",
          entityId: "1",
          userId: actorId,
          description: `Guild payout fee cap set to ${rate} sat/vB`,
          changes: JSON.stringify({ maxFeeRateSatVb: rate }),
        },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = multisigErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Payout Wallet API] POST error:", error);
    return jsonError("Failed to update the payout wallet", 500);
  }
}

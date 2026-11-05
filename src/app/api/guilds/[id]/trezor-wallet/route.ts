/**
 * /api/guilds/[id]/trezor-wallet - admins; changes need a named payout
 * approver. The guild's own account on the payout Trezor, and its wallet
 * seals.
 *
 * GET: what the browser needs - the next free account (to set the wallet
 *   up), and every wallet the guild's payouts can go to with whether it's
 *   sealed (and, if not, the message the Trezor signs).
 *
 * POST { action: "sync" } - checks the guild's account on the chain now:
 *   new coins, confirmations, and coins spent without a payout from the app.
 *   Reads only; no re-authentication.
 * POST (step-up re-authentication required):
 *   { action: "set-up", account, xpub, fingerprint, shownAddress, deviceLabel }
 *   { action: "seal", seals: [{ key, message, signature }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { trezorErrorMessage } from "@/lib/guilds/trezor/routeErrors";
import {
  nextGuildAccount,
  setUpGuildWallet,
} from "@/lib/guilds/trezor/guildWallet";
import { saveSeals, sealTargets } from "@/lib/guilds/trezor/seals";
import { syncGuildCoins } from "@/lib/guilds/trezor/coins";
import { isTrezorPayoutEnabled } from "@/lib/guilds/trezor/network";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  if (!ADMIN_ROLES.includes(auth.decoded.role)) {
    return jsonError("Admin access required", 403);
  }
  const { id } = await params;
  if (!isTrezorPayoutEnabled()) {
    return NextResponse.json({ success: true, data: { enabled: false } });
  }
  try {
    const guild = await prisma.guild.findUnique({
      where: { id },
      select: { trezorAccount: true },
    });
    if (!guild) return jsonError("Guild not found", 404);
    let next = null;
    let seals = null;
    let problem: string | null = null;
    try {
      if (guild.trezorAccount === null) next = await nextGuildAccount();
      seals = await sealTargets(id);
    } catch (error) {
      problem = trezorErrorMessage(error);
      if (!problem) throw error;
    }
    return NextResponse.json({
      success: true,
      data: { enabled: true, next, seals, problem },
    });
  } catch (error) {
    console.error("[Guild Trezor Wallet API] GET error:", error);
    return jsonError("Failed to load the guild's Trezor wallet", 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  if (!ADMIN_ROLES.includes(auth.decoded.role)) {
    return jsonError("Admin access required", 403);
  }
  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      account?: unknown;
      xpub?: unknown;
      fingerprint?: unknown;
      shownAddress?: unknown;
      deviceLabel?: unknown;
      seals?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    if (body.action === "sync") {
      return NextResponse.json({
        success: true,
        data: await syncGuildCoins(id),
      });
    }
    if (body.action !== "set-up" && body.action !== "seal") {
      return jsonError("Unknown action");
    }
    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      body.action === "seal"
        ? "seal guild payout wallets"
        : "set up a guild's Trezor wallet",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }
    const actorId = auth.decoded.userId;

    if (body.action === "set-up") {
      if (
        !Number.isInteger(body.account) ||
        typeof body.xpub !== "string" ||
        typeof body.fingerprint !== "string" ||
        typeof body.shownAddress !== "string"
      ) {
        return jsonError("The Trezor read is incomplete");
      }
      const data = await setUpGuildWallet({
        guildId: id,
        account: body.account as number,
        xpub: body.xpub,
        fingerprint: body.fingerprint.toLowerCase(),
        shownAddress: body.shownAddress,
        deviceLabel:
          typeof body.deviceLabel === "string" ? body.deviceLabel : "Trezor",
        actorId,
      });
      return NextResponse.json({ success: true, data });
    }

    const seals = Array.isArray(body.seals)
      ? body.seals.filter(
          (s): s is { key: string; message: string; signature: string } =>
            !!s &&
            typeof s === "object" &&
            typeof (s as { key?: unknown }).key === "string" &&
            typeof (s as { message?: unknown }).message === "string" &&
            typeof (s as { signature?: unknown }).signature === "string",
        )
      : [];
    const data = await saveSeals({ guildId: id, seals, actorId });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = trezorErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Trezor Wallet API] POST error:", error);
    return jsonError("Failed to update the guild's Trezor wallet", 500);
  }
}

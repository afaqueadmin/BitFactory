/**
 * POST /api/guilds/[id]/multisig - admin only, step-up re-authentication.
 * Switches the guild to multisig payouts: gives it its own receiving address
 * from the payout wallet (to set as its Luxor payout address) and its change
 * address. Only with no unsent distributions.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { multisigErrorMessage } from "@/lib/guilds/multisig/routeErrors";
import {
  assignGuildAddress,
  requireWallet,
} from "@/lib/guilds/multisig/wallet";
import { CHANGE, deriveAddress } from "@/lib/guilds/multisig/descriptor";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      currentPassword?: string;
      twoFactorToken?: string;
    };
    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      "switch a guild to multisig payouts",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }
    const { index, address } = await assignGuildAddress(
      id,
      auth.decoded.userId,
    );
    const { wallet } = await requireWallet();
    return NextResponse.json({
      success: true,
      data: {
        index,
        address,
        changeAddress: deriveAddress(wallet, CHANGE, index).address,
      },
    });
  } catch (error) {
    const message = multisigErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guilds API] multisig switch error:", error);
    return jsonError("Failed to switch the guild", 500);
  }
}

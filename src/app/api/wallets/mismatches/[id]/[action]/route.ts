/**
 * POST /api/wallets/mismatches/[id]/[action] { note, currentPassword? |
 * twoFactorToken? }
 *
 * - fixed:  "Luxor has been updated" - re-fetches Luxor and closes the
 *           mismatch only if Luxor now holds our recorded address.
 * - accept: "Luxor's address is correct" - Luxor's current address becomes
 *           our record. Changes where we expect a client to be paid, so it
 *           needs the admin's own step-up (password or 2FA), like approving
 *           a wallet change request.
 *
 * A note is required for both, and both are audit-logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/guilds/routeAuth";
import { requestMeta } from "@/lib/guilds/audit";
import { verifyStepUp } from "@/lib/auth/stepUp";
import {
  acceptLuxorAddress,
  markMismatchFixed,
  WalletActionError,
} from "@/lib/services/clientWalletCheckService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const { id, action } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      note?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };

    if (action === "fixed") {
      await markMismatchFixed(
        id,
        auth.decoded.userId,
        body.note,
        requestMeta(request),
      );
      return NextResponse.json({
        success: true,
        message: "Luxor matches our record - mismatch closed",
      });
    }

    if (action === "accept") {
      if (typeof body.note !== "string" || body.note.trim().length < 3) {
        throw new WalletActionError("Add a note explaining this action");
      }
      const stepUp = await verifyStepUp(
        auth.decoded,
        {
          currentPassword: body.currentPassword,
          twoFactorToken: body.twoFactorToken,
        },
        "accept a Luxor wallet address",
      );
      if (!stepUp.ok) {
        return NextResponse.json(
          { success: false, error: stepUp.error, code: stepUp.code },
          { status: stepUp.status },
        );
      }
      await acceptLuxorAddress(
        id,
        auth.decoded.userId,
        body.note,
        requestMeta(request),
      );
      return NextResponse.json({
        success: true,
        message: "Luxor's address is now our record",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 404 },
    );
  } catch (error) {
    if (error instanceof WalletActionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    console.error("[Wallets API] mismatch action error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update the mismatch" },
      { status: 500 },
    );
  }
}

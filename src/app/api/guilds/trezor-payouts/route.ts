/**
 * /api/guilds/trezor-payouts - admins; preparing, signing and cancelling
 * need a named payout approver.
 *
 * GET ?batchId=: the prepared transaction for the Review and sign dialog
 * (PSBT, each payment with its label, when its wallet was approved and
 * sealed, whether it was paid before), checked against the database first.
 *
 * POST (step-up re-authentication required, except "check"):
 *   { action: "prepare", distributionId }      build the payout request
 *   { action: "submit-signatures", batchId, signatures, fingerprint, signerDevice }
 *                                              the Trezor's signatures; check, broadcast
 *   { action: "cancel", batchId }              before it's signed
 *   { action: "check" }                        "Check now": confirmations
 */

import { NextRequest, NextResponse } from "next/server";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { trezorErrorMessage } from "@/lib/guilds/trezor/routeErrors";
import {
  cancelTrezorPayout,
  checkTrezorConfirmations,
  loadPayoutForSigning,
  prepareTrezorPayout,
  submitTrezorSignatures,
} from "@/lib/guilds/trezor/payout";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  if (!ADMIN_ROLES.includes(auth.decoded.role)) {
    return jsonError("Admin access required", 403);
  }
  const batchId = request.nextUrl.searchParams.get("batchId");
  if (!batchId) return jsonError("batchId is required");
  try {
    return NextResponse.json({
      success: true,
      data: await loadPayoutForSigning(batchId),
    });
  } catch (error) {
    const message = trezorErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Trezor Payouts API] GET error:", error);
    return jsonError("Failed to load the payout", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  if (!ADMIN_ROLES.includes(auth.decoded.role)) {
    return jsonError("Admin access required", 403);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      distributionId?: unknown;
      batchId?: unknown;
      signatures?: unknown;
      fingerprint?: unknown;
      signerDevice?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    const actorId = auth.decoded.userId;

    if (body.action === "check") {
      const results = await checkTrezorConfirmations(actorId);
      return NextResponse.json({ success: true, data: { results } });
    }

    const actions = ["prepare", "submit-signatures", "cancel"];
    if (!body.action || !actions.includes(body.action)) {
      return jsonError("Unknown action");
    }
    const batchId = typeof body.batchId === "string" ? body.batchId : "";
    const distributionId =
      typeof body.distributionId === "string" ? body.distributionId : "";
    if (body.action === "prepare" ? !distributionId : !batchId) {
      return jsonError("Say which payout");
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      body.action === "cancel"
        ? "cancel a guild payout"
        : "send a guild payout",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    if (body.action === "prepare") {
      const data = await prepareTrezorPayout({ distributionId, actorId });
      return NextResponse.json({ success: true, data });
    }
    if (body.action === "cancel") {
      await cancelTrezorPayout(batchId, actorId);
      return NextResponse.json({ success: true });
    }
    // submit-signatures
    if (
      !Array.isArray(body.signatures) ||
      body.signatures.some((s) => typeof s !== "string") ||
      typeof body.fingerprint !== "string"
    ) {
      return jsonError("The Trezor's signatures are missing");
    }
    const data = await submitTrezorSignatures({
      batchId,
      signatures: body.signatures as string[],
      fingerprint: body.fingerprint.toLowerCase(),
      signerDevice:
        typeof body.signerDevice === "string" && body.signerDevice
          ? body.signerDevice
          : "Trezor",
      actorId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = trezorErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Trezor Payouts API] POST error:", error);
    return jsonError("Failed to process the payout", 500);
  }
}

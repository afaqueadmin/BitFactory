/**
 * /api/guilds/multisig-payouts - admin only; preparing and signing need a
 * named payout approver.
 *
 * GET ?batchId=: the prepared transaction for the Sign screen (PSBT, each
 * output with its label and when its wallet was approved, the keys), checked
 * against the database first.
 *
 * POST (step-up re-authentication required, except "check"):
 *   { action: "prepare", distributionId }      build + sign with key A
 *   { action: "submit-signature", batchId, signedPsbt, signerDevice }
 *                                              the Trezor's signature; broadcast
 *   { action: "sign-test", batchId }           testnet only: software key B
 *   { action: "cancel", batchId }              before it's signed
 *   { action: "check" }                        "Check now": confirmations
 */

import { NextRequest, NextResponse } from "next/server";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import { multisigErrorMessage } from "@/lib/guilds/multisig/routeErrors";
import {
  cancelMultisigPayout,
  checkMultisigConfirmations,
  loadPayoutForSigning,
  prepareMultisigPayout,
  signWithTestSigner,
  submitApproverSignature,
} from "@/lib/guilds/multisig/payout";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  const batchId = request.nextUrl.searchParams.get("batchId");
  if (!batchId) return jsonError("batchId is required");
  try {
    return NextResponse.json({
      success: true,
      data: await loadPayoutForSigning(batchId),
    });
  } catch (error) {
    const message = multisigErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Multisig Payouts API] GET error:", error);
    return jsonError("Failed to load the payout", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      distributionId?: unknown;
      batchId?: unknown;
      signedPsbt?: unknown;
      signerDevice?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    const actorId = auth.decoded.userId;

    if (body.action === "check") {
      const results = await checkMultisigConfirmations(actorId);
      return NextResponse.json({ success: true, data: { results } });
    }

    const actions = ["prepare", "submit-signature", "sign-test", "cancel"];
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
      const data = await prepareMultisigPayout({ distributionId, actorId });
      return NextResponse.json({ success: true, data });
    }
    if (body.action === "cancel") {
      await cancelMultisigPayout(batchId, actorId);
      return NextResponse.json({ success: true });
    }
    if (body.action === "sign-test") {
      const data = await signWithTestSigner(batchId, actorId);
      return NextResponse.json({ success: true, data });
    }
    // submit-signature
    if (typeof body.signedPsbt !== "string" || !body.signedPsbt) {
      return jsonError("The signed transaction is missing");
    }
    const data = await submitApproverSignature({
      batchId,
      signedPsbt: body.signedPsbt,
      signerDevice:
        typeof body.signerDevice === "string" && body.signerDevice
          ? body.signerDevice
          : "Trezor",
      actorId,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = multisigErrorMessage(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Multisig Payouts API] POST error:", error);
    return jsonError("Failed to process the payout", 500);
  }
}

/**
 * /api/guilds/payout-trezor - admins only. The payout Trezor that holds the
 * guilds' single-key accounts.
 *
 * GET: its status - network, the connected device, the seal key's address,
 * the next guild account number, approvers, fee cap - plus the admins who
 * can be approvers.
 *
 * POST { action: "inspect", read } - which of the read accounts were used,
 *   and the first number free for guilds. Reads only; no re-authentication.
 * POST (step-up re-authentication required):
 *   { action: "connect", read, nextTrezorAccount }
 *   { action: "set-approvers", userIds }
 *   { action: "set-max-fee", maxFeeRateSatVb }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import {
  TrezorSetupError,
  connectPayoutTrezor,
  inspectAccounts,
  setApprovers,
  setMaxFeeRate,
  trezorStatus,
  type ReadTrezor,
} from "@/lib/guilds/trezor/device";
import { TrezorAccountError } from "@/lib/guilds/trezor/account";
import { MempoolError } from "@/lib/guilds/trezor/mempool";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

function knownError(error: unknown): string | null {
  if (
    error instanceof TrezorSetupError ||
    error instanceof TrezorAccountError ||
    error instanceof MempoolError
  ) {
    return error.message;
  }
  return null;
}

function parseRead(value: unknown): ReadTrezor | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.fingerprint !== "string" ||
    typeof r.label !== "string" ||
    typeof r.network !== "string" ||
    typeof r.sealXpub !== "string" ||
    !Array.isArray(r.accounts) ||
    r.accounts.length > 101
  ) {
    return null;
  }
  const accounts = r.accounts.map((a) =>
    a &&
    typeof a === "object" &&
    Number.isInteger((a as { account?: unknown }).account) &&
    typeof (a as { xpub?: unknown }).xpub === "string"
      ? {
          account: (a as { account: number }).account,
          xpub: (a as { xpub: string }).xpub,
        }
      : null,
  );
  if (accounts.some((a) => a === null)) return null;
  return {
    fingerprint: r.fingerprint.toLowerCase(),
    label: r.label,
    network: r.network,
    sealXpub: r.sealXpub,
    accounts: accounts as ReadTrezor["accounts"],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;
  if (!ADMIN_ROLES.includes(auth.decoded.role)) {
    return jsonError("Admin access required", 403);
  }
  try {
    const [status, admins] = await Promise.all([
      trezorStatus(),
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isDeleted: false },
        select: { id: true, name: true, email: true },
        orderBy: { email: "asc" },
      }),
    ]);
    return NextResponse.json({ success: true, data: { ...status, admins } });
  } catch (error) {
    console.error("[Guild Payout Trezor API] GET error:", error);
    return jsonError("Failed to load the payout Trezor", 500);
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
      read?: unknown;
      nextTrezorAccount?: unknown;
      userIds?: unknown;
      maxFeeRateSatVb?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };

    if (body.action === "inspect") {
      const read = parseRead(body.read);
      if (!read) return jsonError("The Trezor read is incomplete");
      return NextResponse.json({
        success: true,
        data: await inspectAccounts(read),
      });
    }

    const actions = ["connect", "set-approvers", "set-max-fee"];
    if (!body.action || !actions.includes(body.action)) {
      return jsonError("Unknown action");
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      "change the guild payout Trezor",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }
    const actorId = auth.decoded.userId;

    if (body.action === "connect") {
      const read = parseRead(body.read);
      if (!read) return jsonError("The Trezor read is incomplete");
      const saved = await connectPayoutTrezor({
        read,
        nextTrezorAccount: Number(body.nextTrezorAccount),
        actorId,
      });
      return NextResponse.json({ success: true, data: saved });
    }
    if (body.action === "set-approvers") {
      const ids = Array.isArray(body.userIds)
        ? body.userIds.filter((x): x is string => typeof x === "string")
        : [];
      await setApprovers(ids, actorId);
      return NextResponse.json({ success: true });
    }
    await setMaxFeeRate(Number(body.maxFeeRateSatVb), actorId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = knownError(error);
    if (message) return jsonError(message, 409);
    console.error("[Guild Payout Trezor API] POST error:", error);
    return jsonError("Failed to update the payout Trezor", 500);
  }
}

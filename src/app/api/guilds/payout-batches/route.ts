/**
 * /api/guilds/payout-batches - admin only.
 *
 * GET ?rewardMonth=YYYY-MM (optional): the distributions ready to send
 * (CALCULATED, paid by hand) and exactly what to send - the company wallet's
 * total and each wallet's total across guilds - plus recent batches.
 *
 * POST { distributionIds, reference }: records that the admin has sent those
 * distributions by hand as one transfer, then settles them (hosting
 * payments, carried balances, emails). Requires step-up re-authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff, jsonError } from "@/lib/guilds/routeAuth";
import { verifyStepUp } from "@/lib/auth/stepUp";
import {
  SettlementError,
  manualSettlement,
  sendPayoutBatch,
} from "@/lib/guilds/settlement";
import {
  effectivePayoutMethod,
  getPayoutSettings,
} from "@/lib/guilds/payoutSettings";
import { payoutTxUrl } from "@/lib/guilds/walletNetworks";
import { payoutNetwork } from "@/lib/guilds/multisig/network";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const monthParam = request.nextUrl.searchParams.get("rewardMonth");
    const match = monthParam ? /^(\d{4})-(\d{2})$/.exec(monthParam) : null;
    const settings = await getPayoutSettings();

    const ready = await prisma.guildDistribution.findMany({
      where: {
        status: "CALCULATED",
        ...(match
          ? {
              rewardMonth: new Date(
                Date.UTC(Number(match[1]), Number(match[2]) - 1, 1),
              ),
            }
          : {}),
      },
      orderBy: [{ rewardMonth: "asc" }, { createdAt: "asc" }],
      include: {
        guild: { select: { id: true, name: true, payoutMethod: true } },
        lines: {
          select: {
            nameSnapshot: true,
            walletSnapshot: true,
            networkSnapshot: true,
            paidBtc: true,
          },
        },
      },
    });
    const manual = ready.filter(
      (d) => effectivePayoutMethod(d.guild, settings) === "MANUAL",
    );

    // One line per wallet, totalled across guilds - what to actually send.
    const outputs = new Map<
      string,
      { address: string; network: string; btc: number; names: Set<string> }
    >();
    let companyBtc = 0;
    for (const d of manual) {
      companyBtc += Number(d.companyBtc) - Number(d.networkFeeBtc);
      for (const l of d.lines) {
        const btc = Number(l.paidBtc);
        if (btc <= 0 || !l.walletSnapshot) continue;
        const key = `${l.networkSnapshot}:${l.walletSnapshot}`;
        const out = outputs.get(key) ?? {
          address: l.walletSnapshot,
          network: l.networkSnapshot,
          btc: 0,
          names: new Set<string>(),
        };
        out.btc += btc;
        out.names.add(l.nameSnapshot);
        outputs.set(key, out);
      }
    }

    const batches = await prisma.guildPayoutBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        createdBy: { select: { name: true, email: true } },
        distributions: {
          select: { rewardMonth: true, guild: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ready: manual.map((d) => ({
          id: d.id,
          guild: { id: d.guild.id, name: d.guild.name },
          rewardMonth: d.rewardMonth,
          companyBtc: Number(d.companyBtc) - Number(d.networkFeeBtc),
          paidBtc: d.lines.reduce((s, l) => s + Number(l.paidBtc), 0),
        })),
        companyWalletAddress: settings.companyWalletAddress,
        companyBtc: Number(companyBtc.toFixed(8)),
        outputs: [...outputs.values()].map((o) => ({
          address: o.address,
          network: o.network,
          btc: Number(o.btc.toFixed(8)),
          names: [...o.names],
        })),
        batches: batches.map((b) => ({
          ...b,
          // A multisig batch is on the payout network; manual ones on
          // mainnet (or a reference with no link).
          txUrl: payoutTxUrl(
            b.txid,
            b.method === "MULTISIG_BTC" ? payoutNetwork().walletNetwork : "BTC",
          ),
          // Never sent to the browser.
          psbt: undefined,
        })),
      },
    });
  } catch (error) {
    console.error("[Guild Payout Batches API] GET error:", error);
    return jsonError("Failed to load payouts", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      distributionIds?: unknown;
      reference?: unknown;
      currentPassword?: string;
      twoFactorToken?: string;
    };
    const ids = Array.isArray(body.distributionIds)
      ? body.distributionIds.filter((x): x is string => typeof x === "string")
      : [];
    const reference =
      typeof body.reference === "string" ? body.reference.trim() : "";
    if (ids.length === 0) return jsonError("Choose what you sent");
    if (!reference) {
      return jsonError("Enter the transaction reference for the BTC you sent");
    }

    const stepUp = await verifyStepUp(
      auth.decoded,
      {
        currentPassword: body.currentPassword,
        twoFactorToken: body.twoFactorToken,
      },
      "record a guild payout",
    );
    if (!stepUp.ok) {
      return NextResponse.json(
        { success: false, error: stepUp.error, code: stepUp.code },
        { status: stepUp.status },
      );
    }

    const batchId = await sendPayoutBatch({
      distributionIds: [...new Set(ids)],
      actorId: auth.decoded.userId,
      provider: manualSettlement(reference),
    });
    return NextResponse.json({ success: true, data: { batchId } });
  } catch (error) {
    if (error instanceof SettlementError) return jsonError(error.message, 409);
    console.error("[Guild Payout Batches API] POST error:", error);
    return jsonError("Failed to record the payout", 500);
  }
}

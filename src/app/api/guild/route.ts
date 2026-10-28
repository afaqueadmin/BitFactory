/**
 * GET /api/guild - the caller's own guild (Guildmaster or Guildmember).
 *
 * Everyone in the guild sees every member's name and percentage, but only
 * their own reward wallet - never anyone else's. Also returns the caller's
 * own share of each distribution, and (for the Guildmaster) the guild's
 * recent change requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, jsonError } from "@/lib/guilds/routeAuth";
import { getGuildMembership } from "@/lib/guildScope";
import { isGuildRole } from "@/lib/customerRoles";
import { payoutTxUrl } from "@/lib/guilds/walletNetworks";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if ("error" in auth) return auth.error;
  if (!isGuildRole(auth.decoded.role)) {
    return jsonError("Only guild accounts have a guild", 403);
  }

  try {
    const me = await getGuildMembership(auth.decoded.userId);
    if (!me) return jsonError("You're not in a guild", 404);
    const isGuildmaster = me.guild.guildmasterId === auth.decoded.userId;

    const [
      memberships,
      myLines,
      walletRequests,
      splitRequests,
      memberRequests,
    ] = await Promise.all([
      prisma.guildMembership.findMany({
        where: { guildId: me.guildId, leftAt: null },
        orderBy: [{ isGuildmaster: "desc" }, { joinedAt: "asc" }],
        include: { user: { select: { name: true, email: true } } },
      }),
      prisma.guildDistributionLine.findMany({
        where: { membershipId: me.id },
        orderBy: { distribution: { rewardMonth: "desc" } },
        include: {
          distribution: {
            select: {
              rewardMonth: true,
              status: true,
              luxorPayoutBtc: true,
              companyBtc: true,
              netBtc: true,
              btcUsdRate: true,
              settledAt: true,
              payoutBatch: { select: { txid: true, method: true } },
            },
          },
        },
      }),
      isGuildmaster
        ? prisma.guildWalletChangeRequest.findMany({
            where: { guildId: me.guildId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              membershipId: true,
              requestedAddress: true,
              status: true,
              rejectionReason: true,
              createdAt: true,
              reviewedAt: true,
            },
          })
        : [],
      isGuildmaster
        ? prisma.guildSplitChangeRequest.findMany({
            where: { guildId: me.guildId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              status: true,
              rejectionReason: true,
              createdAt: true,
              reviewedAt: true,
              lines: {
                select: {
                  membershipId: true,
                  currentPercent: true,
                  requestedPercent: true,
                },
              },
            },
          })
        : [],
      isGuildmaster
        ? prisma.guildMemberChangeRequest.findMany({
            where: { guildId: me.guildId },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              action: true,
              newName: true,
              newEmail: true,
              newPercent: true,
              status: true,
              rejectionReason: true,
              createdAt: true,
              reviewedAt: true,
              // Named here: a removed member is no longer in `members`.
              membership: {
                select: { user: { select: { name: true, email: true } } },
              },
            },
          })
        : [],
    ]);

    return NextResponse.json({
      success: true,
      data: {
        guild: { id: me.guild.id, name: me.guild.name },
        isGuildmaster,
        myMembershipId: me.id,
        myWallet: {
          address: me.walletAddress,
          network: me.walletNetwork,
          carriedBtc: Number(me.carriedBtc),
          updatedAt: me.walletUpdatedAt,
        },
        members: memberships.map((m) => ({
          membershipId: m.id,
          name: m.user.name || m.user.email,
          isGuildmaster: m.isGuildmaster,
          percent: Number(m.rewardPercent),
          isMe: m.id === me.id,
        })),
        myShares: myLines.map((l) => ({
          rewardMonth: l.distribution.rewardMonth,
          status: l.distribution.status,
          percent: Number(l.percentSnapshot),
          btcAmount: Number(l.btcAmount),
          carriedInBtc: Number(l.carriedInBtc),
          paidBtc: Number(l.paidBtc),
          carriedOutBtc: Number(l.carriedOutBtc),
          carryReason: l.carryReason,
          wallet: l.walletSnapshot,
          // Only a real transaction gets a link; a manual reference doesn't.
          txUrl:
            Number(l.paidBtc) > 0 && l.distribution.status === "SETTLED"
              ? payoutTxUrl(l.distribution.payoutBatch?.txid, l.networkSnapshot)
              : null,
          settledAt: l.distribution.settledAt,
          guildPayoutBtc: Number(l.distribution.luxorPayoutBtc),
          hostingBtc: Number(l.distribution.companyBtc),
        })),
        walletRequests,
        splitRequests,
        memberRequests: memberRequests.map((r) => ({
          id: r.id,
          action: r.action,
          name:
            r.action === "ADD"
              ? r.newName || r.newEmail
              : r.membership?.user.name || r.membership?.user.email || null,
          percent: r.newPercent === null ? null : Number(r.newPercent),
          status: r.status,
          rejectionReason: r.rejectionReason,
          createdAt: r.createdAt,
          reviewedAt: r.reviewedAt,
        })),
      },
    });
  } catch (error) {
    console.error("[Guild API] GET error:", error);
    return jsonError("Failed to load your guild", 500);
  }
}

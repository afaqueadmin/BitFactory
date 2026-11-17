/**
 * GET /api/wallets - the Wallets module's "Current Wallets" list: every
 * tracked Luxor subaccount with its owner, our recorded payout address (in
 * full - staff only), where it came from, the last Luxor check, any open
 * mismatch, and what has been paid to that address. Also the counts behind
 * the module's badges.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/guilds/routeAuth";
import {
  listTrackedSubaccounts,
  payoutStatsBySubaccount,
  roundBtc,
} from "@/lib/walletsAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const subs = await listTrackedSubaccounts();
    const stats = await payoutStatsBySubaccount(subs.map((s) => s.id));
    const [pendingChange, pendingFrequency, pendingGuildWallet] =
      await Promise.all([
        prisma.walletChangeRequest.count({
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
        }),
        prisma.paymentFrequencyChangeRequest.count({
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
        }),
        prisma.guildWalletChangeRequest.count({
          where: { status: { in: ["PENDING", "CONFIRMED"] } },
        }),
      ]);

    const rows = subs.map((s) => {
      const w = s.clientWallet;
      const paid = w?.addressHash
        ? stats.get(s.id)?.get(w.addressHash)
        : undefined;
      return {
        poolSubaccountId: s.id,
        subaccountName: s.subaccountName,
        customer: s.user
          ? {
              id: s.user.id,
              name: s.user.name,
              email: s.user.email,
              isDeleted: s.user.isDeleted,
            }
          : null,
        hasRecord: Boolean(w),
        address: w?.address ?? null,
        source: w?.source ?? null,
        effectiveFrom: w?.effectiveFrom ?? null,
        lastCheckedAt: w?.lastCheckedAt ?? null,
        lastCheckStatus: w?.lastCheckStatus ?? null,
        lastCheckError: w?.lastCheckError ?? null,
        openMismatch: s.walletMismatches[0] ?? null,
        paidToCurrent: paid
          ? { ...paid, btc: roundBtc(paid.btc) }
          : { count: 0, btc: 0, first: null, last: null },
      };
    });

    return NextResponse.json({
      success: true,
      data: rows,
      counts: {
        openMismatches: rows.filter((r) => r.openMismatch).length,
        noRecord: rows.filter((r) => !r.hasRecord).length,
        pendingChangeRequests: pendingChange,
        pendingFrequencyRequests: pendingFrequency,
        pendingGuildWalletRequests: pendingGuildWallet,
      },
    });
  } catch (error) {
    console.error("[Wallets API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load wallets" },
      { status: 500 },
    );
  }
}

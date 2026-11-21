/**
 * GET /api/wallets/[poolSubaccountId]/history - one subaccount's full wallet
 * story for the Wallets module: every address it has had (with what was paid
 * to each), every mismatch, and its wallet change requests. Full addresses,
 * so staff only, and every view is audit-logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeStaff } from "@/lib/auth/authorization";
import { requestMeta } from "@/lib/guilds/audit";
import { auditClientWallet } from "@/lib/clientWallets";
import { walletAddressHash } from "@/lib/walletCrypto";
import { payoutStatsBySubaccount, roundBtc } from "@/lib/walletsAdmin";

export const dynamic = "force-dynamic";

const person = { select: { id: true, name: true, email: true } } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolSubaccountId: string }> },
) {
  const auth = await authorizeStaff(request, ["wallets.view"]);
  if ("response" in auth) return auth.response;

  try {
    const { poolSubaccountId } = await params;
    const sub = await prisma.poolSubaccount.findUnique({
      where: { id: poolSubaccountId },
      select: {
        id: true,
        subaccountName: true,
        user: person,
        clientWallet: true,
      },
    });
    if (!sub) {
      return NextResponse.json(
        { success: false, error: "Subaccount not found" },
        { status: 404 },
      );
    }

    const [history, mismatches, changeRequests, stats] = await Promise.all([
      prisma.clientWalletHistory.findMany({
        where: { poolSubaccountId },
        orderBy: { validFrom: "desc" },
        include: { actor: person },
      }),
      prisma.clientWalletMismatch.findMany({
        where: { poolSubaccountId },
        orderBy: { detectedAt: "desc" },
        include: { resolvedBy: person },
      }),
      prisma.walletChangeRequest.findMany({
        where: { subaccountName: sub.subaccountName },
        orderBy: { createdAt: "desc" },
        include: { user: person, reviewedBy: person, confirmedBy: person },
      }),
      payoutStatsBySubaccount([poolSubaccountId]),
    ]);
    const paid = stats.get(poolSubaccountId) ?? new Map();

    // Payout addresses never seen in our history (e.g. paid before the
    // record began and not matching any row) are listed separately.
    const historyHashes = new Set(
      history.map(
        (h) => h.addressHash ?? (h.address ? walletAddressHash(h.address) : ""),
      ),
    );
    const otherPayouts = [...paid.entries()]
      .filter(([hash]) => !historyHashes.has(hash))
      .map(([, s]) => ({ ...s, btc: roundBtc(s.btc) }));

    await auditClientWallet(prisma, {
      action: AuditAction.CLIENT_WALLET_HISTORY_VIEWED,
      poolSubaccountId,
      userId: auth.decoded.userId,
      description: `Viewed wallet history for ${sub.subaccountName}`,
      changes: { subaccountName: sub.subaccountName },
      ...requestMeta(request),
    });

    return NextResponse.json({
      success: true,
      data: {
        poolSubaccountId: sub.id,
        subaccountName: sub.subaccountName,
        customer: sub.user,
        record: sub.clientWallet,
        history: history.map((h) => {
          const hash =
            h.addressHash ?? (h.address ? walletAddressHash(h.address) : null);
          const s = hash ? paid.get(hash) : undefined;
          return {
            id: h.id,
            address: h.address,
            source: h.source,
            validFrom: h.validFrom,
            validTo: h.validTo,
            note: h.note,
            actor: h.actor,
            walletChangeRequestId: h.walletChangeRequestId,
            mismatchId: h.mismatchId,
            paid: s
              ? { ...s, btc: roundBtc(s.btc) }
              : { count: 0, btc: 0, first: null, last: null },
          };
        }),
        otherPayouts,
        mismatches: mismatches.map((m) => ({
          id: m.id,
          status: m.status,
          expectedAddress: m.expectedAddress,
          luxorAddress: m.luxorAddress,
          detectedAt: m.detectedAt,
          lastSeenAt: m.lastSeenAt,
          resolvedAt: m.resolvedAt,
          resolvedBy: m.resolvedBy,
          resolutionNote: m.resolutionNote,
        })),
        changeRequests: changeRequests.map((r) => ({
          id: r.id,
          status: r.status,
          currentAddress: r.currentAddress,
          requestedAddress: r.requestedAddress,
          reason: r.reason,
          createdAt: r.createdAt,
          reviewedAt: r.reviewedAt,
          requestedByEmail: r.requestedByEmail,
          reviewedBy: r.reviewedBy,
          confirmedBy: r.confirmedBy,
          rejectionReason: r.rejectionReason,
        })),
      },
    });
  } catch (error) {
    console.error("[Wallets API] history error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load wallet history" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/wallets/mismatches?status=OPEN|ALL - Luxor payout addresses that
 * differ from our record (full addresses; staff only). Default OPEN.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/guilds/routeAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireStaff(request);
  if ("error" in auth) return auth.error;

  try {
    const all = request.nextUrl.searchParams.get("status") === "ALL";
    const rows = await prisma.clientWalletMismatch.findMany({
      where: all ? {} : { status: "OPEN" },
      orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
      take: 200,
      include: {
        resolvedBy: { select: { id: true, name: true, email: true } },
        poolSubaccount: {
          select: {
            id: true,
            subaccountName: true,
            user: { select: { id: true, name: true, email: true } },
            clientWallet: { select: { address: true } },
          },
        },
      },
    });
    return NextResponse.json({
      success: true,
      data: rows.map((m) => ({
        id: m.id,
        status: m.status,
        poolSubaccountId: m.poolSubaccountId,
        subaccountName: m.poolSubaccount.subaccountName,
        customer: m.poolSubaccount.user,
        expectedAddress: m.expectedAddress,
        currentRecord: m.poolSubaccount.clientWallet?.address ?? null,
        luxorAddress: m.luxorAddress,
        detectedAt: m.detectedAt,
        lastSeenAt: m.lastSeenAt,
        emailedAt: m.emailedAt,
        resolvedAt: m.resolvedAt,
        resolvedBy: m.resolvedBy,
        resolutionNote: m.resolutionNote,
      })),
    });
  } catch (error) {
    console.error("[Wallets API] mismatches error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load mismatches" },
      { status: 500 },
    );
  }
}

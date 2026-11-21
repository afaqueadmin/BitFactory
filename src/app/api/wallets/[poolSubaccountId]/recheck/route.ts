/**
 * POST /api/wallets/[poolSubaccountId]/recheck { note } - compare this
 * subaccount's Luxor payout address with our record right now (the same
 * check the daily cron runs). Opens a mismatch if they differ. Audited.
 */
import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { requestMeta } from "@/lib/guilds/audit";
import {
  recheckSubaccount,
  WalletActionError,
} from "@/lib/services/clientWalletCheckService";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ poolSubaccountId: string }> },
) {
  const auth = await authorizeStaff(request, ["wallets.recheck"]);
  if ("response" in auth) return auth.response;

  try {
    const { poolSubaccountId } = await params;
    const body = await request.json().catch(() => ({}));
    const row = await recheckSubaccount(
      poolSubaccountId,
      auth.decoded.userId,
      (body as { note?: unknown }).note,
      requestMeta(request),
    );
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    if (error instanceof WalletActionError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }
    console.error("[Wallets API] recheck error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to re-check the wallet" },
      { status: 500 },
    );
  }
}

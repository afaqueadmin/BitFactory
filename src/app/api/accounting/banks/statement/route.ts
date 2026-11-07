import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { statementJson } from "../statementJson";
import { loadConsolidatedStatement } from "./shared";

/**
 * GET /api/accounting/banks/statement?from&to&tz&entity=<id>&bank=<id>,<id>
 * Consolidated statement: the payments of several banks (default: all) in
 * one table with one running balance, a per-bank summary, and the payments
 * recorded with no bank (on no statement).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const result = await loadConsolidatedStatement(
      new URL(request.url).searchParams,
    );
    if ("error" in result) return result.error;
    const { entity, banks, allBanks, statement, byBank, unbanked, from, to } =
      result;

    return NextResponse.json({
      success: true,
      data: {
        entity,
        allBanks,
        banks: banks.map((b) => ({
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          entity: b.entity,
        })),
        range: { from, to },
        byBank: byBank.map((b) => ({
          bankId: b.bankId,
          openingBalanceUsd: b.openingBalanceUsd.toFixed(2),
          debitUsd: b.debitUsd.toFixed(2),
          creditUsd: b.creditUsd.toFixed(2),
          closingBalanceUsd: b.closingBalanceUsd.toFixed(2),
        })),
        unbanked: {
          count: unbanked.count,
          amountUsd: unbanked.amountUsd.toFixed(2),
        },
        ...statementJson(statement),
      },
    });
  } catch (error) {
    console.error("Error fetching consolidated bank statement:", error);
    return NextResponse.json(
      { error: "Failed to load the consolidated statement" },
      { status: 500 },
    );
  }
}

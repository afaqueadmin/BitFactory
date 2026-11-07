import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { loadBankStatement } from "./shared";

/**
 * GET /api/accounting/banks/[id]/statement?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=
 * One bank's statement: every payment received (Debit) or sent (Credit)
 * through it, oldest first, with a running balance in USD.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const result = await loadBankStatement(
      id,
      new URL(request.url).searchParams,
    );
    if ("error" in result) return result.error;
    const { bank, statement, from, to } = result;

    return NextResponse.json({
      success: true,
      data: {
        bank: {
          id: bank.id,
          name: bank.name,
          isActive: bank.isActive,
          entity: bank.entity,
          currencies: bank.currencies.map((c) => c.currency.code),
        },
        range: { from, to },
        openingBalanceUsd: statement.openingBalanceUsd.toFixed(2),
        totals: {
          debitUsd: statement.totals.debitUsd.toFixed(2),
          creditUsd: statement.totals.creditUsd.toFixed(2),
        },
        closingBalanceUsd: statement.closingBalanceUsd.toFixed(2),
        rows: statement.rows.map((r) => ({
          id: r.id,
          source: r.source,
          date: r.date.toISOString(),
          invoices: r.invoices,
          invoiceType: r.invoiceType,
          counterparty: r.counterparty,
          invoiceAmountUsd: r.invoiceAmountUsd?.toFixed(2) ?? null,
          side: r.side,
          amountUsd: r.amountUsd.toFixed(2),
          original: r.original,
          balanceUsd: r.balanceUsd.toFixed(2),
          partial: r.partial,
          note: r.note,
          receiptHref: r.receiptHref,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching bank statement:", error);
    return NextResponse.json(
      { error: "Failed to load the bank statement" },
      { status: 500 },
    );
  }
}

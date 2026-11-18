import type { Statement } from "@/lib/accounting/bankStatementRows";

/** A statement as JSON (Decimals as 2 dp strings, dates as ISO). */
export function statementJson(statement: Statement) {
  return {
    openingBalanceUsd: statement.openingBalanceUsd.toFixed(2),
    totals: {
      debitUsd: statement.totals.debitUsd.toFixed(2),
      creditUsd: statement.totals.creditUsd.toFixed(2),
    },
    closingBalanceUsd: statement.closingBalanceUsd.toFixed(2),
    rows: statement.rows.map((r) => ({
      id: r.id,
      source: r.source,
      bankId: r.bankId,
      date: r.date.toISOString(),
      invoices: r.invoices,
      invoiceType: r.invoiceType,
      typeHref: r.typeHref ?? null,
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
  };
}

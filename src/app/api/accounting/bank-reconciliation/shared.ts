import { Prisma } from "@prisma/client";
import {
  reconciliationDocumentHref,
  reconciliationEntryLabel,
  ReconciliationInvoiceType,
} from "@/lib/accounting/bankReconciliation";
import { ReconciliationSummary } from "@/lib/accounting/bankReconciliationRequest";
import { customerInvoiceHref } from "@/lib/accounting/bankStatementRows";

/** The invoice stopped qualifying between the form check and the save. */
export const NOT_QUALIFIED =
  "This invoice was just reconciled or paid into a bank. Reload and pick another invoice";

export const reconciliationInclude = {
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      invoiceType: true,
      totalAmount: true,
      user: { select: { name: true, email: true } },
    },
  },
  bank: {
    select: {
      id: true,
      name: true,
      isActive: true,
      entity: { select: { id: true, name: true } },
    },
  },
  currency: { select: { id: true, code: true } },
  createdByUser: { select: { name: true, email: true } },
} satisfies Prisma.AccountingBankReconciliationInclude;

export type ReconciliationWithRelations =
  Prisma.AccountingBankReconciliationGetPayload<{
    include: typeof reconciliationInclude;
  }>;

/** Name, else email (as on the statements). */
export const userName = (u: { name: string | null; email: string } | null) =>
  u?.name?.trim() || u?.email || "—";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** An entry as JSON (Decimals as strings, the date as YYYY-MM-DD). */
export function reconciliationJson(e: ReconciliationWithRelations) {
  return {
    id: e.id,
    entryNumber: e.entryNumber,
    entryLabel: reconciliationEntryLabel(e.entryNumber),
    date: isoDay(e.date),
    invoiceId: e.invoice.id,
    invoiceNumber: e.invoice.invoiceNumber,
    invoiceType: e.invoice.invoiceType,
    invoiceHref: customerInvoiceHref(e.invoice.invoiceType, e.invoice.id),
    invoiceTotalUsd: e.invoice.totalAmount.toFixed(2),
    clientName: userName(e.invoice.user),
    entityId: e.bank.entity.id,
    entityName: e.bank.entity.name,
    bankId: e.bank.id,
    bankName: e.bank.name,
    bankActive: e.bank.isActive,
    currencyId: e.currency.id,
    currencyCode: e.currency.code,
    exchangeRate: e.exchangeRate.toString(),
    amount: e.amount.toFixed(2),
    fee: e.fee.toFixed(2),
    amountUsd: e.amountUsd.toFixed(2),
    feeUsd: e.feeUsd.toFixed(2),
    narration: e.narration,
    pdf: e.pdfKey
      ? {
          key: e.pdfKey,
          fileName: e.pdfName ?? "Bank Reconciliation PDF",
          href: reconciliationDocumentHref(e.id, "pdf"),
        }
      : null,
    sheet: e.sheetKey
      ? {
          key: e.sheetKey,
          fileName: e.sheetName ?? "Bank Reconciliation sheet",
          href: reconciliationDocumentHref(e.id, "sheet"),
        }
      : null,
    createdBy: userName(e.createdByUser),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** The audit summary of a saved entry. */
export const reconciliationSummary = (
  e: ReconciliationWithRelations,
): ReconciliationSummary => ({
  invoiceNumber: e.invoice.invoiceNumber,
  invoiceType: e.invoice.invoiceType as ReconciliationInvoiceType,
  bank: e.bank.name,
  entity: e.bank.entity.name,
  code: e.currency.code,
});

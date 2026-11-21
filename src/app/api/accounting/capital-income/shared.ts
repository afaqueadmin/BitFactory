import { Prisma } from "@prisma/client";
import {
  incomeDocumentHref,
  incomeEntryLabel,
} from "@/lib/accounting/capitalIncome";
import { IncomeSummary } from "@/lib/accounting/capitalIncomeRequest";

export const incomeInclude = {
  head: { select: { id: true, name: true, isActive: true } },
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
} satisfies Prisma.AccountingIncomeInclude;

export type IncomeWithRelations = Prisma.AccountingIncomeGetPayload<{
  include: typeof incomeInclude;
}>;

const userName = (u: { name: string | null; email: string }) =>
  u.name?.trim() || u.email;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** An entry as JSON (Decimals as strings, the date as YYYY-MM-DD). */
export function incomeJson(e: IncomeWithRelations) {
  return {
    id: e.id,
    entryNumber: e.entryNumber,
    entryLabel: incomeEntryLabel(e.entryNumber),
    date: isoDay(e.date),
    head: e.head,
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
    receivedFrom: e.receivedFrom,
    narration: e.narration,
    pdf: e.pdfKey
      ? {
          key: e.pdfKey,
          fileName: e.pdfName ?? "Capital & Income PDF",
          href: incomeDocumentHref(e.id, "pdf"),
        }
      : null,
    sheet: e.sheetKey
      ? {
          key: e.sheetKey,
          fileName: e.sheetName ?? "Capital & Income sheet",
          href: incomeDocumentHref(e.id, "sheet"),
        }
      : null,
    createdBy: userName(e.createdByUser),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** The audit summary of a saved entry. */
export const incomeSummary = (e: IncomeWithRelations): IncomeSummary => ({
  head: e.head.name,
  bank: e.bank.name,
  entity: e.bank.entity.name,
  code: e.currency.code,
});

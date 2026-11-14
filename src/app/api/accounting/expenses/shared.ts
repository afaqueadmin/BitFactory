import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import {
  expenseBalance,
  expenseEntryLabel,
  expensePaymentReceiptHref,
  expenseStatus,
} from "@/lib/accounting/expense";

const userSelect = { select: { name: true, email: true } } as const;

export const expensePaymentInclude = {
  bank: {
    select: {
      id: true,
      name: true,
      isActive: true,
      entity: { select: { id: true, name: true } },
    },
  },
  currency: { select: { id: true, code: true } },
  createdByUser: userSelect,
} satisfies Prisma.AccountingExpensePaymentInclude;

export const expenseInclude = {
  head: { select: { id: true, name: true, isActive: true } },
  createdByUser: userSelect,
  payments: {
    include: expensePaymentInclude,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  },
} satisfies Prisma.AccountingExpenseInclude;

type PaymentWithRelations = Prisma.AccountingExpensePaymentGetPayload<{
  include: typeof expensePaymentInclude;
}>;

type ExpenseWithRelations = Prisma.AccountingExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

const userName = (u: { name: string | null; email: string }) =>
  u.name?.trim() || u.email;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const expenseDocumentHref = (id: string, kind: "pdf" | "sheet") =>
  `/api/accounting/expenses/${id}/documents/${kind}`;

/** A payment as JSON (Decimals as strings, the date as YYYY-MM-DD). */
export function expensePaymentJson(p: PaymentWithRelations) {
  return {
    id: p.id,
    expenseId: p.expenseId,
    date: isoDay(p.date),
    entityId: p.bank.entity.id,
    entityName: p.bank.entity.name,
    bankId: p.bank.id,
    bankName: p.bank.name,
    bankActive: p.bank.isActive,
    currencyId: p.currency.id,
    currencyCode: p.currency.code,
    exchangeRate: p.exchangeRate.toString(),
    amount: p.amount.toFixed(2),
    fee: p.fee.toFixed(2),
    amountUsd: p.amountUsd.toFixed(2),
    feeUsd: p.feeUsd.toFixed(2),
    note: p.note,
    receiptKey: p.receiptKey,
    receiptHref: p.receiptKey ? expensePaymentReceiptHref(p.id) : null,
    createdBy: userName(p.createdByUser),
    createdAt: p.createdAt.toISOString(),
  };
}

const sum = (values: Decimal[]) =>
  values.reduce((s, v) => s.plus(v), new Decimal(0));

/** An expense with its payments and worked-out balance and status. */
export function expenseJson(e: ExpenseWithRelations) {
  const paidUsd = sum(e.payments.map((p) => p.amountUsd));
  const feesUsd = sum(e.payments.map((p) => p.feeUsd));
  // Each bank once, in payment order.
  const banks = [
    ...new Map(
      e.payments.map((p) => [
        p.bank.id,
        { id: p.bank.id, name: p.bank.name, entityName: p.bank.entity.name },
      ]),
    ).values(),
  ];
  return {
    id: e.id,
    entryNumber: e.entryNumber,
    entryLabel: expenseEntryLabel(e.entryNumber),
    date: isoDay(e.date),
    head: e.head,
    narration: e.narration,
    pdf: e.pdfKey
      ? {
          key: e.pdfKey,
          fileName: e.pdfName ?? "Expense PDF",
          href: expenseDocumentHref(e.id, "pdf"),
        }
      : null,
    sheet: e.sheetKey
      ? {
          key: e.sheetKey,
          fileName: e.sheetName ?? "Expense sheet",
          href: expenseDocumentHref(e.id, "sheet"),
        }
      : null,
    amountDueUsd: e.amountDueUsd.toFixed(2),
    paidUsd: paidUsd.toFixed(2),
    balanceUsd: expenseBalance(e.amountDueUsd, paidUsd).toFixed(2),
    feesUsd: feesUsd.toFixed(2),
    status: expenseStatus(e.amountDueUsd, paidUsd),
    banks,
    payments: e.payments.map(expensePaymentJson),
    createdBy: userName(e.createdByUser),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** The saved columns of an expense, for an audit log entry. */
export const auditExpense = (
  data: {
    date: Date | string;
    narration?: string | null;
    amountDueUsd: Decimal | string;
    pdfKey?: string | null;
    sheetKey?: string | null;
  },
  headName: string,
) => ({
  date: data.date,
  head: headName,
  narration: data.narration ?? null,
  amountDueUsd: String(data.amountDueUsd),
  pdfKey: data.pdfKey ?? null,
  sheetKey: data.sheetKey ?? null,
});

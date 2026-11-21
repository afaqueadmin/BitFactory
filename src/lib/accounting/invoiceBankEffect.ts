import { AuditAction, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/storage/r2";
import { reconciliationEntryLabel } from "@/lib/accounting/bankReconciliation";

/**
 * What marking an invoice unpaid (or deleting one of its payments) removes
 * from the bank statements, so the screens can warn before it happens and
 * the routes can refuse until the user confirms (decided 2026-11-19).
 *
 * Customer side: the voided payments that are on a statement (a bank and an
 * amount other than 0), plus the invoice's Bank Reconciliation entry, which
 * is deleted with it so the money can't show twice once paid again.
 * Vendor side: the payment parts, or the whole consolidated payment.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const BANK_EFFECT_CONFIRM = "BANK_EFFECT_CONFIRM";

export interface BankEffectRow {
  /** e.g. "Payment", "REC-0001", "REC-0001 fee", "Consolidated payment". */
  label: string;
  bankName: string;
  side: "DEBIT" | "CREDIT";
  amountUsd: string;
  /** YYYY-MM-DD, or null when none was saved. */
  date: string | null;
}

export interface BankEffect {
  /** Statement rows that disappear. Empty = the statements don't change. */
  rows: BankEffectRow[];
  /** Payments voided or removed, on a statement or not. */
  paymentCount: number;
  /** The Bank Reconciliation entry deleted with it, if any. */
  reconciliation: { id: string; entryLabel: string } | null;
  /** Vendor consolidated payment: the other invoices it also un-pays. */
  otherInvoices: string[];
}

const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

const reconciliationSelect = {
  id: true,
  entryNumber: true,
  date: true,
  amountUsd: true,
  feeUsd: true,
  amount: true,
  fee: true,
  exchangeRate: true,
  narration: true,
  pdfKey: true,
  sheetKey: true,
  bank: { select: { name: true, entity: { select: { name: true } } } },
  currency: { select: { code: true } },
} satisfies Prisma.AccountingBankReconciliationSelect;

type ReconciliationForEffect = Prisma.AccountingBankReconciliationGetPayload<{
  select: typeof reconciliationSelect;
}>;

function reconciliationRows(r: ReconciliationForEffect): BankEffectRow[] {
  const label = reconciliationEntryLabel(r.entryNumber);
  const rows: BankEffectRow[] = [
    {
      label,
      bankName: r.bank.name,
      side: "DEBIT",
      amountUsd: r.amountUsd.toFixed(2),
      date: day(r.date),
    },
  ];
  if (r.feeUsd.greaterThan(0)) {
    rows.push({
      label: `${label} fee`,
      bankName: r.bank.name,
      side: "CREDIT",
      amountUsd: r.feeUsd.toFixed(2),
      date: day(r.date),
    });
  }
  return rows;
}

/**
 * A customer invoice's payments being voided: all of them (Mark Unpaid, a
 * status change away from Paid), the non-memo ones (Cancel Payment) or one
 * (`paymentId`). `withReconciliation` adds its Bank Reconciliation entry.
 */
export async function customerBankEffect(
  db: Db,
  invoiceId: string,
  opts: {
    includeMemo: boolean;
    paymentId?: string;
    withReconciliation: boolean;
  },
): Promise<BankEffect> {
  const [payments, reconciliation] = await Promise.all([
    db.costPayment.findMany({
      where: {
        invoiceId,
        isDeleted: false,
        ...(opts.includeMemo ? {} : { memoId: null }),
        ...(opts.paymentId ? { id: opts.paymentId } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        amount: true,
        paymentDate: true,
        createdAt: true,
        bank: { select: { name: true } },
      },
    }),
    opts.withReconciliation
      ? db.accountingBankReconciliation.findUnique({
          where: { invoiceId },
          select: reconciliationSelect,
        })
      : null,
  ]);
  const rows: BankEffectRow[] = payments
    .filter((p) => p.bank && p.amount !== 0)
    .map((p) => ({
      label: "Payment",
      bankName: p.bank!.name,
      side: p.amount > 0 ? "DEBIT" : "CREDIT",
      amountUsd: Math.abs(p.amount).toFixed(2),
      date: day(p.paymentDate ?? p.createdAt),
    }));
  if (reconciliation) rows.push(...reconciliationRows(reconciliation));
  return {
    rows,
    paymentCount: payments.length,
    reconciliation: reconciliation
      ? {
          id: reconciliation.id,
          entryLabel: reconciliationEntryLabel(reconciliation.entryNumber),
        }
      : null,
    otherInvoices: [],
  };
}

/** A Farm Tariff / Hardware Purchase being marked unpaid. */
export async function vendorBankEffect(
  db: Db,
  kind: "farm" | "hardware",
  id: string,
): Promise<BankEffect | null> {
  const invoiceSelect = {
    invoiceNumber: true,
    paidDate: true,
    paymentParts: {
      select: { amountUsd: true, bank: { select: { name: true } } },
    },
    consolidatedItem: {
      select: {
        payment: {
          select: {
            amountUsd: true,
            paidDate: true,
            bank: { select: { name: true } },
            items: {
              select: {
                vendorInvoice: { select: { invoiceNumber: true } },
                hardwarePurchase: { select: { invoiceNumber: true } },
              },
            },
          },
        },
      },
    },
  } as const;
  const invoice =
    kind === "hardware"
      ? await db.hardwarePurchaseInvoice.findUnique({
          where: { id },
          select: invoiceSelect,
        })
      : await db.vendorInvoice.findUnique({
          where: { id },
          select: invoiceSelect,
        });
  if (!invoice) return null;

  const consolidated = invoice.consolidatedItem?.payment;
  if (consolidated) {
    return {
      rows: [
        {
          label: "Consolidated payment",
          bankName: consolidated.bank.name,
          side: "CREDIT",
          amountUsd: consolidated.amountUsd.toFixed(2),
          date: day(consolidated.paidDate),
        },
      ],
      paymentCount: 1,
      reconciliation: null,
      otherInvoices: consolidated.items
        .map(
          (i) => (i.vendorInvoice ?? i.hardwarePurchase)?.invoiceNumber ?? null,
        )
        .filter((n): n is string => !!n && n !== invoice.invoiceNumber),
    };
  }
  return {
    rows: invoice.paymentParts.map((p) => ({
      label: "Payment",
      bankName: p.bank.name,
      side: "CREDIT" as const,
      amountUsd: p.amountUsd.toFixed(2),
      date: day(invoice.paidDate),
    })),
    paymentCount: invoice.paymentParts.length,
    reconciliation: null,
    otherInvoices: [],
  };
}

/** The 409 a route returns while a bank-changing action isn't confirmed. */
export const confirmBankEffectResponse = (effect: BankEffect) =>
  NextResponse.json(
    {
      error:
        "This also changes the bank statements. Review the rows that will be removed and confirm to continue.",
      code: BANK_EFFECT_CONFIRM,
      bankEffect: effect,
    },
    { status: 409 },
  );

/** Whether the request body confirms the bank statement change. */
export async function readConfirm(request: Request): Promise<boolean> {
  const body = await request.json().catch(() => null);
  return (
    !!body &&
    (body as { confirmBankEffect?: unknown }).confirmBankEffect === true
  );
}

/**
 * Inside the action's transaction: deletes the invoice's Bank
 * Reconciliation entry (if any) and audit logs why. Returns the file keys
 * to delete from R2 once the transaction has committed.
 */
export async function deleteInvoiceReconciliation(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  userId: string,
  reason: string,
): Promise<string[]> {
  const r = await tx.accountingBankReconciliation.findUnique({
    where: { invoiceId },
    select: {
      ...reconciliationSelect,
      invoice: { select: { invoiceNumber: true, invoiceType: true } },
    },
  });
  if (!r) return [];
  await tx.accountingBankReconciliation.delete({ where: { id: r.id } });
  const label = reconciliationEntryLabel(r.entryNumber);
  await tx.auditLog.create({
    data: {
      action: AuditAction.BANK_RECONCILIATION_DELETED,
      entityType: "AccountingBankReconciliation",
      entityId: r.id,
      userId,
      description: `Bank Reconciliation ${label} (invoice ${r.invoice.invoiceNumber}, $${r.amountUsd.toFixed(2)}) from ${r.bank.name} deleted: ${reason}`,
      changes: JSON.stringify({
        reason,
        date: day(r.date),
        invoice: r.invoice.invoiceNumber,
        invoiceType: r.invoice.invoiceType,
        entity: r.bank.entity.name,
        bank: r.bank.name,
        currency: r.currency.code,
        exchangeRate: r.exchangeRate.toString(),
        amount: r.amount.toString(),
        fee: r.fee.toString(),
        amountUsd: r.amountUsd.toString(),
        feeUsd: r.feeUsd.toString(),
        narration: r.narration,
        pdfKey: r.pdfKey,
        sheetKey: r.sheetKey,
      }),
    },
  });
  return [r.pdfKey, r.sheetKey].filter((k): k is string => !!k);
}

/** After commit: deletes the entry's files. A failure only leaves an orphan. */
export async function deleteReconciliationFiles(keys: string[]) {
  for (const key of keys) {
    await deleteObject(key).catch((error) =>
      console.error("Error deleting Bank Reconciliation file:", error),
    );
  }
}

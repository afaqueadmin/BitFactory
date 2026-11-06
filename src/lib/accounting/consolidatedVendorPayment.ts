import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  parseVendorPayment,
  VendorPaymentPartData,
} from "@/lib/accounting/vendorPayment";
import type { PaymentPartRequest } from "@/lib/accounting/paymentAccount";
import {
  adjustedOnInvoice,
  DepositInvoiceKind,
  getVendorDepositBalance,
  lockVendor,
} from "@/lib/accounting/vendorDeposit";

/**
 * Consolidated payments: one bank transfer that paid several of a vendor's
 * pending invoices at once - credits (negative invoices) included - recorded
 * once, as it appears on the bank statement.
 *
 * Farm Tariffs and Hardware Purchases are kept separate: a consolidated
 * payment pays invoices of one kind only. One vendor, one currency, one
 * entity/bank. Each invoice's share is its cash due (total minus any
 * security deposit already applied); the shares add up to the amount due,
 * and the amount paid must equal that plus the transaction fee (D8, as on
 * single-invoice payments). Every invoice it pays becomes Paid with the
 * paid date and receipt entered here.
 *
 * Marking any of them unpaid undoes the whole payment, so the record keeps
 * matching the bank statement.
 */

export const MAX_CONSOLIDATED_INVOICES = 50;

const CONFIG = {
  farm: {
    receiptPurpose: "vendor-receipt",
    entityType: "VendorInvoice",
    label: "vendor invoice",
    page: "Farm Tariffs",
    paidAction: AuditAction.VENDOR_INVOICE_PAID,
    updatedAction: AuditAction.VENDOR_INVOICE_UPDATED,
  },
  hardware: {
    receiptPurpose: "hardware-purchase-receipt",
    entityType: "HardwarePurchaseInvoice",
    label: "hardware purchase invoice",
    page: "Hardware Purchases",
    paidAction: AuditAction.HARDWARE_PURCHASE_INVOICE_PAID,
    updatedAction: AuditAction.HARDWARE_PURCHASE_INVOICE_UPDATED,
  },
} as const;

export const consolidatedPageName = (kind: DepositInvoiceKind) =>
  CONFIG[kind].page;

type Tx = Prisma.TransactionClient;

class Rollback extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const usd = (v: Decimal) => {
  const s = v.abs().toFixed(2);
  return v.isNegative() ? `-$${s}` : `$${s}`;
};

/** Body of POST /api/{vendor-invoices|hardware-purchases}/consolidated-payment. */
export interface RecordConsolidatedPaymentRequest {
  vendorId?: unknown;
  invoiceIds?: unknown;
  paidDate?: unknown;
  /** The one transfer: account, rate, amount (fee included) and fee. */
  part?: PaymentPartRequest & { transactionFee?: unknown };
  receiptKey?: unknown;
}

interface PendingInvoice {
  id: string;
  invoiceNumber: string;
  vendorId: string | null;
  totalAmount: Decimal;
  paymentStatus: "Paid" | "Pending" | "Cancelled";
  billingDate: Date | null;
  dueDate: Date;
}

async function loadInvoices(
  kind: DepositInvoiceKind,
  where: Prisma.VendorInvoiceWhereInput &
    Prisma.HardwarePurchaseInvoiceWhereInput,
): Promise<PendingInvoice[]> {
  const select = {
    id: true,
    invoiceNumber: true,
    vendorId: true,
    totalAmount: true,
    paymentStatus: true,
    billingDate: true,
    dueDate: true,
  } as const;
  const orderBy = [
    { billingDate: "asc" as const },
    { invoiceNumber: "asc" as const },
  ];
  return kind === "hardware"
    ? prisma.hardwarePurchaseInvoice.findMany({ where, select, orderBy })
    : prisma.vendorInvoice.findMany({ where, select, orderBy });
}

/**
 * The vendor's Pending invoices of this kind, each with what is still due
 * in cash (total minus security deposit applied). Credits are negative.
 * Invoices with nothing left to pay are left out.
 */
export async function consolidationCandidates(
  kind: DepositInvoiceKind,
  vendorId: string,
) {
  const invoices = await loadInvoices(kind, {
    vendorId,
    paymentStatus: "Pending",
  });
  const rows = [];
  for (const inv of invoices) {
    const adjusted = await adjustedOnInvoice(prisma, kind, inv.id);
    const due = inv.totalAmount.minus(adjusted);
    if (due.isZero()) continue;
    rows.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      billingDate: inv.billingDate,
      dueDate: inv.dueDate,
      totalAmount: inv.totalAmount.toFixed(2),
      depositAppliedUsd: adjusted.toFixed(2),
      dueUsd: due.toFixed(2),
    });
  }
  return rows;
}

/** Records a consolidated payment and marks every invoice in it Paid. */
export async function recordConsolidatedPayment(
  kind: DepositInvoiceKind,
  userId: string,
  body: RecordConsolidatedPaymentRequest,
): Promise<NextResponse> {
  const config = CONFIG[kind];
  const bad = (error: string, status = 400) =>
    NextResponse.json({ error }, { status });

  const ids = Array.isArray(body.invoiceIds)
    ? [
        ...new Set(
          body.invoiceIds.filter(
            (x): x is string => typeof x === "string" && x !== "",
          ),
        ),
      ]
    : [];
  if (ids.length < 2) {
    return bad(
      "Choose at least two invoices. For one invoice, use Record Payment on its page",
    );
  }
  if (ids.length > MAX_CONSOLIDATED_INVOICES) {
    return bad(
      `A consolidated payment can pay up to ${MAX_CONSOLIDATED_INVOICES} invoices`,
    );
  }
  if (typeof body.vendorId !== "string" || !body.vendorId) {
    return bad("Choose the vendor");
  }
  const vendorId = body.vendorId;

  const invoices = await loadInvoices(kind, { id: { in: ids } });
  if (invoices.length !== ids.length) {
    return bad("One of the invoices wasn't found. Reload and try again", 404);
  }
  for (const inv of invoices) {
    if (inv.vendorId !== vendorId) {
      return bad(
        `Invoice ${inv.invoiceNumber} is from another vendor: a consolidated payment pays one vendor's invoices`,
      );
    }
    if (inv.paymentStatus !== "Pending") {
      return bad(
        `Invoice ${inv.invoiceNumber} is ${inv.paymentStatus.toLowerCase()}: only Pending invoices can be paid`,
      );
    }
  }

  // Each invoice's share: its cash due now.
  const order = new Map(ids.map((id, i) => [id, i]));
  invoices.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  const shares: { invoice: PendingInvoice; adjusted: Decimal; due: Decimal }[] =
    [];
  for (const inv of invoices) {
    const adjusted = await adjustedOnInvoice(prisma, kind, inv.id);
    const due = inv.totalAmount.minus(adjusted);
    if (due.isZero()) {
      return bad(`Invoice ${inv.invoiceNumber} has nothing left to pay`);
    }
    shares.push({ invoice: inv, adjusted, due });
  }
  const dueTotal = shares.reduce((s, x) => s.plus(x.due), new Decimal(0));
  if (!dueTotal.greaterThan(0)) {
    return bad(
      `The selected invoices add up to ${usd(dueTotal)}. A consolidated payment must be above zero: a credit is paid together with invoices it offsets`,
    );
  }

  // Paid date, the one transfer (amount = due + fee), and the receipt.
  if (!body.part || typeof body.part !== "object") {
    return bad("Enter the payment's entity, bank, currency, amount and fee");
  }
  const parsed = await parseVendorPayment(
    {
      paidDate: body.paidDate,
      parts: [body.part],
      receiptKey: body.receiptKey,
    },
    dueTotal,
    config.receiptPurpose,
  );
  if ("error" in parsed) return bad(parsed.error);
  if (parsed.parts.length !== 1) {
    return bad("A consolidated payment is one transfer in one currency");
  }
  const part: VendorPaymentPartData = parsed.parts[0];
  const { paidDate, paymentReceiptKey: receiptKey } = parsed.data;

  let paymentId: string;
  try {
    paymentId = await prisma.$transaction(
      async (tx) => {
        // Serializes with deposit changes and other payments for the vendor.
        await lockVendor(tx, vendorId);
        for (const s of shares) {
          const now = await adjustedOnInvoice(tx, kind, s.invoice.id);
          if (!now.equals(s.adjusted)) {
            throw new Rollback(
              `The deposit applied to invoice ${s.invoice.invoiceNumber} changed. Reload and try again`,
              409,
            );
          }
          const where = {
            id: s.invoice.id,
            vendorId,
            paymentStatus: "Pending" as const,
          };
          const data = {
            paymentStatus: "Paid" as const,
            paidDate,
            paymentReceiptKey: receiptKey,
            updatedBy: userId,
          };
          const { count } =
            kind === "hardware"
              ? await tx.hardwarePurchaseInvoice.updateMany({ where, data })
              : await tx.vendorInvoice.updateMany({ where, data });
          if (count === 0) {
            throw new Rollback(
              `Invoice ${s.invoice.invoiceNumber} was updated by someone else. Reload and try again`,
              409,
            );
          }
        }
        const payment = await tx.vendorConsolidatedPayment.create({
          data: {
            kind,
            vendorId,
            paidDate,
            entityId: part.entityId,
            bankId: part.bankId,
            currencyId: part.currencyId,
            amount: part.amount,
            exchangeRate: part.exchangeRate,
            amountUsd: part.amountUsd,
            transactionFee: part.transactionFee,
            receiptKey,
            createdBy: userId,
            items: {
              create: shares.map((s, i) => ({
                amountUsd: s.due,
                sortOrder: i,
                ...(kind === "hardware"
                  ? { hardwarePurchaseId: s.invoice.id }
                  : { vendorInvoiceId: s.invoice.id }),
              })),
            },
          },
        });
        return payment.id;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof Rollback) return bad(error.message, error.status);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return bad(
        "One of the invoices is already in a consolidated payment. Reload and try again",
        409,
      );
    }
    throw error;
  }

  const numbers = shares.map((s) => s.invoice.invoiceNumber);
  await prisma.auditLog.create({
    data: {
      action: AuditAction.VENDOR_CONSOLIDATED_PAYMENT_RECORDED,
      entityType: "VendorConsolidatedPayment",
      entityId: paymentId,
      userId,
      description: `Consolidated payment of ${usd(part.amountUsd)} (incl. fee) recorded for ${config.label}s ${numbers.join(", ")}`,
      changes: JSON.stringify({
        ...parsed.audit,
        kind,
        vendorId,
        invoices: shares.map((s) => ({
          id: s.invoice.id,
          invoiceNumber: s.invoice.invoiceNumber,
          totalAmount: s.invoice.totalAmount.toString(),
          depositApplied: s.adjusted.toString(),
          shareUsd: s.due.toString(),
        })),
        dueUsd: dueTotal.toString(),
      }),
    },
  });
  for (const s of shares) {
    await prisma.auditLog.create({
      data: {
        action: config.paidAction,
        entityType: config.entityType,
        entityId: s.invoice.id,
        userId,
        description: `Paid ${usd(s.due)} of ${config.label} ${s.invoice.invoiceNumber} in a consolidated payment with ${numbers.filter((n) => n !== s.invoice.invoiceNumber).join(", ")}`,
        changes: JSON.stringify({
          consolidatedPaymentId: paymentId,
          paidDate,
          shareUsd: s.due.toString(),
          paymentReceiptKey: receiptKey,
        }),
      },
    });
  }

  return NextResponse.json({
    success: true,
    data: { id: paymentId, invoiceNumbers: numbers },
  });
}

/**
 * Inside markVendorSideUnpaid's transaction: undoes the whole consolidated
 * payment an invoice belongs to. Every invoice in it goes back to Pending
 * (paid date and receipt cleared) and the payment record is deleted.
 * Returns what was undone, for the audit log.
 */
export async function undoConsolidatedPayment(
  tx: Tx,
  kind: DepositInvoiceKind,
  paymentId: string,
  userId: string,
) {
  const config = CONFIG[kind];
  const payment = await tx.vendorConsolidatedPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          vendorInvoice: {
            select: { id: true, invoiceNumber: true, paymentStatus: true },
          },
          hardwarePurchase: {
            select: {
              id: true,
              invoiceNumber: true,
              paymentStatus: true,
              securityDeposit: true,
            },
          },
        },
      },
    },
  });
  await lockVendor(tx, payment.vendorId);

  const invoices = payment.items.map((item) => {
    const inv = item.vendorInvoice ?? item.hardwarePurchase;
    if (!inv)
      throw new Rollback("A consolidated payment item has no invoice", 500);
    return { ...inv, shareUsd: item.amountUsd };
  });

  // Hardware: each invoice's own security deposit moves from "paid" back to
  // "pending" for the vendor, so the vendor must still hold all of it.
  if (kind === "hardware") {
    const deposits = payment.items.reduce(
      (s, i) => s.plus(i.hardwarePurchase?.securityDeposit ?? 0),
      new Decimal(0),
    );
    if (deposits.greaterThan(0)) {
      const balance = await getVendorDepositBalance(tx, payment.vendorId);
      if (balance.held.lessThan(deposits)) {
        throw new Rollback(
          `The vendor has already returned or applied part of these invoices' $${deposits.toFixed(2)} security deposits (only $${balance.held.toFixed(2)} is still held), so the payment can't be undone`,
          400,
        );
      }
    }
  }

  for (const inv of invoices) {
    const where = { id: inv.id, paymentStatus: "Paid" as const };
    const data = {
      paymentStatus: "Pending" as const,
      paidDate: null,
      paymentReceiptKey: null,
      updatedBy: userId,
    };
    const { count } =
      kind === "hardware"
        ? await tx.hardwarePurchaseInvoice.updateMany({ where, data })
        : await tx.vendorInvoice.updateMany({ where, data });
    if (count === 0) {
      throw new Rollback(
        `Invoice ${inv.invoiceNumber} was updated by someone else. Reload and try again`,
        409,
      );
    }
  }

  // Items go with it (cascade).
  await tx.vendorConsolidatedPayment.delete({ where: { id: paymentId } });

  const numbers = invoices.map((i) => i.invoiceNumber);
  await tx.auditLog.create({
    data: {
      action: AuditAction.VENDOR_CONSOLIDATED_PAYMENT_REMOVED,
      entityType: "VendorConsolidatedPayment",
      entityId: paymentId,
      userId,
      description: `Consolidated payment of $${payment.amountUsd.toFixed(2)} (incl. fee) undone; ${config.label}s ${numbers.join(", ")} are Pending again`,
      changes: JSON.stringify({
        kind,
        vendorId: payment.vendorId,
        paidDate: payment.paidDate,
        entityId: payment.entityId,
        bankId: payment.bankId,
        currencyId: payment.currencyId,
        amount: payment.amount.toString(),
        exchangeRate: payment.exchangeRate.toString(),
        amountUsd: payment.amountUsd.toString(),
        transactionFee: payment.transactionFee.toString(),
        // The receipt PDF stays in R2; its key is kept here for reference.
        receiptKey: payment.receiptKey,
        invoices: invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          shareUsd: i.shareUsd.toString(),
        })),
      }),
    },
  });
  for (const inv of invoices) {
    await tx.auditLog.create({
      data: {
        action: config.updatedAction,
        entityType: config.entityType,
        entityId: inv.id,
        userId,
        description: `${config.label[0].toUpperCase()}${config.label.slice(1)} ${inv.invoiceNumber} marked as unpaid (its consolidated payment with ${numbers.filter((n) => n !== inv.invoiceNumber).join(", ")} was undone)`,
        changes: JSON.stringify({
          paymentStatus: { from: "Paid", to: "Pending" },
          paidDate: { from: payment.paidDate, to: null },
          paymentReceiptKey: { from: payment.receiptKey, to: null },
          consolidatedPaymentId: paymentId,
        }),
      },
    });
  }
  return { invoiceNumbers: numbers };
}

export { Rollback as ConsolidatedRollback };

/**
 * Whether an invoice is in a consolidated payment - its vendor can't change
 * then, or the payment would pay two vendors.
 */
export async function isInConsolidatedPayment(
  kind: DepositInvoiceKind,
  invoiceId: string,
): Promise<boolean> {
  const item = await prisma.vendorConsolidatedPaymentItem.findUnique({
    where:
      kind === "hardware"
        ? { hardwarePurchaseId: invoiceId }
        : { vendorInvoiceId: invoiceId },
    select: { id: true },
  });
  return !!item;
}

import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

/**
 * Security deposits that vendors hold for us.
 *
 * A deposit is part of a Hardware Purchase invoice (securityDeposit, inside
 * totalAmount). It leaves the vendor in two ways (vendor_deposit_movements):
 * - RETURN: the vendor pays it back in cash.
 * - ADJUSTMENT: the vendor applies it to one of its Pending Farm Tariff or
 *   Hardware Purchase invoices, which lowers that invoice's cash due (the
 *   payment parts then cover total - adjustments).
 *
 * Per vendor, in USD:
 * - pending: deposits on Pending invoices (not with the vendor yet)
 * - paid: deposits on Paid invoices
 * - held = paid - returned - adjusted: what the vendor has now, and the
 *   most a new return or adjustment can take
 * - outstanding = pending + held: the admin panel's Security Deposit card
 */

export type DepositInvoiceKind = "hardware" | "farm";

type Tx = Prisma.TransactionClient;

export interface DepositBalance {
  pending: Decimal;
  paid: Decimal;
  returned: Decimal;
  adjusted: Decimal;
  held: Decimal;
  outstanding: Decimal;
}

const ZERO = new Decimal(0);

/** held and outstanding from the four sums. */
export function computeDepositBalance(sums: {
  pending: Decimal;
  paid: Decimal;
  returned: Decimal;
  adjusted: Decimal;
}): DepositBalance {
  const held = sums.paid.minus(sums.returned).minus(sums.adjusted);
  return { ...sums, held, outstanding: sums.pending.plus(held) };
}

/** Balances of every vendor with any deposit activity, keyed by vendorId. */
export async function getDepositBalances(
  db: Tx = prisma,
  vendorId?: string,
): Promise<Map<string, DepositBalance>> {
  const [invoices, movements] = await Promise.all([
    db.hardwarePurchaseInvoice.groupBy({
      by: ["vendorId", "paymentStatus"],
      where: {
        securityDeposit: { gt: 0 },
        paymentStatus: { in: ["Pending", "Paid"] },
        ...(vendorId ? { vendorId } : {}),
      },
      _sum: { securityDeposit: true },
    }),
    db.vendorDepositMovement.groupBy({
      by: ["vendorId", "type"],
      where: vendorId ? { vendorId } : undefined,
      _sum: { amountUsd: true },
    }),
  ]);

  const sums = new Map<
    string,
    { pending: Decimal; paid: Decimal; returned: Decimal; adjusted: Decimal }
  >();
  const entry = (id: string) => {
    let s = sums.get(id);
    if (!s) {
      s = { pending: ZERO, paid: ZERO, returned: ZERO, adjusted: ZERO };
      sums.set(id, s);
    }
    return s;
  };
  for (const row of invoices) {
    const s = entry(row.vendorId);
    const amount = row._sum.securityDeposit ?? ZERO;
    if (row.paymentStatus === "Paid") s.paid = s.paid.plus(amount);
    else s.pending = s.pending.plus(amount);
  }
  for (const row of movements) {
    const s = entry(row.vendorId);
    const amount = row._sum.amountUsd ?? ZERO;
    if (row.type === "RETURN") s.returned = s.returned.plus(amount);
    else s.adjusted = s.adjusted.plus(amount);
  }

  return new Map(
    [...sums].map(([id, s]) => [id, computeDepositBalance(s)] as const),
  );
}

/** One vendor's balance (all zero when it has no deposit activity). */
export async function getVendorDepositBalance(
  db: Tx,
  vendorId: string,
): Promise<DepositBalance> {
  return (
    (await getDepositBalances(db, vendorId)).get(vendorId) ??
    computeDepositBalance({
      pending: ZERO,
      paid: ZERO,
      returned: ZERO,
      adjusted: ZERO,
    })
  );
}

/**
 * Locks the vendor row until the transaction ends, so two concurrent
 * returns/adjustments can't both pass the "held" check and overdraw it.
 */
export async function lockVendor(tx: Tx, vendorId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "accounting_vendors" WHERE "id" = ${vendorId} FOR UPDATE`;
}

const invoiceWhere = (kind: DepositInvoiceKind, invoiceId: string) =>
  kind === "hardware"
    ? { hardwarePurchaseId: invoiceId }
    : { vendorInvoiceId: invoiceId };

/** Deposit already applied to one invoice. */
export async function adjustedOnInvoice(
  db: Tx,
  kind: DepositInvoiceKind,
  invoiceId: string,
): Promise<Decimal> {
  const agg = await db.vendorDepositMovement.aggregate({
    where: { type: "ADJUSTMENT", ...invoiceWhere(kind, invoiceId) },
    _sum: { amountUsd: true },
  });
  return agg._sum.amountUsd ?? ZERO;
}

/**
 * Checks a new deposit adjustment against its invoice and the vendor's held
 * deposit. Pure, so the rules are unit-tested.
 */
export function checkAdjustment({
  amountUsd,
  held,
  invoice,
  depositVendorId,
  alreadyAdjusted,
}: {
  amountUsd: Decimal;
  held: Decimal;
  invoice: {
    paymentStatus: string;
    vendorId: string | null;
    totalAmount: Decimal;
  };
  depositVendorId: string;
  alreadyAdjusted: Decimal;
}): string | null {
  if (amountUsd.lessThanOrEqualTo(0) || amountUsd.decimalPlaces() > 2) {
    return "Amount must be greater than 0 (up to 2 decimal places)";
  }
  if (invoice.paymentStatus !== "Pending") {
    return "A deposit can only be applied to a Pending invoice";
  }
  if (invoice.vendorId !== depositVendorId) {
    return "The invoice belongs to a different vendor";
  }
  const remaining = invoice.totalAmount.minus(alreadyAdjusted);
  if (amountUsd.greaterThan(remaining)) {
    return `Only $${remaining.toFixed(2)} of this invoice is still due`;
  }
  if (amountUsd.greaterThan(held)) {
    return `The vendor holds only $${held.toFixed(2)} of deposit`;
  }
  return null;
}

/** Checks a new deposit return against the vendor's held deposit. */
export function checkReturn(amountUsd: Decimal, held: Decimal): string | null {
  if (amountUsd.lessThanOrEqualTo(0)) {
    return "Amount must be greater than 0";
  }
  if (amountUsd.greaterThan(held)) {
    return `The vendor holds only $${held.toFixed(2)} of deposit`;
  }
  return null;
}

/**
 * Records a deposit adjustment inside the caller's transaction: locks the
 * vendor, re-reads the invoice and balances, checks the rules and creates
 * the row. Returns the invoice's cash still due after it. When markPaid is
 * set and nothing is left to pay, the invoice is marked Paid on `date`
 * (fully covered by deposit, so there is no cash payment or receipt).
 */
export async function recordAdjustment(
  tx: Tx,
  {
    kind,
    invoiceId,
    vendorId,
    amountUsd,
    date,
    note,
    userId,
    markPaidWhenCovered,
  }: {
    kind: DepositInvoiceKind;
    invoiceId: string;
    vendorId: string;
    amountUsd: Decimal;
    date: Date;
    note: string | null;
    userId: string;
    markPaidWhenCovered: boolean;
  },
): Promise<
  | { movementId: string; remainingDue: Decimal; markedPaid: boolean }
  | { error: string }
> {
  await lockVendor(tx, vendorId);

  const invoice =
    kind === "hardware"
      ? await tx.hardwarePurchaseInvoice.findUnique({
          where: { id: invoiceId },
          select: { paymentStatus: true, vendorId: true, totalAmount: true },
        })
      : await tx.vendorInvoice.findUnique({
          where: { id: invoiceId },
          select: { paymentStatus: true, vendorId: true, totalAmount: true },
        });
  if (!invoice) return { error: "Invoice not found" };

  const [balance, alreadyAdjusted] = await Promise.all([
    getVendorDepositBalance(tx, vendorId),
    adjustedOnInvoice(tx, kind, invoiceId),
  ]);
  const error = checkAdjustment({
    amountUsd,
    held: balance.held,
    invoice,
    depositVendorId: vendorId,
    alreadyAdjusted,
  });
  if (error) return { error };

  const movement = await tx.vendorDepositMovement.create({
    data: {
      vendorId,
      type: "ADJUSTMENT",
      date,
      amountUsd,
      note,
      createdBy: userId,
      ...invoiceWhere(kind, invoiceId),
    },
  });

  const remainingDue = invoice.totalAmount
    .minus(alreadyAdjusted)
    .minus(amountUsd);
  let markedPaid = false;
  if (markPaidWhenCovered && remainingDue.isZero()) {
    const data = {
      paymentStatus: "Paid" as const,
      paidDate: date,
      updatedBy: userId,
    };
    const where = { id: invoiceId, paymentStatus: "Pending" as const };
    const { count } =
      kind === "hardware"
        ? await tx.hardwarePurchaseInvoice.updateMany({ where, data })
        : await tx.vendorInvoice.updateMany({ where, data });
    markedPaid = count === 1;
  }

  return { movementId: movement.id, remainingDue, markedPaid };
}

/**
 * Block reason for changes to an invoice that has deposit adjustments, or
 * null. Covers cancel, delete, vendor change and lowering the total below
 * what was already applied.
 */
export function checkInvoiceChangeWithAdjustments(
  adjusted: Decimal,
  change: {
    cancel?: boolean;
    remove?: boolean;
    vendorChanged?: boolean;
    newTotal?: Decimal | number;
  },
): string | null {
  if (adjusted.isZero()) return null;
  if (change.remove) {
    return "This invoice has security deposit applied to it. Delete those adjustments first.";
  }
  if (change.cancel) {
    return "This invoice has security deposit applied to it. Delete those adjustments before cancelling.";
  }
  if (change.vendorChanged) {
    return "The vendor can't change while security deposit is applied to this invoice.";
  }
  if (
    change.newTotal !== undefined &&
    new Decimal(change.newTotal).lessThan(adjusted)
  ) {
    return `The total can't be less than the $${adjusted.toFixed(2)} of deposit applied to it.`;
  }
  return null;
}

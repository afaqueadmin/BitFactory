import { Prisma, VendorPaymentStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { deleteObject } from "@/lib/storage/r2";

/**
 * Rules shared by Farm Tariff (VendorInvoice) and Hardware Purchase
 * (HardwarePurchaseInvoice) invoices, whose payment flows are the same.
 */

/** Payment account relations returned with a vendor-side invoice. */
export const vendorPaymentInclude = {
  paymentEntity: { select: { id: true, name: true } },
  paymentBank: { select: { id: true, name: true } },
  paymentCurrency: { select: { id: true, code: true, name: true } },
} satisfies Prisma.VendorInvoiceInclude & Prisma.HardwarePurchaseInvoiceInclude;

// Compared at the columns' 2-decimal scale: the edit modals recompute the
// total in floating point (e.g. 75 * 12.34 = 925.4999999999999).
const sameAmount = (a: number, b: Decimal | number) =>
  new Decimal(a)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .equals(new Decimal(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));

const sameDate = (a: string | null, b: Date | null) =>
  (a ? new Date(a).getTime() : null) === (b ? b.getTime() : null);

/**
 * Checks a generic PUT on a vendor-side invoice. Returns an error message,
 * or null when the update is allowed.
 *
 * - Paid is reached only through record-payment, and is final.
 * - The paid date is set by record-payment, not here.
 * - On a Paid invoice the amounts are locked, so they keep matching the
 *   recorded payment (D8). The edit modals re-send the current status,
 *   paid date and amounts on every save, so unchanged values pass.
 */
export function checkVendorInvoiceUpdate(
  existing: {
    paymentStatus: VendorPaymentStatus;
    paidDate: Date | null;
    amounts: Record<string, Decimal | number>;
  },
  body: {
    paymentStatus?: VendorPaymentStatus;
    paidDate?: string | null;
    amounts: Record<string, number | undefined>;
  },
): string | null {
  const isPaid = existing.paymentStatus === "Paid";

  if (
    body.paymentStatus !== undefined &&
    body.paymentStatus !== existing.paymentStatus
  ) {
    if (body.paymentStatus === "Paid") {
      return "Use Record Payment to mark this invoice as paid";
    }
    if (isPaid) {
      return "A paid invoice's status can't be changed";
    }
  }

  if (
    body.paidDate !== undefined &&
    !sameDate(body.paidDate, existing.paidDate)
  ) {
    return "The paid date is set when the payment is recorded";
  }

  if (isPaid) {
    for (const [field, value] of Object.entries(body.amounts)) {
      if (value !== undefined && !sameAmount(value, existing.amounts[field])) {
        return "Amounts on a paid invoice can't be changed";
      }
    }
  }

  return null;
}

/**
 * Deletes an invoice's PDFs from R2 before the row is deleted (D9). Throws
 * if any delete fails, so the caller keeps the invoice. Retrying is safe:
 * deleting a key that's already gone succeeds.
 */
export async function deleteInvoicePdfs(
  keys: (string | null | undefined)[],
): Promise<void> {
  for (const key of keys) {
    if (key) await deleteObject(key);
  }
}

export const PDF_DELETE_FAILED_MESSAGE =
  "Couldn't delete the invoice PDF. The invoice was not deleted";

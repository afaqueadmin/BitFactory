import { Decimal } from "@prisma/client/runtime/library";
import {
  auditPart,
  feesUsdUnrounded,
  matchesInvoiceTotal,
  parseDecimal,
  parsePaymentParts,
  ParsedPaymentPart,
  PaymentPartRequest,
  partsUsdUnrounded,
} from "@/lib/accounting/paymentAccount";
import { PdfPurpose, verifyUploadedPdf } from "@/lib/storage/r2";

/**
 * Body of POST /api/{vendor-invoices|hardware-purchases}/[id]/record-payment.
 * A payment is one or more currency parts, each with its own account, rate,
 * amount and fee (in that part's currency).
 */
export interface RecordVendorPaymentRequest {
  paidDate?: unknown;
  parts?: (PaymentPartRequest & { transactionFee?: unknown })[];
  receiptKey?: unknown;
}

/** Columns written on the invoice when it is marked Paid. */
export interface VendorPaymentData {
  paymentStatus: "Paid";
  paidDate: Date;
  paymentReceiptKey: string;
}

/**
 * A VendorPaymentPart row, without its parent id (the route sets
 * vendorInvoiceId or hardwarePurchaseId).
 */
export interface VendorPaymentPartData {
  entityId: string;
  bankId: string;
  currencyId: string;
  amount: Decimal;
  exchangeRate: Decimal;
  amountUsd: Decimal;
  transactionFee: Decimal;
  sortOrder: number;
}

/**
 * Validates a vendor-side payment against its invoice and builds the
 * invoice update plus its VendorPaymentPart rows. Every field is required.
 * The parts' amounts converted at their rates must together equal the USD
 * invoice total plus the fees (each converted at its part's rate) within
 * $0.01 (D8): the amount paid includes the transaction fee.
 *
 * Payment details live only in the parts. The invoice's single-currency
 * payment columns (paymentEntityId .. transactionFee) are deprecated and
 * no longer written; see the schema note.
 */
export async function parseVendorPayment(
  body: RecordVendorPaymentRequest,
  invoiceTotalUsd: Decimal,
  receiptPurpose: PdfPurpose,
): Promise<
  | {
      data: VendorPaymentData;
      parts: VendorPaymentPartData[];
      totalUsd: Decimal;
      audit: Record<string, unknown>;
    }
  | { error: string }
> {
  const paidDate =
    typeof body.paidDate === "string" && body.paidDate
      ? new Date(body.paidDate)
      : null;
  if (!paidDate || Number.isNaN(paidDate.getTime())) {
    return { error: "Paid date is required" };
  }

  const parsed = await parsePaymentParts(body.parts);
  if ("error" in parsed) return parsed;
  const parts: ParsedPaymentPart[] = parsed.parts;

  // One fee per part, in that part's currency.
  const fees: Decimal[] = [];
  for (const [i, raw] of (body.parts ?? []).entries()) {
    const fee = parseDecimal(raw?.transactionFee, { allowZero: true });
    if (!fee || fee.decimalPlaces() > 2) {
      const prefix = parts.length > 1 ? `Part ${i + 1}: ` : "";
      return {
        error:
          prefix + "Transaction fee must be 0 or more (up to 2 decimal places)",
      };
    }
    fees.push(fee);
  }

  // The amount paid covers the invoice and the fees on top of it.
  const feesUsd = feesUsdUnrounded(
    parts.map((p, i) => ({ fee: fees[i], rate: p.rate })),
  );
  const targetUsd = invoiceTotalUsd.plus(feesUsd);
  if (!matchesInvoiceTotal(parts, targetUsd)) {
    const cents = (v: Decimal) =>
      v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
    return {
      error: feesUsd.isZero()
        ? `The amount paid must match the invoice total within $0.01: ${cents(partsUsdUnrounded(parts))} USD entered, ${cents(invoiceTotalUsd)} USD due`
        : `The amount paid must equal the cash due plus transaction fees within $0.01: ${cents(partsUsdUnrounded(parts))} USD entered, ${cents(invoiceTotalUsd)} USD due + ${cents(feesUsd)} USD fees = ${cents(targetUsd)} USD`,
    };
  }

  const receipt = await verifyUploadedPdf(body.receiptKey, receiptPurpose);
  if (!receipt.ok) {
    return {
      error: body.receiptKey
        ? receipt.error
        : "The payment receipt PDF is required",
    };
  }

  const totalUsd = parts.reduce((sum, p) => sum.plus(p.usd), new Decimal(0));

  return {
    data: {
      paymentStatus: "Paid",
      paidDate,
      paymentReceiptKey: receipt.key,
    },
    parts: parts.map((p, i) => ({
      entityId: p.entityId,
      bankId: p.bankId,
      currencyId: p.currencyId,
      amount: p.amount,
      exchangeRate: p.rate,
      amountUsd: p.usd,
      transactionFee: fees[i],
      sortOrder: i,
    })),
    totalUsd,
    audit: {
      paidDate,
      parts: parts.map((p, i) => ({
        ...auditPart(p),
        transactionFee: fees[i].toString(),
      })),
      totalUsd: totalUsd.toString(),
      feesUsd: feesUsd.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString(),
      paymentReceiptKey: receipt.key,
    },
  };
}

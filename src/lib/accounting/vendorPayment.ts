import { Decimal } from "@prisma/client/runtime/library";
import {
  matchesInvoiceTotal,
  parseDecimal,
  toUsd,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import { PdfPurpose, verifyUploadedPdf } from "@/lib/storage/r2";

/** Body of POST /api/{vendor-invoices|hardware-purchases}/[id]/record-payment. */
export interface RecordVendorPaymentRequest {
  paidDate?: unknown;
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  exchangeRate?: unknown;
  paymentAmount?: unknown;
  transactionFee?: unknown;
  receiptKey?: unknown;
}

/** Columns written when a vendor-side invoice is marked Paid. */
export interface VendorPaymentData {
  paymentStatus: "Paid";
  paidDate: Date;
  paymentEntityId: string;
  paymentBankId: string;
  paymentCurrencyId: string;
  paymentAmount: Decimal;
  paymentExchangeRate: Decimal;
  paymentAmountUsd: Decimal;
  transactionFee: Decimal;
  paymentReceiptKey: string;
}

/**
 * Validates a vendor-side payment against its invoice and builds the update.
 * Every field is required. The amount (in the payment currency) converted at
 * the rate must equal the USD invoice total within $0.01 (D8); the fee is
 * stored for reference only and isn't part of that check.
 */
export async function parseVendorPayment(
  body: RecordVendorPaymentRequest,
  invoiceTotalUsd: Decimal,
  receiptPurpose: PdfPurpose,
): Promise<{ data: VendorPaymentData } | { error: string }> {
  const paidDate =
    typeof body.paidDate === "string" && body.paidDate
      ? new Date(body.paidDate)
      : null;
  if (!paidDate || Number.isNaN(paidDate.getTime())) {
    return { error: "Paid date is required" };
  }

  const rate = parseDecimal(body.exchangeRate);
  if (!rate || rate.decimalPlaces() > 8) {
    return {
      error: "Exchange rate must be greater than 0 (up to 8 decimal places)",
    };
  }
  const amount = parseDecimal(body.paymentAmount);
  if (!amount || amount.decimalPlaces() > 2) {
    return {
      error: "Amount paid must be greater than 0 (up to 2 decimal places)",
    };
  }
  const fee = parseDecimal(body.transactionFee, { allowZero: true });
  if (!fee || fee.decimalPlaces() > 2) {
    return {
      error: "Transaction fee must be 0 or more (up to 2 decimal places)",
    };
  }

  const account = await validatePaymentAccount({
    entityId: body.entityId,
    bankId: body.bankId,
    currencyId: body.currencyId,
  });
  if ("error" in account) return account;
  if (account.currencyCode === "USD" && !rate.equals(1)) {
    return { error: "USD payments must use an exchange rate of 1" };
  }

  if (!matchesInvoiceTotal(amount, rate, invoiceTotalUsd)) {
    const needed = invoiceTotalUsd
      .times(rate)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      error: `Amount paid must match the invoice total: ${needed.toFixed(2)} ${account.currencyCode} at this rate (${toUsd(amount, rate).toFixed(2)} USD entered, ${invoiceTotalUsd.toFixed(2)} USD due)`,
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

  return {
    data: {
      paymentStatus: "Paid",
      paidDate,
      // validatePaymentAccount has checked these are non-empty strings.
      paymentEntityId: body.entityId as string,
      paymentBankId: body.bankId as string,
      paymentCurrencyId: body.currencyId as string,
      paymentAmount: amount,
      paymentExchangeRate: rate,
      paymentAmountUsd: toUsd(amount, rate),
      transactionFee: fee,
      paymentReceiptKey: receipt.key,
    },
  };
}

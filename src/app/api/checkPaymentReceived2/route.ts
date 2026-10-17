import { NextRequest, NextResponse } from "next/server";
import { AuditAction, InvoiceStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findMatchingBinancePayment } from "@/lib/binance";
import { getInvoiceForPayer } from "@/lib/accounting/invoicePayerAccess";
import { paymentTypeForInvoice } from "@/lib/accounting/paymentTypes";
import { sendInvoicePaymentReceivedEmail } from "@/lib/email";

export const runtime = "nodejs";

// Allows for clock drift between our server and Binance timestamps.
const CLOCK_SKEW_MS = 2 * 60 * 1000;

/** GET ?invoiceId= → { paid } — matches incoming Binance USDT to the invoice. */
export async function GET(req: NextRequest) {
  const access = await getInvoiceForPayer(
    req,
    req.nextUrl.searchParams.get("invoiceId"),
  );
  if ("error" in access) return access.error;
  const { invoice, userId } = access;

  if (invoice.status === InvoiceStatus.PAID) {
    return NextResponse.json({ paid: true });
  }
  if (!invoice.binanceCheckoutStartedAt) {
    return NextResponse.json({ paid: false });
  }

  let match;
  try {
    match = await findMatchingBinancePayment(
      invoice.totalAmount,
      new Date(invoice.binanceCheckoutStartedAt.getTime() - CLOCK_SKEW_MS),
    );
  } catch (error) {
    console.error("Binance payment check failed:", error);
    return NextResponse.json(
      { error: "Could not reach Binance" },
      { status: 502 },
    );
  }
  if (!match) return NextResponse.json({ paid: false });

  const source =
    match.source === "PAY" ? "Binance Pay" : `USDT ${match.network}`;
  const amount = match.amount.toNumber();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: InvoiceStatus.PAID } },
        data: {
          status: InvoiceStatus.PAID,
          paidDate: match.time,
          binanceTxId: match.txId,
        },
      });
      if (count === 0) return false;

      await tx.costPayment.create({
        data: {
          userId: invoice.userId,
          invoiceId: invoice.id,
          amount,
          originalAmount: match.amount,
          exchangeRate: new Prisma.Decimal(1),
          paymentDate: match.time,
          type: paymentTypeForInvoice(invoice.invoiceType),
          consumption: 0,
          narration: `Binance ${source} ${match.txId}`,
          entityId: process.env.BINANCE_PAYMENT_ENTITY_ID || null,
          bankId: process.env.BINANCE_PAYMENT_BANK_ID || null,
          currencyId: process.env.BINANCE_PAYMENT_CURRENCY_ID || null,
        },
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.PAYMENT_ADDED,
          entityType: "Invoice",
          entityId: invoice.id,
          userId,
          description: `Binance payment of ${amount.toFixed(2)} USDT received for invoice ${invoice.invoiceNumber}`,
          changes: {
            source: match.source,
            network: match.network ?? null,
            binanceTxId: match.txId,
            amount: match.amount.toString(),
            receivedAt: match.time.toISOString(),
          },
        },
      });
      return true;
    });

    if (!updated) return NextResponse.json({ paid: true });
  } catch (error) {
    // Another invoice claimed this transfer first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ paid: false });
    }
    throw error;
  }

  const customer = await prisma.user.findUnique({
    where: { id: invoice.userId },
    select: { email: true },
  });
  if (customer?.email) {
    void sendInvoicePaymentReceivedEmail(
      customer.email,
      invoice.invoiceNumber,
      amount,
      source,
    );
  }

  return NextResponse.json({ paid: true, amount, source });
}

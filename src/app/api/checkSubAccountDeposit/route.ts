import { NextRequest, NextResponse } from "next/server";
import { AuditAction, InvoiceStatus, Prisma } from "@prisma/client";
import type { Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { binanceRequest } from "@/lib/binance";
import { getInvoiceForPayer } from "@/lib/accounting/invoicePayerAccess";
import { getUserBinanceSubaccount } from "@/lib/binanceSubaccounts";
import { paymentTypeForInvoice } from "@/lib/accounting/paymentTypes";
import {
  sendBinanceOverpaymentEmail,
  sendInvoicePaymentReceivedEmail,
} from "@/lib/email";

export const runtime = "nodejs";

const ALLOWED_NETWORKS = ["ETH", "TRX"] as const;
const ALLOWED_COINS = ["USDT", "USDC"] as const;

// Deposit status 1 = success, 6 = credited but not yet withdrawable.
const CREDITED_DEPOSIT_STATUSES = [1, 6];

// Look back a little before checkout started, in case our clock and Binance's
// disagree or the customer sent funds right as checkout opened.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

// A deposit pays the invoice if it is at least the invoice total and at most
// this much over it (customers sometimes round up or cover fees). A deposit
// above that sets the invoice to PROCESSING for accounts to settle by hand.
const OVERPAYMENT_TOLERANCE = new Prisma.Decimal(10);

interface SubAccountDeposit {
  id: number;
  amount: string;
  coin: string;
  network: string;
  status: number;
  address: string;
  addressTag: string;
  txId: string;
  insertTime: number;
  confirmTimes: string;
}

/**
 * GET ?invoiceId=&coin=&network= → { paid, deposits }
 *
 * Polls Binance sub-account deposit history for deposits made since the
 * invoice's Binance checkout started (minus CLOCK_SKEW_MS). The earliest
 * unused credited deposit between the invoice total and total + 10 marks the
 * invoice PAID; its id is stored in binanceTxId so it can't pay another invoice.
 *
 * If there is no such deposit but an unused one above total + 10 exists, the
 * invoice becomes PROCESSING instead: no cost payment is recorded, the deposit
 * id is still claimed in binanceTxId, and the accounts team is emailed to mark
 * it paid and add the payment manually. Returns { processing: true } then.
 */
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const access = await getInvoiceForPayer(req, searchParams.get("invoiceId"));
  if ("error" in access) return access.error;
  const { invoice, userId } = access;

  const coin = (searchParams.get("coin") ?? "USDT").toUpperCase();
  const network = (searchParams.get("network") ?? "TRX").toUpperCase();

  if (!ALLOWED_COINS.includes(coin as (typeof ALLOWED_COINS)[number])) {
    return NextResponse.json(
      { error: `coin must be one of ${ALLOWED_COINS.join(", ")}` },
      { status: 400 },
    );
  }
  if (
    !ALLOWED_NETWORKS.includes(network as (typeof ALLOWED_NETWORKS)[number])
  ) {
    return NextResponse.json(
      { error: `network must be one of ${ALLOWED_NETWORKS.join(", ")}` },
      { status: 400 },
    );
  }
  if (invoice.status === InvoiceStatus.PAID) {
    return NextResponse.json({ paid: true, deposits: [] });
  }
  if (invoice.status === InvoiceStatus.PROCESSING) {
    return NextResponse.json({ paid: false, processing: true, deposits: [] });
  }

  // Same sub-account the checkout showed: the invoice customer's.
  const sub = await getUserBinanceSubaccount(invoice.userId, coin);
  if (!sub) {
    return NextResponse.json(
      { error: "No Binance sub-account for this customer" },
      { status: 409 },
    );
  }
  const email = sub.binanceSubaccountEmail;
  if (!invoice.binanceCheckoutStartedAt) {
    return NextResponse.json({ paid: false, deposits: [] });
  }

  const startTime = invoice.binanceCheckoutStartedAt.getTime() - CLOCK_SKEW_MS;

  let deposits: SubAccountDeposit[];
  try {
    deposits = await binanceRequest<SubAccountDeposit[]>(
      "GET",
      "/sapi/v1/capital/deposit/subHisrec",
      { email, coin, network, startTime, limit: 500 },
    );

    console.log("deposits", deposits);
  } catch (error) {
    console.error("Binance sub-account deposit check failed:", error);
    return NextResponse.json(
      { error: "Could not reach Binance" },
      { status: 502 },
    );
  }

  const credited = deposits.filter((d) =>
    CREDITED_DEPOSIT_STATUSES.includes(d.status),
  );

  const minAmount = invoice.totalAmount;
  const maxAmount = invoice.totalAmount.plus(OVERPAYMENT_TOLERANCE);
  const byTime = (a: SubAccountDeposit, b: SubAccountDeposit) =>
    a.insertTime - b.insertTime;
  const candidates = credited
    .filter((d) => {
      const amount = new Prisma.Decimal(d.amount);
      return amount.gte(minAmount) && amount.lte(maxAmount);
    })
    .sort(byTime);
  const overpayments = credited
    .filter((d) => new Prisma.Decimal(d.amount).gt(maxAmount))
    .sort(byTime);

  // Skip deposits already claimed by an invoice (paid or processing).
  const used = await prisma.invoice.findMany({
    where: {
      binanceTxId: {
        in: [...candidates, ...overpayments].map(subDepositTxId),
      },
    },
    select: { binanceTxId: true },
  });
  const usedIds = new Set(used.map((u) => u.binanceTxId));
  const match = candidates.find((d) => !usedIds.has(subDepositTxId(d)));
  // Only when nothing pays the invoice outright.
  const overpayment = match
    ? undefined
    : overpayments.find((d) => !usedIds.has(subDepositTxId(d)));

  let paid = false;
  if (match) {
    const txId = subDepositTxId(match);
    const receivedAt = new Date(match.insertTime);
    const originalAmount = new Prisma.Decimal(match.amount);
    const amount = originalAmount.toNumber();
    const source = `${match.coin} ${match.network}`;

    try {
      // false when another poll already marked this invoice paid.
      const updated = await prisma.$transaction(async (tx) => {
        const { count } = await tx.invoice.updateMany({
          where: {
            id: invoice.id,
            status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.PROCESSING] },
          },
          data: {
            status: InvoiceStatus.PAID,
            paidDate: receivedAt,
            binanceTxId: txId,
          },
        });
        if (count === 0) return false;

        await tx.costPayment.create({
          data: {
            userId: invoice.userId,
            invoiceId: invoice.id,
            amount,
            originalAmount,
            exchangeRate: new Prisma.Decimal(1),
            paymentDate: receivedAt,
            type: paymentTypeForInvoice(invoice.invoiceType),
            consumption: 0,
            narration: `Binance ${source} ${txId}`,
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
            description: `Binance payment of ${amount.toFixed(2)} ${match.coin} received for invoice ${invoice.invoiceNumber}`,
            changes: {
              source: "SUB_ACCOUNT_DEPOSIT",
              network: match.network,
              binanceTxId: txId,
              onChainTxId: match.txId,
              amount: match.amount,
              receivedAt: receivedAt.toISOString(),
            },
          },
        });
        return true;
      });
      paid = true;

      if (updated) {
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
      }
    } catch (error) {
      // Another invoice claimed this deposit first.
      if (!(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )) {
        throw error;
      }
    }
  }

  let processing = false;
  if (overpayment) {
    processing = await markOverpaymentProcessing(invoice, overpayment, userId);
  }

  return NextResponse.json({
    paid,
    processing,
    deposits: credited.map((d) => ({
      id: d.id,
      txId: d.txId,
      amount: d.amount,
      coin: d.coin,
      network: d.network,
      status: d.status,
      receivedAt: new Date(d.insertTime).toISOString(),
    })),
  });
}

/**
 * Sets the invoice to PROCESSING for a deposit above total + tolerance,
 * claims the deposit id and stores the amount and time received, without
 * recording a cost payment, then emails the accounts team. Returns false if
 * the deposit or invoice was already claimed.
 */
async function markOverpaymentProcessing(
  invoice: Invoice,
  deposit: SubAccountDeposit,
  userId: string,
): Promise<boolean> {
  const txId = subDepositTxId(deposit);
  const receivedAt = new Date(deposit.insertTime);

  let updated: boolean;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.PROCESSING] },
        },
        data: {
          status: InvoiceStatus.PROCESSING,
          binanceTxId: txId,
          binanceReceivedAmount: new Prisma.Decimal(deposit.amount),
          binanceReceivedAt: receivedAt,
        },
      });
      if (count === 0) return false;

      await tx.auditLog.create({
        data: {
          action: AuditAction.INVOICE_UPDATED,
          entityType: "Invoice",
          entityId: invoice.id,
          userId,
          description: `Binance deposit of ${deposit.amount} ${deposit.coin} for invoice ${invoice.invoiceNumber} is over the total + ${OVERPAYMENT_TOLERANCE.toFixed(2)} tolerance; set to PROCESSING for manual review`,
          changes: {
            source: "SUB_ACCOUNT_DEPOSIT",
            status: { from: invoice.status, to: InvoiceStatus.PROCESSING },
            network: deposit.network,
            binanceTxId: txId,
            onChainTxId: deposit.txId,
            amount: deposit.amount,
            invoiceTotal: invoice.totalAmount.toFixed(2),
            receivedAt: receivedAt.toISOString(),
          },
        },
      });
      return true;
    });
  } catch (error) {
    // Another invoice claimed this deposit first.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return false;
    }
    throw error;
  }

  if (updated) {
    const customer = await prisma.user.findUnique({
      where: { id: invoice.userId },
      select: { name: true, email: true },
    });
    void sendBinanceOverpaymentEmail({
      invoiceNumber: invoice.invoiceNumber,
      customerName: customer?.name ?? null,
      customerEmail: customer?.email ?? invoice.userId,
      invoiceTotal: invoice.totalAmount.toFixed(2),
      amountPaid: deposit.amount,
      coin: deposit.coin,
      network: deposit.network,
      binanceTxId: txId,
      onChainTxId: deposit.txId,
      receivedAt,
    });
  }
  return updated;
}

/** Binance's deposit id, prefixed so it can't collide with main-account ids. */
function subDepositTxId(d: SubAccountDeposit): string {
  return `SUBDEPOSIT:${d.id}`;
}

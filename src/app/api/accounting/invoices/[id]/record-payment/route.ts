import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";
import {
  parseDecimal,
  toUsd,
  validatePaymentAccount,
} from "@/lib/accounting/paymentAccount";
import { costPaymentAccountInclude } from "@/lib/accounting/costPaymentAccounts";

/** An entered amount: 0 or more, at most 2 decimal places (0 when blank). */
function parseEnteredAmount(value: unknown): Decimal | null {
  if (value === undefined || value === null || value === "") {
    return new Decimal(0);
  }
  const parsed = parseDecimal(value, { allowZero: true });
  return parsed && parsed.decimalPlaces() <= 2 ? parsed : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can record payments" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      amountPaid,
      paymentDate,
      notes,
      hostingAmountPaid,
      hostingNotes,
      markAsPaid,
      entityId,
      bankId,
      currencyId,
      exchangeRate,
    } = body;

    const receivedOn =
      typeof paymentDate === "string" && paymentDate
        ? new Date(paymentDate)
        : null;
    if (!receivedOn || Number.isNaN(receivedOn.getTime())) {
      return NextResponse.json(
        { error: "Payment date is required" },
        { status: 400 },
      );
    }

    // Receiving account and currency are required on every payment,
    // including a zero-amount "Mark as Paid".
    const account = await validatePaymentAccount({
      entityId,
      bankId,
      currencyId,
    });
    if ("error" in account) {
      return NextResponse.json({ error: account.error }, { status: 400 });
    }
    const rate = parseDecimal(exchangeRate);
    if (!rate || rate.decimalPlaces() > 8) {
      return NextResponse.json(
        {
          error:
            "Exchange rate must be greater than 0 (up to 8 decimal places)",
        },
        { status: 400 },
      );
    }
    if (account.currencyCode === "USD" && !rate.equals(1)) {
      return NextResponse.json(
        { error: "USD payments must use an exchange rate of 1" },
        { status: 400 },
      );
    }

    // Get invoice
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        costPayments: true,
        lineItems: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Validate invoice can accept payment
    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      return NextResponse.json(
        {
          error: `Cannot record payment for ${invoice.status.toLowerCase()} invoices`,
        },
        { status: 400 },
      );
    }

    // Hardware-sales invoices that also bill first-month Hosting & Colocation
    // record two separate CostPayment entries (Hardware Sales Payment +
    // Hosting and Colocation Payment). Invoices without a hosting line item
    // (including every invoice created before this feature) keep the
    // original single "Amount Paid" behavior untouched.
    const hasHosting = invoice.lineItems.some(
      (li) => li.lineItemType === "HOSTING_COLOCATION",
    );

    // Amounts are entered in the selected currency; balances stay in USD.
    const hardwareOriginal = parseEnteredAmount(amountPaid);
    const hostingOriginal = hasHosting
      ? parseEnteredAmount(hostingAmountPaid)
      : new Decimal(0);
    if (!hardwareOriginal || !hostingOriginal) {
      return NextResponse.json(
        { error: "Amounts must be 0 or more, with up to 2 decimal places" },
        { status: 400 },
      );
    }
    const hardwareAmount = toUsd(hardwareOriginal, rate).toNumber();
    const hostingAmount = toUsd(hostingOriginal, rate).toNumber();

    if (hasHosting) {
      if (
        !markAsPaid &&
        hardwareOriginal.lessThanOrEqualTo(0) &&
        hostingOriginal.lessThanOrEqualTo(0)
      ) {
        return NextResponse.json(
          {
            error:
              "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
          },
          { status: 400 },
        );
      }
    } else if (!markAsPaid && hardwareOriginal.lessThanOrEqualTo(0)) {
      return NextResponse.json(
        { error: "Amount paid must be greater than 0" },
        { status: 400 },
      );
    }

    // Calculate outstanding balance (allow overpayment for admins). Voided
    // payments (e.g. reversed memo adjustments) don't count.
    const totalPaid = invoice.costPayments
      .filter((p) => !p.isDeleted)
      .reduce((sum, p) => sum + p.amount, 0);

    // Fields shared by every payment row created by this request.
    const accountFields = {
      entityId: entityId as string,
      bankId: bankId as string,
      currencyId: currencyId as string,
      exchangeRate: rate,
      paymentDate: receivedOn,
    };

    // Create cost payment entries with invoiceId (this replaces the old InvoicePayment table)
    const costPaymentIds: string[] = [];

    if (!hasHosting || hardwareOriginal.greaterThan(0) || markAsPaid) {
      const hardwarePayment = await prisma.costPayment.create({
        data: {
          userId: invoice.userId,
          invoiceId: id,
          amount: hardwareAmount,
          originalAmount: hardwareOriginal,
          ...accountFields,
          type:
            invoice.invoiceType === "HARDWARE_SALES"
              ? "HARDWARE_SALES"
              : "PAYMENT",
          consumption: 0,
          narration: notes || null,
        },
      });
      costPaymentIds.push(hardwarePayment.id);
    }

    if (hasHosting && (hostingOriginal.greaterThan(0) || markAsPaid)) {
      const hostingPayment = await prisma.costPayment.create({
        data: {
          userId: invoice.userId,
          invoiceId: id,
          amount: hostingAmount,
          originalAmount: hostingOriginal,
          ...accountFields,
          type: "PAYMENT",
          consumption: 0,
          narration: hostingNotes || null,
        },
      });
      costPaymentIds.push(hostingPayment.id);
    }

    // Calculate new total paid amount
    const newTotalPaid = totalPaid + hardwareAmount + hostingAmount;
    const remainingBalance = Number(invoice.totalAmount) - newTotalPaid;

    // Update invoice status if fully paid
    if (markAsPaid || remainingBalance <= 0.0) {
      // Fully paid (accounting for floating point)
      await prisma.invoice.update({
        where: { id },
        data: {
          status: "PAID",
          paidDate: receivedOn,
        },
      });
    }

    // Log audit entry
    const totalAmountPaidNow = hardwareAmount + hostingAmount;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_ADDED,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Payment of $${totalAmountPaidNow.toFixed(2)} recorded for invoice ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          amountPaid: hardwareAmount,
          ...(hasHosting ? { hostingAmountPaid: hostingAmount } : {}),
          paymentDate,
          entity: account.entityName,
          bank: account.bankName,
          currency: account.currencyCode,
          exchangeRate: rate.toString(),
          originalAmountPaid: hardwareOriginal.toString(),
          ...(hasHosting
            ? { originalHostingAmountPaid: hostingOriginal.toString() }
            : {}),
          costPaymentIds,
          isPaid: Math.abs(remainingBalance) < 0.01,
          remainingBalance: remainingBalance.toFixed(2),
        }),
      },
    });

    // Fetch and return updated invoice with all payments. This overwrites
    // the client's cached invoice (["invoice", id]) via setQueryData, so it
    // must include lineItems or the split-payment form loses its
    // hasHosting/isSplitPayment signal after a successful submission, and
    // the payment account relations or the Payments card shows "—".
    const finalInvoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        costPayments: { include: costPaymentAccountInclude },
        lineItems: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(finalInvoice);
  } catch (error) {
    console.error("Record payment error:", error);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 },
    );
  }
}

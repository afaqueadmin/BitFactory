import { isStaffRole } from "@/lib/auth/staffRoles";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, PaymentType } from "@prisma/client";
import {
  auditPart,
  ParsedPaymentPart,
  parsePaymentParts,
} from "@/lib/accounting/paymentAccount";
import { costPaymentAccountInclude } from "@/lib/accounting/costPaymentAccounts";
import { paymentTypeForInvoice } from "@/lib/accounting/paymentTypes";

const hasParts = (value: unknown) => Array.isArray(value) && value.length > 0;

const sumUsd = (parts: ParsedPaymentPart[]) =>
  parts.reduce((sum, p) => sum + p.usd.toNumber(), 0);

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

    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json(
        { error: "Only administrators can record payments" },
        { status: 403 },
      );
    }

    // parts / hostingParts: the currency parts of each section, each with
    // its own receiving account, rate and amount (see RecordPaymentInput).
    const body = await request.json();
    const {
      paymentDate,
      notes,
      hostingNotes,
      markAsPaid,
      parts,
      hostingParts,
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

    // Hardware-sales invoices that also bill Hosting & Colocation (one or more months)
    // record separate CostPayment entries for the Hardware Sales Payment and
    // the Hosting and Colocation Payment sections. Invoices without a
    // hosting line item (including every invoice created before this
    // feature) have one section.
    const hasHosting = invoice.lineItems.some(
      (li) => li.lineItemType === "HOSTING_COLOCATION",
    );

    // Which sections this payment covers. A one-section invoice always has
    // its section; on the split form an empty list leaves that section out,
    // except with Mark as Paid, which records both (as zero-amount rows).
    const sendHardware = !hasHosting || !!markAsPaid || hasParts(parts);
    const sendHosting = hasHosting && (!!markAsPaid || hasParts(hostingParts));
    if (!sendHardware && !sendHosting) {
      return NextResponse.json(
        {
          error:
            "Enter a Hardware Sales Payment amount and/or a Hosting and Colocation Payment amount greater than 0",
        },
        { status: 400 },
      );
    }

    // Every part needs a valid Entity -> Bank -> Currency and rate, including
    // the zero-amount part of a "Mark as Paid". Amounts are entered in each
    // part's currency; balances stay in USD.
    const parseSection = async (raw: unknown, label: string) => {
      const result = await parsePaymentParts(raw, {
        allowZeroAmount: !!markAsPaid,
      });
      return "error" in result && hasHosting
        ? { error: `${label}: ${result.error}` }
        : result;
    };
    let hardwareParts: ParsedPaymentPart[] = [];
    if (sendHardware) {
      const result = await parseSection(parts, "Hardware Sales Payment");
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      hardwareParts = result.parts;
    }
    let hostingPartsParsed: ParsedPaymentPart[] = [];
    if (sendHosting) {
      const result = await parseSection(
        hostingParts,
        "Hosting and Colocation Payment",
      );
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      hostingPartsParsed = result.parts;
    }

    const hardwareAmount = sumUsd(hardwareParts);
    const hostingAmount = sumUsd(hostingPartsParsed);

    // Calculate outstanding balance (allow overpayment for admins). Voided
    // payments (e.g. reversed memo adjustments) don't count.
    const totalPaid = invoice.costPayments
      .filter((p) => !p.isDeleted)
      .reduce((sum, p) => sum + p.amount, 0);

    // Calculate new total paid amount
    const newTotalPaid = totalPaid + hardwareAmount + hostingAmount;
    const remainingBalance = Number(invoice.totalAmount) - newTotalPaid;

    // One CostPayment per part with an amount. A section paid only through
    // "Mark as Paid" (nothing entered) keeps one zero-amount row, as before,
    // so its receiving account is still on record.
    const rowsFor = (
      sectionParts: ParsedPaymentPart[],
      type: PaymentType,
      narration: string | null,
    ) => {
      const withAmount = sectionParts.filter((p) => p.amount.greaterThan(0));
      const rows =
        withAmount.length > 0 ? withAmount : sectionParts.slice(0, 1);
      return rows.map((p) => ({
        userId: invoice.userId,
        invoiceId: id,
        amount: p.usd.toNumber(),
        originalAmount: p.amount,
        entityId: p.entityId,
        bankId: p.bankId,
        currencyId: p.currencyId,
        exchangeRate: p.rate,
        paymentDate: receivedOn,
        type,
        consumption: 0,
        narration,
      }));
    };
    const rows = [
      // Hardware payments are kept out of the hosting balance.
      ...rowsFor(
        hardwareParts,
        paymentTypeForInvoice(invoice.invoiceType),
        notes || null,
      ),
      ...rowsFor(hostingPartsParsed, "PAYMENT", hostingNotes || null),
    ];

    // Create cost payment entries with invoiceId (this replaces the old
    // InvoicePayment table) and update the status together, so a failure
    // can't leave some parts recorded and others not.
    const costPaymentIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const data of rows) {
        const payment = await tx.costPayment.create({ data });
        ids.push(payment.id);
      }

      // Update invoice status if fully paid
      if (markAsPaid || remainingBalance <= 0.0) {
        await tx.invoice.update({
          where: { id },
          data: {
            status: "PAID",
            paidDate: receivedOn,
          },
        });
      }
      return ids;
    });

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
          parts: hardwareParts.map(auditPart),
          ...(hasHosting
            ? { hostingParts: hostingPartsParsed.map(auditPart) }
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

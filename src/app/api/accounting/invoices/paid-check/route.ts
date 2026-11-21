import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { InvoiceStatus } from "@prisma/client";

function normalizeBillingMonth(billingMonth: string | Date): Date {
  const parsedBillingMonth = new Date(billingMonth);

  return new Date(
    Date.UTC(
      parsedBillingMonth.getUTCFullYear(),
      parsedBillingMonth.getUTCMonth(),
      1,
    ),
  );
}

interface PaidCheckInput {
  customerId: string;
  billingMonth: string;
}

/**
 * POST /api/accounting/invoices/paid-check
 *
 * Given a list of { customerId, billingMonth } pairs, returns the subset
 * that already have a PAID invoice covering that month or later — used to
 * warn admins before invoicing a customer who has already paid in advance.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["invoicing.view"]);
    if ("response" in auth) return auth.response;

    const body = await request.json();
    const checks: PaidCheckInput[] = Array.isArray(body?.checks)
      ? body.checks
      : [];

    if (checks.length === 0) {
      return NextResponse.json({ alreadyPaid: [] });
    }

    const customerIds = [...new Set(checks.map((check) => check.customerId))];

    const paidInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: customerIds },
        status: InvoiceStatus.PAID,
      },
      select: {
        userId: true,
        billingMonth: true,
        // Hardware Sales invoices bill hosting months on their line items
        // rather than on the invoice itself.
        lineItems: {
          where: {
            lineItemType: "HOSTING_COLOCATION",
            billingMonth: { not: null },
          },
          select: { billingMonth: true },
        },
      },
    });

    const alreadyPaid = checks.filter((check) => {
      const targetMonth = normalizeBillingMonth(check.billingMonth);

      return paidInvoices.some(
        (invoice) =>
          invoice.userId === check.customerId &&
          [
            invoice.billingMonth,
            ...invoice.lineItems.map((li) => li.billingMonth),
          ].some((month) => month && month.getTime() >= targetMonth.getTime()),
      );
    });

    return NextResponse.json({ alreadyPaid });
  } catch (error) {
    console.error("Paid-check error:", error);
    return NextResponse.json(
      { error: "Failed to check paid status" },
      { status: 500 },
    );
  }
}

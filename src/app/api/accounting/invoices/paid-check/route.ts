import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
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
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can check invoice paid status" },
        { status: 403 },
      );
    }

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
      select: { userId: true, billingMonth: true },
    });

    const alreadyPaid = checks.filter((check) => {
      const targetMonth = normalizeBillingMonth(check.billingMonth);

      return paidInvoices.some(
        (invoice) =>
          invoice.userId === check.customerId &&
          invoice.billingMonth &&
          invoice.billingMonth.getTime() >= targetMonth.getTime(),
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

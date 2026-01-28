import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { InvoiceStatus } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  try {
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
        { error: "Only administrators can access statements" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    if (!customerId) {
      return NextResponse.json(
        { error: "Missing required parameter: customerId" },
        { status: 400 },
      );
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, email: true, name: true, companyName: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    const where: Record<string, unknown> = { userId: customerId };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(fromDate);
      }
      if (toDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(toDate);
      }
    }

    // Get all invoices for the period (excluding CANCELLED)
    const invoices = await prisma.invoice.findMany({
      where: {
        ...where,
        status: { not: InvoiceStatus.CANCELLED },
      },
      include: {
        costPayments: true,
        notifications: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Calculate statistics
    const stats = {
      totalInvoices: invoices.length,
      totalAmount: invoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount),
        0,
      ),
      totalPaid: invoices.reduce(
        (sum, inv) =>
          sum + inv.costPayments.reduce((pSum, p) => pSum + p.amount, 0),
        0,
      ),
      totalPending: 0,
      invoicesByStatus: {
        DRAFT: 0,
        ISSUED: 0,
        OVERDUE: 0,
        PAID: 0,
        CANCELLED: 0,
        REFUNDED: 0,
      },
    };

    // Count by status
    invoices.forEach((inv) => {
      if (
        stats.invoicesByStatus[
          inv.status as keyof typeof stats.invoicesByStatus
        ] !== undefined
      ) {
        stats.invoicesByStatus[
          inv.status as keyof typeof stats.invoicesByStatus
        ]++;
      }
      if (inv.status !== "PAID") {
        stats.totalPending += Number(inv.totalAmount);
      }
    });

    const statement = {
      period: {
        from: fromDate || "All time",
        to: toDate || "Present",
      },
      customer,
      stats,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceGeneratedDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        paidAmount: inv.costPayments.reduce((sum, p) => sum + p.amount, 0) || 0,
        status: inv.status,
        issuedDate: inv.issuedDate,
        paidDate: inv.paidDate,
      })),
    };

    return NextResponse.json(statement);
  } catch (error) {
    console.error("Get statement error:", error);
    return NextResponse.json(
      { error: "Failed to fetch statement" },
      { status: 500 },
    );
  }
}

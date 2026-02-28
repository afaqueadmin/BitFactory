import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");
    const skip = (page - 1) * pageSize;

    // Get all customers with their invoice data
    const customers = await prisma.user.findMany({
      where: {
        role: "CLIENT",
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        invoices: {
          select: {
            id: true,
            totalAmount: true,
            status: true,
            costPayments: {
              select: {
                amount: true,
                createdAt: true,
              },
            },
          },
        },
      },
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
    });

    // Get total count
    const totalCount = await prisma.user.count({
      where: {
        role: "CLIENT",
      },
    });

    // Calculate summaries for each customer
    const customerSummaries = customers.map((customer) => {
      const totalAmount = customer.invoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount),
        0,
      );

      const totalPaid = customer.invoices.reduce((sum, inv) => {
        const invPaid = inv.costPayments.reduce(
          (pSum, p) => pSum + p.amount,
          0,
        );
        return sum + invPaid;
      }, 0);

      // Only count outstanding for ISSUED invoices
      const issuedInvoices = customer.invoices.filter(
        (inv) => inv.status === "ISSUED",
      );
      const issuedTotalAmount = issuedInvoices.reduce(
        (sum, inv) => sum + Number(inv.totalAmount),
        0,
      );
      const issuedTotalPaid = issuedInvoices.reduce((sum, inv) => {
        const invPaid = inv.costPayments.reduce(
          (pSum, p) => pSum + p.amount,
          0,
        );
        return sum + invPaid;
      }, 0);

      const lastPaymentDate =
        customer.invoices
          .flatMap((inv) => inv.costPayments)
          .map((p) => p.createdAt)
          .filter((date): date is Date => date !== null)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ||
        null;

      return {
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email,
        companyName: customer.companyName,
        totalInvoices: customer.invoices.length,
        totalAmount,
        totalPaid,
        totalOutstanding: issuedTotalAmount - issuedTotalPaid,
        lastPaymentDate: lastPaymentDate
          ? new Date(lastPaymentDate).toISOString()
          : null,
      };
    });

    return NextResponse.json({
      customers: customerSummaries,
      total: totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Failed to fetch customer statements:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer statements" },
      { status: 500 },
    );
  }
}

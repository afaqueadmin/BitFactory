import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { generatePDFFromHTML } from "@/lib/email";
import { buildCostPaymentTransactionsPdfHtml } from "@/lib/helpers/admin/costPaymentTransactionsPdf";
import { buildOrderBy, parseMonthlyRevenueQuery } from "../query";

// Hard cap on rows rendered into the PDF — this endpoint is unpaginated by
// design (it exports the full filtered/sorted result set), so a cap keeps
// Puppeteer rendering fast even on a wide date/customer filter.
const ROW_LIMIT = 2000;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error(
        "[Admin Monthly Revenue PDF] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access this data" },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const { sortBy, sortOrder, where, effectiveStart, effectiveEnd } =
      parseMonthlyRevenueQuery(url);

    const [electricitySum, adjustmentSum, totalCount, transactions] =
      await Promise.all([
        prisma.costPayment.aggregate({
          where: { AND: [where, { type: "ELECTRICITY_CHARGES" }] },
          _sum: { amount: true },
        }),
        prisma.costPayment.aggregate({
          where: { AND: [where, { type: "ADJUSTMENT" }] },
          _sum: { amount: true },
        }),
        prisma.costPayment.count({ where }),
        prisma.costPayment.findMany({
          where,
          orderBy: buildOrderBy(sortBy, sortOrder),
          take: ROW_LIMIT,
          include: {
            user: { select: { name: true, email: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        }),
      ]);

    const sumElectricityCharges = Number(
      (electricitySum._sum.amount || 0).toFixed(2),
    );
    const sumAdjustment = Number((adjustmentSum._sum.amount || 0).toFixed(2));
    const rawTotal = Number((sumElectricityCharges + sumAdjustment).toFixed(2));
    const displayTotal = Number((rawTotal * -1).toFixed(2));

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);

    const html = buildCostPaymentTransactionsPdfHtml({
      title: "Monthly Revenue (30 days) — Transaction Detail",
      subtitle: `Period: ${effectiveStart.toLocaleString()} to ${effectiveEnd.toLocaleString()}`,
      summaryRows: [
        {
          label: "Electricity Charges (sum)",
          value: formatCurrency(sumElectricityCharges),
        },
        { label: "Adjustments (sum)", value: formatCurrency(sumAdjustment) },
        { label: "Raw total", value: formatCurrency(rawTotal) },
        { label: "Total (raw × -1)", value: formatCurrency(displayTotal) },
      ],
      transactions: transactions.map((t) => ({
        createdAt: t.createdAt,
        type: t.type,
        amount: t.amount,
        narration: t.narration,
        customerName: t.user?.name ?? null,
        customerEmail: t.user?.email ?? null,
        invoiceNumber: t.invoice?.invoiceNumber ?? null,
      })),
      totalMatched: totalCount,
      truncated: totalCount > ROW_LIMIT,
      rowLimit: ROW_LIMIT,
      generatedAt: new Date(),
    });

    const pdfBuffer = await generatePDFFromHTML(html);

    return new NextResponse(pdfBuffer as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="monthly-revenue-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Admin Monthly Revenue PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}

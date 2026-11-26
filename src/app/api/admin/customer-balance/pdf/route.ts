import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { generatePDFFromHTML } from "@/lib/email";
import { buildCostPaymentTransactionsPdfHtml } from "@/lib/helpers/admin/costPaymentTransactionsPdf";
import { buildOrderBy, parseCustomerBalanceQuery } from "../query";

// Hard cap on rows rendered into the PDF — this endpoint is unpaginated by
// design (it exports the full filtered/sorted result set), so a cap keeps
// Puppeteer rendering fast even on a large, unfiltered all-time ledger.
const ROW_LIMIT = 2000;

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["dashboard_balances.total_balance"]);
    if ("response" in auth) return auth.response;

    const url = new URL(request.url);
    const { sortBy, sortOrder, where, startDate, endDate } =
      parseCustomerBalanceQuery(url);

    const [
      paymentSum,
      electricitySum,
      adjustmentSum,
      totalCount,
      transactions,
    ] = await Promise.all([
      prisma.costPayment.aggregate({
        where: { AND: [where, { type: "PAYMENT" }] },
        _sum: { amount: true },
      }),
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

    const sumPayment = Number((paymentSum._sum.amount || 0).toFixed(2));
    const sumElectricityCharges = Number(
      (electricitySum._sum.amount || 0).toFixed(2),
    );
    const sumAdjustment = Number((adjustmentSum._sum.amount || 0).toFixed(2));
    const displayTotal = Number(
      (sumPayment + sumElectricityCharges + sumAdjustment).toFixed(2),
    );

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);

    const subtitle =
      startDate || endDate
        ? `Period: ${startDate ? startDate.toLocaleString() : "the beginning"} to ${endDate ? endDate.toLocaleString() : "now"}`
        : "All-time, every CostPayment row except HARDWARE_SALES and HARDWARE_REPAIR";

    const html = buildCostPaymentTransactionsPdfHtml({
      title: "Total Customer Balance — Transaction Detail",
      subtitle,
      summaryRows: [
        { label: "Payments (sum)", value: formatCurrency(sumPayment) },
        {
          label: "Hosting & Colocation (sum)",
          value: formatCurrency(sumElectricityCharges),
        },
        { label: "Adjustments (sum)", value: formatCurrency(sumAdjustment) },
        { label: "Total", value: formatCurrency(displayTotal) },
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
        "Content-Disposition": `attachment; filename="customer-balance-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Admin Customer Balance PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 },
    );
  }
}

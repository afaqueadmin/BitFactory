import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { Prisma } from "@prisma/client";
import { generatePDFFromHTML } from "@/lib/email";
import { buildCostPaymentTransactionsPdfHtml } from "@/lib/helpers/admin/costPaymentTransactionsPdf";

// Hard cap on rows rendered into the PDF — this is an all-time, unpaginated
// export, so a cap keeps Puppeteer rendering fast even on a large ledger.
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
        "[Admin Customer Balance PDF] Token verification failed:",
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

    const where: Prisma.CostPaymentWhereInput = {
      type: { not: "HARDWARE_SALES" },
      user: { isDeleted: false },
    };

    const [
      paymentSum,
      electricitySum,
      adjustmentSum,
      totalCount,
      transactions,
    ] = await Promise.all([
      prisma.costPayment.aggregate({
        where: { type: "PAYMENT", user: { isDeleted: false } },
        _sum: { amount: true },
      }),
      prisma.costPayment.aggregate({
        where: { type: "ELECTRICITY_CHARGES", user: { isDeleted: false } },
        _sum: { amount: true },
      }),
      prisma.costPayment.aggregate({
        where: { type: "ADJUSTMENT", user: { isDeleted: false } },
        _sum: { amount: true },
      }),
      prisma.costPayment.count({ where }),
      prisma.costPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
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

    const html = buildCostPaymentTransactionsPdfHtml({
      title: "Total Customer Balance — Transaction Detail",
      subtitle: "All-time, every CostPayment row except HARDWARE_SALES",
      summaryRows: [
        { label: "Payments (sum)", value: formatCurrency(sumPayment) },
        {
          label: "Electricity Charges (sum)",
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

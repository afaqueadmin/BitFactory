import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["dashboard.view"]);
    if ("response" in auth) return auth.response;

    // Hosting revenue is invoice-based: sum totalAmount of all ELECTRICITY_CHARGES
    // invoices that have been issued to the customer (ISSUED/OVERDUE/PROCESSING/PAID).
    // DRAFT invoices are excluded since they haven't been sent yet.
    const [invoices, credits] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          invoiceType: "ELECTRICITY_CHARGES",
          status: {
            in: ["ISSUED", "OVERDUE", "PROCESSING", "PAID"],
          },
        },
        _sum: {
          totalAmount: true,
        },
      }),
      // Memos net out of the invoice total rather than mutating Invoice
      // rows, so issued invoices stay an immutable record.
      prisma.memo.aggregate({
        where: { category: "HOSTING", status: "ISSUED" },
        _sum: { amount: true },
      }),
    ]);

    const invoiceTotal = invoices._sum.totalAmount
      ? Number(invoices._sum.totalAmount)
      : 0;
    const creditTotal = credits._sum.amount ? Number(credits._sum.amount) : 0;

    return NextResponse.json(
      {
        success: true,
        hostingRevenue: invoiceTotal - creditTotal,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching electricity charges:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch electricity charges",
      },
      { status: 500 },
    );
  }
}

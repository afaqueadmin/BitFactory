import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error("[Cost Payments GET] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can search by customerId" },
        { status: 403 },
      );
    }

    // Hosting revenue is invoice-based: sum totalAmount of all ELECTRICITY_CHARGES
    // invoices that have been issued to the customer (ISSUED/OVERDUE/PAID).
    // DRAFT invoices are excluded since they haven't been sent yet.
    const [invoices, credits] = await Promise.all([
      prisma.invoice.aggregate({
        where: {
          invoiceType: "ELECTRICITY_CHARGES",
          status: {
            in: ["ISSUED", "OVERDUE", "PAID"],
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

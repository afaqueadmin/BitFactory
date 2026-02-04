import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { ConfirmoPaymentService } from "@/services/confirmoPaymentService";

/**
 * POST /api/invoices/[id]/confirmo-payment
 *
 * Called when:
 * 1. Admin clicks "Generate Payment Link" button after creating invoice
 * 2. Customer clicks "Pay with Crypto" in email or invoice page
 *
 * Uses invoice data that was entered in the create form:
 * - Customer (userId)
 * - Number of miners (totalMiners)
 * - Unit price (unitPrice)
 * - Total amount (totalAmount)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    ) as { userId: string };
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("Creating Confirmo payment for invoice:", id);

    const service = new ConfirmoPaymentService();
    const result = await service.createPaymentForInvoice(id, decoded.userId);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error creating Confirmo payment:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to create payment link",
      },
      { status: 400 },
    );
  }
}

/**
 * GET /api/invoices/[id]/confirmo-payment
 *
 * Get existing payment status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");

    const { prisma } = await import("@/lib/prisma");

    const payment = await prisma.confirmoPayment.findUnique({
      where: { invoiceId: id },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
            totalMiners: true,
            unitPrice: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Payment link not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: payment,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error fetching payment status:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 },
    );
  }
}

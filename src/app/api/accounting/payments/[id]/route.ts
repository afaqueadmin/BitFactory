import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);

    // Same gate as the list endpoint - any customer's payment can be read here.
    const requester = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });
    if (requester?.role !== "ADMIN" && requester?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access invoice payments" },
        { status: 403 },
      );
    }

    const payment = await prisma.costPayment.findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalAmount: true,
            userId: true,
          },
        },
        // Never the whole row - it carries the password hash and 2FA data.
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!payment || payment.isDeleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Get cost payment error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost payment" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
        { error: "Only administrators can delete payments" },
        { status: 403 },
      );
    }

    const payment = await prisma.costPayment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!payment || payment.isDeleted) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    await prisma.costPayment.update({
      where: { id },
      data: { isDeleted: true },
    });

    // Log audit
    const invoiceNumber = payment.invoice?.invoiceNumber || "N/A";
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PAYMENT_REMOVED,
        entityType: "CostPayment",
        entityId: id,
        userId,
        description: `Payment removed from invoice ${invoiceNumber}`,
        changes: JSON.stringify({
          amount: payment.amount.toString(),
          invoiceId: payment.invoiceId,
        }),
      },
    });

    return NextResponse.json({ success: true, message: "Payment deleted" });
  } catch (error) {
    console.error("Delete cost payment error:", error);
    return NextResponse.json(
      { error: "Failed to delete cost payment" },
      { status: 500 },
    );
  }
}

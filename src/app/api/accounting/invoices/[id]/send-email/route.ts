import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";
import { sendInvoiceEmail } from "@/lib/email";

export async function POST(
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
        { error: "Only administrators can send emails" },
        { status: 403 },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (!invoice.user?.email) {
      return NextResponse.json(
        { error: "Customer email not found" },
        { status: 400 },
      );
    }

    // Send invoice email using real email service
    const emailResult = await sendInvoiceEmail(
      invoice.user.email,
      invoice.user.name || "Valued Customer",
      invoice.invoiceNumber,
      Number(invoice.totalAmount),
      invoice.dueDate,
      invoice.issuedDate || new Date(),
    );

    if (!emailResult.success) {
      console.error("Failed to send invoice email:", emailResult.error);
      // Still create notification even if email fails
      await prisma.invoiceNotification.create({
        data: {
          invoiceId: id,
          notificationType: "INVOICE_ISSUED",
          sentTo: invoice.user.email,
          sentAt: new Date(),
          status: "FAILED",
        },
      });

      return NextResponse.json(
        {
          error: "Failed to send invoice email",
          details: emailResult.error,
        },
        { status: 500 },
      );
    }

    // Create notification record
    await prisma.invoiceNotification.create({
      data: {
        invoiceId: id,
        notificationType: "INVOICE_ISSUED",
        sentTo: invoice.user.email,
        sentAt: new Date(),
        status: "SENT",
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_SENT_TO_CUSTOMER,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} sent to ${invoice.user.email}`,
        changes: JSON.stringify({
          sentTo: invoice.user.email,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Invoice sent to ${invoice.user.email}`,
      sentTo: invoice.user.email,
    });
  } catch (error) {
    console.error("Send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send invoice email" },
      { status: 500 },
    );
  }
}

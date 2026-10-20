import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { InvoiceStatus, AuditAction } from "@prisma/client";

/**
 * POST /api/accounting/invoices/[id]/mark-unpaid
 *
 * Reverts a PAID invoice back to ISSUED and clears its paid date.
 * Restricted to SUPER_ADMIN. Recorded payments are left untouched.
 */
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

    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only super administrators can mark invoices as unpaid" },
        { status: 403 },
      );
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { invoiceNumber: true, status: true, paidDate: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status !== InvoiceStatus.PAID) {
      return NextResponse.json(
        {
          error: `Cannot mark invoice as unpaid - status is ${invoice.status}, must be PAID`,
        },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Guard on status in the write itself so a concurrent change can't be overwritten
      const result = await tx.invoice.updateMany({
        where: { id, status: InvoiceStatus.PAID },
        data: {
          status: InvoiceStatus.ISSUED,
          paidDate: null,
          updatedBy: userId,
        },
      });

      if (result.count === 0) return false;

      await tx.auditLog.create({
        data: {
          action: AuditAction.INVOICE_UPDATED,
          entityType: "Invoice",
          entityId: id,
          userId,
          description: `Invoice ${invoice.invoiceNumber} marked as unpaid`,
          changes: JSON.stringify({
            status: { from: InvoiceStatus.PAID, to: InvoiceStatus.ISSUED },
            paidDate: {
              from: invoice.paidDate?.toISOString() ?? null,
              to: null,
            },
          }),
        },
      });

      return true;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Invoice status changed, please reload and try again" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} marked as unpaid`,
      status: InvoiceStatus.ISSUED,
    });
  } catch (error) {
    console.error("Mark invoice unpaid error:", error);
    return NextResponse.json(
      { error: "Failed to mark invoice as unpaid" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  InvoiceEmailService,
  InvoiceEmailPayload,
} from "@/services/invoiceEmailService";
import { getGroupBySubaccountName } from "@/lib/groupUtils";
import { InvoiceStatus, AuditAction } from "@/generated/prisma";

/**
 * POST /api/accounting/invoices/[id]/issue
 *
 * Complete workflow to issue a DRAFT invoice:
 * 1. Validate invoice is DRAFT
 * 2. Send email with PDF (mandatory)
 * 3. ONLY if email succeeds, change status to ISSUED
 * 4. If email fails, status stays DRAFT and error is returned
 *
 * This ensures invoice is only marked as ISSUED when customer has received it.
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

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can issue invoices" },
        { status: 403 },
      );
    }

    // Fetch invoice with all required details
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            luxorSubaccountName: true,
          },
        },
        hardware: {
          select: {
            model: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Validate invoice is in DRAFT status
    if (invoice.status !== InvoiceStatus.DRAFT) {
      return NextResponse.json(
        {
          error: `Cannot issue invoice - status is ${invoice.status}, must be DRAFT`,
        },
        { status: 400 },
      );
    }

    if (!invoice.user?.email) {
      return NextResponse.json(
        { error: "Customer email not found" },
        { status: 400 },
      );
    }

    // Get relationship manager info for response
    let rmInfo = { name: "", email: "" };
    if (invoice.user.luxorSubaccountName) {
      try {
        const group = await getGroupBySubaccountName(
          invoice.user.luxorSubaccountName,
        );
        if (group && group.relationshipManager && group.email) {
          rmInfo = {
            name: group.relationshipManager,
            email: group.email,
          };
        }
      } catch (error) {
        console.error("Error fetching group info:", error);
      }
    }

    // Build CC list and get crypto payment
    const [ccEmails, cryptoPaymentUrl] = await Promise.all([
      InvoiceEmailService.buildCCList(invoice.user.luxorSubaccountName),
      InvoiceEmailService.getCryptoPaymentUrl(id, userId),
    ]);

    // Build email payload
    const emailPayload: InvoiceEmailPayload = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerEmail: invoice.user.email,
      customerName: invoice.user.name || "Valued Customer",
      totalAmount: Number(invoice.totalAmount),
      issuedDate: new Date(), // Use today as issued date
      dueDate: invoice.dueDate,
      totalMiners: invoice.totalMiners,
      unitPrice: Number(invoice.unitPrice),
      luxorSubaccountName: invoice.user.luxorSubaccountName || undefined,
      hardwareModel: invoice.hardware?.model || undefined,
    };

    // Send invoice with PDF (mandatory - fails entire operation if PDF fails)
    const emailResult = await InvoiceEmailService.sendInvoiceWithPDF(
      emailPayload,
      userId,
      ccEmails,
      cryptoPaymentUrl,
    );

    // If email send failed, return error WITHOUT changing status
    if (!emailResult.success) {
      console.error(
        `[Issue] Email send failed for invoice ${invoice.invoiceNumber}: ${emailResult.error}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send invoice email",
          details: emailResult.error,
          message: `Could not issue invoice - email send failed: ${emailResult.error}`,
        },
        { status: 500 },
      );
    }

    // Email succeeded - NOW change status to ISSUED
    await prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.ISSUED,
        issuedDate: new Date(),
        updatedBy: userId,
      },
    });

    // Log audit for status change
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_ISSUED,
        entityType: "Invoice",
        entityId: id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} issued and sent to ${invoice.user.email}`,
        changes: JSON.stringify({
          status: { from: InvoiceStatus.DRAFT, to: InvoiceStatus.ISSUED },
          issuedDate: new Date().toISOString(),
          sentTo: invoice.user.email,
          ccEmails: ccEmails.join(","),
          pdfAttached: true,
        }),
      },
    });

    // Success response
    return NextResponse.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} issued and sent successfully`,
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber,
      sentTo: invoice.user.email,
      ccEmails: ccEmails,
      ccDescription:
        rmInfo.email && rmInfo.name
          ? `CC'd to: ${rmInfo.name} (${rmInfo.email}), invoices@bitfactory.ae`
          : "CC'd to: invoices@bitfactory.ae",
      pdfAttached: true,
      status: "ISSUED",
      issuedDate: new Date().toISOString(),
      details: {
        invoiceNumber: invoice.invoiceNumber,
        recipientCount: 1 + ccEmails.length,
        status: "ISSUED_AND_DELIVERED",
      },
    });
  } catch (error) {
    console.error("Issue invoice error:", error);
    return NextResponse.json(
      { error: "Failed to issue invoice" },
      { status: 500 },
    );
  }
}

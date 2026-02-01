import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";
import {
  sendInvoiceEmail,
  generateInvoicePDF,
  sendInvoiceEmailWithPDF,
} from "@/lib/email";
import { getGroupBySubaccountName } from "@/lib/groupUtils";

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
            luxorSubaccountName: true,
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

    // Fetch group and build CC list
    const ccEmails: string[] = [];
    let rmInfo = { name: "", email: "" };

    if (invoice.user.luxorSubaccountName) {
      const group = await getGroupBySubaccountName(
        invoice.user.luxorSubaccountName,
      );
      if (group && group.relationshipManager && group.email) {
        rmInfo = {
          name: group.relationshipManager,
          email: group.email,
        };
        ccEmails.push(group.email);
      }
    }

    // Always add invoices@bitfactory.ae to CC
    const invoiceCCEmail =
      process.env.INVOICE_CC_EMAIL || "invoices@bitfactory.ae";
    if (!ccEmails.includes(invoiceCCEmail)) {
      ccEmails.push(invoiceCCEmail);
    }

    // Send invoice email with PDF attachment
    let emailResult;
    try {
      console.log(
        `[Email] Starting PDF generation for invoice ${invoice.invoiceNumber}...`,
      );

      const pdfBuffer = await generateInvoicePDF(
        invoice.invoiceNumber,
        invoice.user.name || "Valued Customer",
        invoice.user.email,
        Number(invoice.totalAmount),
        invoice.issuedDate || new Date(),
        invoice.dueDate,
        invoice.totalMiners,
        Number(invoice.unitPrice),
        invoice.id,
        new Date(),
      );

      console.log(
        `[Email] PDF generated successfully (${pdfBuffer.length} bytes), now sending email...`,
      );

      emailResult = await sendInvoiceEmailWithPDF(
        invoice.user.email,
        invoice.user.name || "Valued Customer",
        invoice.invoiceNumber,
        Number(invoice.totalAmount),
        invoice.issuedDate || new Date(),
        invoice.dueDate,
        invoice.totalMiners,
        Number(invoice.unitPrice),
        invoice.id,
        pdfBuffer,
        ccEmails,
      );

      console.log(
        `[Email] Email sent with PDF attachment to ${invoice.user.email}`,
      );
    } catch (pdfError) {
      console.error(
        `[Email] Failed to generate PDF for ${invoice.invoiceNumber}:`,
        pdfError,
      );
      // Fallback to simple email without PDF
      emailResult = await sendInvoiceEmail(
        invoice.user.email,
        invoice.user.name || "Valued Customer",
        invoice.invoiceNumber,
        Number(invoice.totalAmount),
        invoice.dueDate,
        invoice.issuedDate || new Date(),
        ccEmails,
      );
    }

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
          ccEmails: ccEmails.join(","),
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
        ccEmails: ccEmails.join(","),
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
      ccEmails: ccEmails,
      ccDescription:
        rmInfo.email && rmInfo.name
          ? `CC'd to: ${rmInfo.name} (${rmInfo.email}), invoices@bitfactory.ae`
          : "CC'd to: invoices@bitfactory.ae",
    });
  } catch (error) {
    console.error("Send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send invoice email" },
      { status: 500 },
    );
  }
}

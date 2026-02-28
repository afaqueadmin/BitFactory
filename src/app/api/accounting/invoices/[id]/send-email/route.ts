import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  InvoiceEmailService,
  InvoiceEmailPayload,
} from "@/services/invoiceEmailService";
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
      issuedDate: invoice.issuedDate || new Date(),
      dueDate: invoice.dueDate,
      totalMiners: invoice.totalMiners,
      unitPrice: Number(invoice.unitPrice),
      luxorSubaccountName: invoice.user.luxorSubaccountName || undefined,
      hardwareModel: invoice.hardware?.model || undefined,
    };

    // Send invoice with PDF
    const result = await InvoiceEmailService.sendInvoiceWithPDF(
      emailPayload,
      userId,
      ccEmails,
      cryptoPaymentUrl,
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to send invoice email",
          details: result.error,
          message: `Could not send invoice - ${result.error}`,
        },
        { status: 500 },
      );
    }

    // Success response
    return NextResponse.json({
      success: true,
      message: `Invoice sent successfully to ${invoice.user.email}`,
      sentTo: invoice.user.email,
      ccEmails: ccEmails,
      ccDescription:
        rmInfo.email && rmInfo.name
          ? `CC'd to: ${rmInfo.name} (${rmInfo.email}), invoices@bitfactory.ae`
          : "CC'd to: invoices@bitfactory.ae",
      pdfAttached: true,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        recipientCount: 1 + ccEmails.length,
        status: "DELIVERED",
      },
    });
  } catch (error) {
    console.error("Send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send invoice email" },
      { status: 500 },
    );
  }
}

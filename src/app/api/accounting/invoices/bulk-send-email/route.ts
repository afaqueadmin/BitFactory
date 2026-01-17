import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";
import { sendInvoiceEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
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

    const { invoiceIds } = await request.json();

    if (!Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: "Invoice IDs array is required" },
        { status: 400 },
      );
    }

    // Fetch all invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
      },
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

    if (invoices.length === 0) {
      return NextResponse.json({ error: "No invoices found" }, { status: 404 });
    }

    const results = {
      sent: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Send email for each invoice
    for (const invoice of invoices) {
      try {
        if (!invoice.user?.email) {
          results.failed.push({
            id: invoice.id,
            error: "Customer email not found",
          });
          continue;
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
          results.failed.push({
            id: invoice.id,
            error: "Failed to send email",
          });

          // Create failed notification
          await prisma.invoiceNotification.create({
            data: {
              invoiceId: invoice.id,
              notificationType: "INVOICE_ISSUED",
              sentTo: invoice.user.email,
              sentAt: new Date(),
              status: "FAILED",
            },
          });
          continue;
        }

        // Create successful notification
        await prisma.invoiceNotification.create({
          data: {
            invoiceId: invoice.id,
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
            entityId: invoice.id,
            userId,
            description: `Invoice ${invoice.invoiceNumber} sent to ${invoice.user.email}`,
            changes: JSON.stringify({
              sentTo: invoice.user.email,
              bulkSend: true,
              timestamp: new Date().toISOString(),
            }),
          },
        });

        results.sent.push(invoice.id);
      } catch (error) {
        console.error(`Error sending email for invoice ${invoice.id}:`, error);
        results.failed.push({
          id: invoice.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Emails sent to ${results.sent.length} invoice(s)`,
      results,
    });
  } catch (error) {
    console.error("Bulk send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send bulk emails" },
      { status: 500 },
    );
  }
}

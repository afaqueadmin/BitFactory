import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";
import { sendInvoiceEmail } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";

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

    // Fetch all invoices (excluding CANCELLED)
    const invoices = await prisma.invoice.findMany({
      where: {
        id: { in: invoiceIds },
        status: { not: "CANCELLED" },
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

    // Create email send run
    const runId = uuidv4();
    const run = await prisma.emailSendRun.create({
      data: {
        id: runId,
        type: "INVOICE",
        status: "IN_PROGRESS",
        totalInvoices: invoices.length,
        successCount: 0,
        failureCount: 0,
        createdBy: userId,
        startedAt: new Date(),
      },
    });

    const results = {
      sent: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    let successCount = 0;
    let failureCount = 0;

    // Send email for each invoice
    for (const invoice of invoices) {
      let emailSuccess = false;
      let errorMessage: string | null = null;

      try {
        if (!invoice.user?.email) {
          failureCount++;
          errorMessage = "Customer email not found";
          results.failed.push({
            id: invoice.id,
            error: errorMessage,
          });
        } else {
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
            failureCount++;
            errorMessage = "Failed to send email";
            results.failed.push({
              id: invoice.id,
              error: errorMessage,
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
          } else {
            emailSuccess = true;
            successCount++;

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
          }
        }
      } catch (error) {
        console.error(`Error sending email for invoice ${invoice.id}:`, error);
        failureCount++;
        errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.failed.push({
          id: invoice.id,
          error: errorMessage,
        });
      }

      // Create email send result
      await prisma.emailSendResult.create({
        data: {
          id: uuidv4(),
          runId,
          invoiceId: invoice.id,
          customerId: invoice.user?.id || "",
          customerName: invoice.user?.name || "Unknown",
          customerEmail: invoice.user?.email || "",
          success: emailSuccess,
          errorMessage,
          sentAt: emailSuccess ? new Date() : null,
        },
      });
    }

    // Update run with final counts and status
    await prisma.emailSendRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        successCount,
        failureCount,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Emails sent to ${results.sent.length} invoice(s)`,
      results,
      runId,
    });
  } catch (error) {
    console.error("Bulk send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send bulk emails" },
      { status: 500 },
    );
  }
}

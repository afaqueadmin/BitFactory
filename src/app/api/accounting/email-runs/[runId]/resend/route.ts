import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { sendInvoiceEmail } from "@/lib/email";
import { AuditAction } from "@/generated/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
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
        { error: "Only administrators can resend emails" },
        { status: 403 },
      );
    }

    const { resultIds } = await request.json();

    if (!Array.isArray(resultIds) || resultIds.length === 0) {
      return NextResponse.json(
        { error: "Result IDs array is required" },
        { status: 400 },
      );
    }

    // Get the run to verify it exists
    const run = await prisma.emailSendRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Email run not found" },
        { status: 404 },
      );
    }

    // Get all results to resend
    const results = await prisma.emailSendResult.findMany({
      where: {
        id: { in: resultIds },
        runId,
      },
      include: {
        invoice: true,
      },
    });

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No results found to resend" },
        { status: 404 },
      );
    }

    const resendResults = {
      resent: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    // Resend emails
    for (const result of results) {
      try {
        if (!result.customerEmail) {
          resendResults.failed.push({
            id: result.id,
            error: "Customer email not available",
          });
          continue;
        }

        const invoice = result.invoice;
        if (!invoice) {
          resendResults.failed.push({
            id: result.id,
            error: "Invoice not found",
          });
          continue;
        }

        // Send invoice email
        const emailResult = await sendInvoiceEmail(
          result.customerEmail,
          result.customerName || "Valued Customer",
          invoice.invoiceNumber,
          Number(invoice.totalAmount),
          invoice.dueDate,
          invoice.issuedDate || new Date(),
        );

        if (!emailResult.success) {
          resendResults.failed.push({
            id: result.id,
            error: "Failed to send email",
          });
          continue;
        }

        // Update result with new sent timestamp
        await prisma.emailSendResult.update({
          where: { id: result.id },
          data: {
            success: true,
            errorMessage: null,
            sentAt: new Date(),
          },
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            action: AuditAction.INVOICE_SENT_TO_CUSTOMER,
            entityType: "Invoice",
            entityId: invoice.id,
            userId,
            description: `Invoice ${invoice.invoiceNumber} resent to ${result.customerEmail}`,
            changes: JSON.stringify({
              resendType: "bulk_resend",
              originalRunId: runId,
              timestamp: new Date().toISOString(),
            }),
          },
        });

        resendResults.resent.push(result.id);
      } catch (error) {
        console.error(`Error resending email for result ${result.id}:`, error);
        resendResults.failed.push({
          id: result.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update run summary if any emails were resent
    if (resendResults.resent.length > 0) {
      const updatedRun = await prisma.emailSendRun.findUnique({
        where: { id: runId },
        include: {
          results: {
            select: { success: true },
          },
        },
      });

      if (updatedRun) {
        const successCount = updatedRun.results.filter((r) => r.success).length;
        const failureCount = updatedRun.results.filter(
          (r) => !r.success,
        ).length;

        await prisma.emailSendRun.update({
          where: { id: runId },
          data: {
            successCount,
            failureCount,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Resent ${resendResults.resent.length} email(s)`,
      resendResults,
    });
  } catch (error) {
    console.error("Resend email error:", error);
    return NextResponse.json(
      { error: "Failed to resend emails" },
      { status: 500 },
    );
  }
}

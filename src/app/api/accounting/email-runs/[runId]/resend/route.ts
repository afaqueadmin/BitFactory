import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { REPAIR_MINER_SELECT } from "@/lib/accounting/hardwareRepair";
import { verifyJwtToken } from "@/lib/jwt";
import {
  InvoiceEmailService,
  InvoiceEmailPayload,
} from "@/services/invoiceEmailService";
import { repairDetailsFromInvoice } from "@/lib/email";
import { canResendKind } from "@/lib/accounting/emailReport";

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

    // Resend sends the invoice PDF, which is wrong for cancellation notices
    // and memo emails.
    if (!canResendKind(run.kind)) {
      return NextResponse.json(
        { error: "Only invoice emails can be resent from the report" },
        { status: 400 },
      );
    }

    // Get all results to resend
    const results = await prisma.emailSendResult.findMany({
      where: {
        id: { in: resultIds },
        runId,
      },
      include: {
        invoice: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            hardware: {
              select: {
                model: true,
              },
            },
            lineItems: true,
            miner: { select: REPAIR_MINER_SELECT },
          },
        },
      },
    });

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No results found to resend" },
        { status: 404 },
      );
    }

    // Rows whose invoice was deleted can't be resent; report them back.
    const skipped = results
      .filter((result) => !result.invoice || !result.invoice.user)
      .map((result) => ({
        id: result.id,
        documentNumber: result.documentNumber,
        reason: "Invoice no longer exists",
      }));

    // Build email payloads for all results
    const emailPayloads: InvoiceEmailPayload[] = results
      .filter((result) => result.invoice && result.invoice.user)
      .map((result) => ({
        invoiceId: result.invoice!.id,
        invoiceNumber: result.invoice!.invoiceNumber,
        customerEmail: result.customerEmail,
        customerName: result.customerName,
        totalAmount: Number(result.invoice!.totalAmount),
        issuedDate: result.invoice!.issuedDate || new Date(),
        dueDate: result.invoice!.dueDate,
        totalMiners: result.invoice!.totalMiners,
        unitPrice: Number(result.invoice!.unitPrice),
        customerId: result.invoice!.user?.id || undefined,
        hardwareModel: result.invoice!.hardware?.model || undefined,
        billingMonth: result.invoice!.billingMonth || undefined,
        invoiceStatus: result.invoice!.status,
        paidDate: result.invoice!.paidDate || undefined,
        invoiceType: result.invoice!.invoiceType,
        machineHostingLocation:
          result.invoice!.machineHostingLocation || undefined,
        repair: repairDetailsFromInvoice(result.invoice!),
        lineItems: result.invoice!.lineItems.map((li) => ({
          model: li.model,
          quantity: li.quantity,
          unitPrice: Number(li.unitPrice),
          totalPrice: Number(li.totalPrice),
          lineItemType: li.lineItemType,
          hardwareId: li.hardwareId,
          billingMonth: li.billingMonth,
        })),
      }));

    // Send all with service
    const bulkResult = await InvoiceEmailService.sendBulkInvoices(
      emailPayloads,
      userId,
    );

    // Update result records with resend status
    for (const result of bulkResult.results) {
      const emailSendResult = results.find(
        (r) => r.invoiceId === result.invoiceId,
      );
      if (emailSendResult) {
        await prisma.emailSendResult.update({
          where: { id: emailSendResult.id },
          data: {
            success: result.success,
            errorMessage: result.error || null,
            sentAt: result.success ? new Date() : null,
            ccEmails: result.ccEmails?.join(",") || null,
            documentNumber: result.invoiceNumber,
          },
        });
      }
    }

    // Keep the run summary in step with its rows after the resend.
    const [successCount, failureCount] = await Promise.all([
      prisma.emailSendResult.count({ where: { runId, success: true } }),
      prisma.emailSendResult.count({ where: { runId, success: false } }),
    ]);
    await prisma.emailSendRun.update({
      where: { id: runId },
      data: { successCount, failureCount },
    });

    const resendResults = {
      resent: bulkResult.results
        .filter((r) => r.success)
        .map((r) => r.invoiceId),
      failed: bulkResult.results
        .filter((r) => !r.success)
        .map((r) => ({
          id: r.invoiceId,
          error: r.error,
        })),
      skipped,
    };

    return NextResponse.json({
      success: true,
      message: `Resent ${bulkResult.summary.successful} invoice(s), ${bulkResult.summary.failed} failed${skipped.length ? `, ${skipped.length} skipped (invoice deleted)` : ""}`,
      resendResults,
      summary: bulkResult.summary,
    });
  } catch (error) {
    console.error("Resend email error:", error);
    return NextResponse.json(
      { error: "Failed to resend emails" },
      { status: 500 },
    );
  }
}

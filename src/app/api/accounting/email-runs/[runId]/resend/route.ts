import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  InvoiceEmailService,
  InvoiceEmailPayload,
} from "@/services/invoiceEmailService";

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
        invoice: {
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
        },
      },
    });

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No results found to resend" },
        { status: 404 },
      );
    }

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
        luxorSubaccountName:
          result.invoice!.user?.luxorSubaccountName || undefined,
        hardwareModel: result.invoice!.hardware?.model || undefined,
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
          },
        });
      }
    }

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
    };

    return NextResponse.json({
      success: true,
      message: `Resent ${bulkResult.summary.successful} invoice(s), ${bulkResult.summary.failed} failed`,
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

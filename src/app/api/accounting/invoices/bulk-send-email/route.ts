import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  InvoiceEmailService,
  InvoiceEmailPayload,
} from "@/services/invoiceEmailService";
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

    // Build email payloads
    const emailPayloads: InvoiceEmailPayload[] = invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerEmail: invoice.user?.email || "",
      customerName: invoice.user?.name || "Valued Customer",
      totalAmount: Number(invoice.totalAmount),
      issuedDate: invoice.issuedDate || new Date(),
      dueDate: invoice.dueDate,
      totalMiners: invoice.totalMiners,
      unitPrice: Number(invoice.unitPrice),
      luxorSubaccountName: invoice.user?.luxorSubaccountName || undefined,
      hardwareModel: invoice.hardware?.model || undefined,
    }));

    // Send all invoices
    const bulkResult = await InvoiceEmailService.sendBulkInvoices(
      emailPayloads,
      userId,
    );

    // Create email send results for tracking
    for (const result of bulkResult.results) {
      await prisma.emailSendResult.create({
        data: {
          id: uuidv4(),
          runId,
          invoiceId: result.invoiceId,
          customerId:
            invoices.find((i) => i.id === result.invoiceId)?.user?.id || "",
          customerName:
            invoices.find((i) => i.id === result.invoiceId)?.user?.name ||
            "Unknown",
          customerEmail:
            invoices.find((i) => i.id === result.invoiceId)?.user?.email || "",
          success: result.success,
          errorMessage: result.error || null,
          sentAt: result.success ? new Date() : null,
        },
      });
    }

    // Update run with final counts and status
    await prisma.emailSendRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        successCount: bulkResult.summary.successful,
        failureCount: bulkResult.summary.failed,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Emails sent to ${bulkResult.summary.successful} invoice(s), ${bulkResult.summary.failed} failed`,
      runId,
      results: {
        sent: bulkResult.results
          .filter((r) => r.success)
          .map((r) => r.invoiceId),
        failed: bulkResult.results
          .filter((r) => !r.success)
          .map((r) => ({
            id: r.invoiceId,
            error: r.error,
          })),
      },
      summary: bulkResult.summary,
    });
  } catch (error) {
    console.error("Bulk send invoice email error:", error);
    return NextResponse.json(
      { error: "Failed to send bulk emails" },
      { status: 500 },
    );
  }
}

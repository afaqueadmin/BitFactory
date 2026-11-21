import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const auth = await authorizeStaff(request, ["email_reports.view"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const q = searchParams.get("q")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "10") || 10),
    );
    const offset = (page - 1) * limit;

    // Get the run details
    const run = await prisma.emailSendRun.findUnique({
      where: { id: runId },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Email run not found" },
        { status: 404 },
      );
    }

    // Build filter for results
    const resultFilter: Prisma.EmailSendResultWhereInput = { runId };
    if (statusFilter === "success") {
      resultFilter.success = true;
    } else if (statusFilter === "failed") {
      resultFilter.success = false;
    }
    if (q) {
      resultFilter.OR = [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { invoice: { invoiceNumber: { contains: q, mode: "insensitive" } } },
        { documentNumber: { contains: q, mode: "insensitive" } },
      ];
    }

    // Get results with pagination
    const results = await prisma.emailSendResult.findMany({
      where: resultFilter,
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            dueDate: true,
            invoiceType: true,
            status: true,
          },
        },
        memo: {
          select: {
            id: true,
            memoNumber: true,
            amount: true,
            category: true,
            status: true,
          },
        },
      },
      skip: offset,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Filtered count for pagination; unfiltered count to flag runs whose
    // rows were lost to invoice deletes before history was kept.
    const [totalResults, recordedRows] = await Promise.all([
      prisma.emailSendResult.count({ where: resultFilter }),
      prisma.emailSendResult.count({ where: { runId } }),
    ]);

    const formattedResults = results.map((result) => ({
      id: result.id,
      invoiceId: result.invoiceId,
      invoice: result.invoice,
      memo: result.memo,
      documentNumber:
        result.documentNumber ??
        result.memo?.memoNumber ??
        result.invoice?.invoiceNumber ??
        null,
      customerId: result.customerId,
      customerName: result.customerName,
      customerEmail: result.customerEmail,
      ccEmails: result.ccEmails ? result.ccEmails.split(",") : [],
      success: result.success,
      errorMessage: result.errorMessage,
      sentAt: result.sentAt,
      createdAt: result.createdAt,
    }));

    return NextResponse.json({
      success: true,
      run: {
        id: run.id,
        type: run.type,
        kind: run.kind,
        source: run.source,
        status: run.status,
        totalInvoices: run.totalInvoices,
        recordedRows,
        successCount: run.successCount,
        failureCount: run.failureCount,
        createdBy: run.creator,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      results: formattedResults,
      pagination: {
        page,
        limit,
        total: totalResults,
        totalPages: Math.ceil(totalResults / limit),
      },
    });
  } catch (error) {
    console.error("Get email run details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email run details" },
      { status: 500 },
    );
  }
}

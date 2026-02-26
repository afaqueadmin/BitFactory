import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(
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
        { error: "Only administrators can view email reports" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "10"));
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
    const resultFilter: { runId: string; success?: boolean } = { runId };
    if (statusFilter === "success") {
      resultFilter.success = true;
    } else if (statusFilter === "failed") {
      resultFilter.success = false;
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
          },
        },
      },
      skip: offset,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Get total count for pagination
    const totalResults = await prisma.emailSendResult.count({
      where: resultFilter,
    });

    const formattedResults = results.map((result) => ({
      id: result.id,
      invoiceId: result.invoiceId,
      invoice: result.invoice,
      customerName: result.customerName,
      customerEmail: result.customerEmail,
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
        status: run.status,
        totalInvoices: run.totalInvoices,
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

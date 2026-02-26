import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
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
        { error: "Only administrators can view email reports" },
        { status: 403 },
      );
    }

    // Get all email send runs with summary
    const runs = await prisma.emailSendRun.findMany({
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Format response
    const formattedRuns = runs.map((run) => ({
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
    }));

    return NextResponse.json({
      success: true,
      data: formattedRuns,
      count: formattedRuns.length,
    });
  } catch (error) {
    console.error("Get email runs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch email runs" },
      { status: 500 },
    );
  }
}

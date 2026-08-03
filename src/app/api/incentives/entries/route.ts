import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

// Admin-wide incentive ledger. For a franchisee's own scoped view, see
// GET /api/franchise/incentives instead.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access the incentive ledger" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const franchiseId = searchParams.get("franchiseId");
    const incentiveType = searchParams.get("incentiveType");
    const status = searchParams.get("status");
    const paid = searchParams.get("paid"); // "true" | "false"
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where: Record<string, unknown> = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (incentiveType) where.incentiveType = incentiveType;
    if (status) where.status = status;
    if (paid === "true") where.payoutBatchId = { not: null };
    if (paid === "false") where.payoutBatchId = null;
    if (dateFrom || dateTo) {
      where.accrualDate = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.incentiveEntry.findMany({
        where,
        include: {
          franchise: { select: { id: true, businessName: true } },
          clientUser: { select: { id: true, name: true, email: true } },
          payoutBatch: { select: { id: true, paidDate: true } },
        },
        orderBy: { accrualDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.incentiveEntry.count({ where }),
    ]);

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get incentive entries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive entries" },
      { status: 500 },
    );
  }
}

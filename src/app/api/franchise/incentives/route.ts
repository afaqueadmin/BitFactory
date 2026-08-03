/**
 * GET /api/franchise/incentives
 *
 * Franchisee-facing incentive ledger — scoped to the calling franchisee's
 * own franchise via getOwnFranchise (see src/lib/franchiseeScope.ts).
 * FRANCHISEE role only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { getOwnFranchise } from "@/lib/franchiseeScope";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { error: "Only franchisees can access this ledger" },
        { status: 403 },
      );
    }

    const franchise = await getOwnFranchise(decoded.userId);
    if (!franchise) {
      return NextResponse.json(
        { error: "No franchise found for this account" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const incentiveType = searchParams.get("incentiveType");
    const status = searchParams.get("status");
    const paid = searchParams.get("paid"); // "true" | "false"
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where: Record<string, unknown> = { franchiseId: franchise.id };
    if (incentiveType) where.incentiveType = incentiveType;
    if (status) where.status = status;
    if (paid === "true") where.payoutBatchId = { not: null };
    if (paid === "false") where.payoutBatchId = null;

    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      prisma.incentiveEntry.findMany({
        where,
        include: {
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
    console.error("Get franchise incentive entries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive entries" },
      { status: 500 },
    );
  }
}

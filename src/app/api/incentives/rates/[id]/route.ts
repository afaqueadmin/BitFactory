import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
        { error: "Only administrators can access incentive rates" },
        { status: 403 },
      );
    }

    const rate = await prisma.franchiseIncentiveRate.findUnique({
      where: { id },
      include: {
        franchise: { select: { id: true, businessName: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    if (!rate) {
      return NextResponse.json(
        { error: "Incentive rate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(rate);
  } catch (error) {
    console.error("Get incentive rate error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive rate" },
      { status: 500 },
    );
  }
}

// DELETE is only permitted for a rate that hasn't taken effect yet (future
// effectiveFrom) and has never been used to accrue an entry — this keeps
// history that entries were snapshotted against immutable.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
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
        { error: "Only administrators can delete incentive rates" },
        { status: 403 },
      );
    }

    const rate = await prisma.franchiseIncentiveRate.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });

    if (!rate) {
      return NextResponse.json(
        { error: "Incentive rate not found" },
        { status: 404 },
      );
    }

    if (rate.effectiveFrom <= new Date()) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a rate that is already effective. Archive it by creating a new rate instead.",
        },
        { status: 400 },
      );
    }

    if (rate._count.entries > 0) {
      return NextResponse.json(
        { error: "Cannot delete a rate that has accrued incentive entries" },
        { status: 400 },
      );
    }

    await prisma.franchiseIncentiveRate.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCENTIVE_RATE_ARCHIVED,
        entityType: "FranchiseIncentiveRate",
        entityId: id,
        userId,
        description: `Future incentive rate deleted for franchise ${rate.franchiseId}`,
        changes: JSON.stringify({ franchiseId: rate.franchiseId }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete incentive rate error:", error);
    return NextResponse.json(
      { error: "Failed to delete incentive rate" },
      { status: 500 },
    );
  }
}

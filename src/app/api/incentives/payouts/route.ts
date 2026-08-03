import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@prisma/client";

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
        { error: "Only administrators can access incentive payouts" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const franchiseId = searchParams.get("franchiseId");

    const where: Record<string, unknown> = {};
    if (franchiseId) where.franchiseId = franchiseId;

    const payouts = await prisma.incentivePayoutBatch.findMany({
      where,
      include: {
        franchise: { select: { id: true, businessName: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
      },
      orderBy: { paidDate: "desc" },
    });

    return NextResponse.json({ payouts });
  } catch (error) {
    console.error("Get incentive payouts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive payouts" },
      { status: 500 },
    );
  }
}

// Creates a payout batch and marks the matching IncentiveEntry rows as paid.
// Pass entryIds for an individual/selected payout, or omit it (with an
// optional periodFrom/periodTo) to bulk-pay every outstanding ACCRUED entry
// for that franchise in range — the same endpoint covers both flows.
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
        { error: "Only administrators can create incentive payouts" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { franchiseId, entryIds, periodFrom, periodTo, notes, paidDate } =
      body as {
        franchiseId?: string;
        entryIds?: string[];
        periodFrom?: string;
        periodTo?: string;
        notes?: string;
        paidDate?: string;
      };

    if (!franchiseId) {
      return NextResponse.json(
        { error: "Missing required field: franchiseId" },
        { status: 400 },
      );
    }

    const franchise = await prisma.franchise.findUnique({
      where: { id: franchiseId },
      select: { id: true },
    });
    if (!franchise) {
      return NextResponse.json(
        { error: "Franchise not found" },
        { status: 404 },
      );
    }

    const entryWhere: Record<string, unknown> =
      entryIds && entryIds.length > 0
        ? {
            id: { in: entryIds },
            franchiseId,
            status: "ACCRUED",
            payoutBatchId: null,
          }
        : {
            franchiseId,
            status: "ACCRUED",
            payoutBatchId: null,
            ...(periodFrom || periodTo
              ? {
                  accrualDate: {
                    ...(periodFrom ? { gte: new Date(periodFrom) } : {}),
                    ...(periodTo ? { lte: new Date(periodTo) } : {}),
                  },
                }
              : {}),
          };

    const entriesToPay = await prisma.incentiveEntry.findMany({
      where: entryWhere,
      select: { id: true, amount: true },
    });

    if (entriesToPay.length === 0) {
      return NextResponse.json(
        { error: "No unpaid incentive entries matched the given criteria" },
        { status: 400 },
      );
    }

    const totalAmount = entriesToPay.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );
    const finalPaidDate = paidDate ? new Date(paidDate) : new Date();

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.incentivePayoutBatch.create({
        data: {
          franchiseId,
          periodFrom: periodFrom ? new Date(periodFrom) : null,
          periodTo: periodTo ? new Date(periodTo) : null,
          totalAmount,
          entryCount: entriesToPay.length,
          paidDate: finalPaidDate,
          notes: notes || null,
          createdBy: userId,
        },
      });

      await tx.incentiveEntry.updateMany({
        where: { id: { in: entriesToPay.map((e) => e.id) } },
        data: { payoutBatchId: created.id },
      });

      return created;
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCENTIVE_PAYOUT_CREATED,
        entityType: "IncentivePayoutBatch",
        entityId: batch.id,
        userId,
        description: `Incentive payout of ${totalAmount} created for franchise ${franchiseId} (${entriesToPay.length} entries)`,
        changes: JSON.stringify({
          franchiseId,
          totalAmount: totalAmount.toString(),
          entryCount: entriesToPay.length,
          entryIds: entriesToPay.map((e) => e.id),
        }),
      },
    });

    const fullBatch = await prisma.incentivePayoutBatch.findUnique({
      where: { id: batch.id },
      include: {
        franchise: { select: { id: true, businessName: true } },
        entries: true,
      },
    });

    return NextResponse.json(fullBatch, { status: 201 });
  } catch (error) {
    console.error("Create incentive payout error:", error);
    return NextResponse.json(
      { error: "Failed to create incentive payout" },
      { status: 500 },
    );
  }
}

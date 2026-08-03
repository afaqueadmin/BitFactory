import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, IncentiveType, IncentiveRateBasis } from "@prisma/client";

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
        { error: "Only administrators can access incentive rates" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const franchiseId = searchParams.get("franchiseId");
    const incentiveType = searchParams.get("incentiveType");

    const where: Record<string, unknown> = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (incentiveType) where.incentiveType = incentiveType;

    const rates = await prisma.franchiseIncentiveRate.findMany({
      where,
      include: {
        franchise: { select: { id: true, businessName: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
      orderBy: [{ incentiveType: "asc" }, { effectiveFrom: "desc" }],
    });

    return NextResponse.json({ rates });
  } catch (error) {
    console.error("Get incentive rates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch incentive rates" },
      { status: 500 },
    );
  }
}

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
        { error: "Only administrators can create incentive rates" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      franchiseId,
      incentiveType,
      rateBasis,
      flatAmount,
      percentage,
      effectiveFrom,
      effectiveTo,
    } = body;

    if (!franchiseId || !incentiveType || !effectiveFrom) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: franchiseId, incentiveType, effectiveFrom",
        },
        { status: 400 },
      );
    }

    if (!Object.values(IncentiveType).includes(incentiveType)) {
      return NextResponse.json(
        { error: `Invalid incentiveType: ${incentiveType}` },
        { status: 400 },
      );
    }

    if (incentiveType === IncentiveType.HARDWARE_SALE) {
      if (
        !rateBasis ||
        !Object.values(IncentiveRateBasis).includes(rateBasis)
      ) {
        return NextResponse.json(
          { error: "HARDWARE_SALE rates require a valid rateBasis" },
          { status: 400 },
        );
      }
      if (
        rateBasis === IncentiveRateBasis.FLAT_PER_UNIT &&
        flatAmount == null
      ) {
        return NextResponse.json(
          { error: "flatAmount is required when rateBasis is FLAT_PER_UNIT" },
          { status: 400 },
        );
      }
      if (rateBasis === IncentiveRateBasis.PERCENTAGE && percentage == null) {
        return NextResponse.json(
          { error: "percentage is required when rateBasis is PERCENTAGE" },
          { status: 400 },
        );
      }
    } else if (incentiveType === IncentiveType.OWN_MACHINE_HOSTING_REBATE) {
      if (flatAmount == null) {
        return NextResponse.json(
          {
            error:
              "flatAmount is required for OWN_MACHINE_HOSTING_REBATE rates",
          },
          { status: 400 },
        );
      }
    } else if (incentiveType === IncentiveType.CLIENT_HOSTING_COMMISSION) {
      if (percentage == null) {
        return NextResponse.json(
          {
            error: "percentage is required for CLIENT_HOSTING_COMMISSION rates",
          },
          { status: 400 },
        );
      }
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

    const effectiveFromDate = new Date(effectiveFrom);

    const rate = await prisma.$transaction(async (tx) => {
      // Archive the prior open-ended rate of this type for this franchise
      await tx.franchiseIncentiveRate.updateMany({
        where: {
          franchiseId,
          incentiveType,
          effectiveTo: null,
        },
        data: {
          effectiveTo: effectiveFromDate,
        },
      });

      return tx.franchiseIncentiveRate.create({
        data: {
          franchiseId,
          incentiveType,
          rateBasis:
            incentiveType === IncentiveType.HARDWARE_SALE ? rateBasis : null,
          flatAmount: flatAmount != null ? parseFloat(flatAmount) : null,
          percentage: percentage != null ? parseFloat(percentage) : null,
          effectiveFrom: effectiveFromDate,
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
          createdBy: userId,
        },
        include: {
          franchise: { select: { id: true, businessName: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
        },
      });
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCENTIVE_RATE_CREATED,
        entityType: "FranchiseIncentiveRate",
        entityId: rate.id,
        userId,
        description: `Incentive rate (${incentiveType}) created for franchise ${franchiseId}`,
        changes: JSON.stringify({
          franchiseId,
          incentiveType,
          rateBasis,
          flatAmount,
          percentage,
          effectiveFrom,
        }),
      },
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    console.error("Create incentive rate error:", error);
    return NextResponse.json(
      { error: "Failed to create incentive rate" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";

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
        { error: "Only administrators can access pricing configs" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (customerId) where.userId = customerId;

    const skip = (page - 1) * limit;

    const [pricingConfigs, total] = await Promise.all([
      prisma.customerPricingConfig.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
        },
        orderBy: { effectiveFrom: "desc" },
        skip,
        take: limit,
      }),
      prisma.customerPricingConfig.count({ where }),
    ]);

    return NextResponse.json({
      pricingConfigs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get pricing configs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing configs" },
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
        { error: "Only administrators can create pricing configs" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { customerId, defaultUnitPrice, effectiveFrom, effectiveTo } = body;

    if (!customerId || !defaultUnitPrice || !effectiveFrom) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customerId, defaultUnitPrice, effectiveFrom",
        },
        { status: 400 },
      );
    }

    // Archive previous pricing configs for this customer
    await prisma.customerPricingConfig.updateMany({
      where: {
        userId: customerId,
        effectiveTo: null,
      },
      data: {
        effectiveTo: new Date(effectiveFrom),
      },
    });

    const pricingConfig = await prisma.customerPricingConfig.create({
      data: {
        userId: customerId,
        defaultUnitPrice: parseFloat(defaultUnitPrice),
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        createdBy: userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PRICING_CONFIG_CREATED,
        entityType: "CustomerPricingConfig",
        entityId: pricingConfig.id,
        userId,
        description: `Pricing config created for customer ${customerId} at ${defaultUnitPrice}`,
        changes: JSON.stringify({
          customerId,
          defaultUnitPrice: defaultUnitPrice.toString(),
          effectiveFrom,
        }),
      },
    });

    return NextResponse.json(pricingConfig, { status: 201 });
  } catch (error) {
    console.error("Create pricing config error:", error);
    return NextResponse.json(
      { error: "Failed to create pricing config" },
      { status: 500 },
    );
  }
}

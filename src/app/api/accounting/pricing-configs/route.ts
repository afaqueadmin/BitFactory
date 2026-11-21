import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["pricing.view"]);
    if ("response" in auth) return auth.response;

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
    const auth = await authorizeStaff(request, ["pricing.edit"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;

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

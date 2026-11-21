import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["pricing.view"]);
    if ("response" in auth) return auth.response;

    const pricingConfig = await prisma.customerPricingConfig.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    if (!pricingConfig) {
      return NextResponse.json(
        { error: "Pricing config not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(pricingConfig);
  } catch (error) {
    console.error("Get pricing config error:", error);
    return NextResponse.json(
      { error: "Failed to fetch pricing config" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["pricing.edit"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;

    const body = await request.json();
    const { defaultUnitPrice, effectiveTo } = body;

    const currentPricingConfig = await prisma.customerPricingConfig.findUnique({
      where: { id },
    });

    if (!currentPricingConfig) {
      return NextResponse.json(
        { error: "Pricing config not found" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = { updatedBy: userId };
    const changes: Record<string, unknown> = {};

    if (defaultUnitPrice !== undefined) {
      updateData.defaultUnitPrice = parseFloat(defaultUnitPrice);
      changes.defaultUnitPrice = {
        from: currentPricingConfig.defaultUnitPrice.toString(),
        to: defaultUnitPrice.toString(),
      };
    }

    if (effectiveTo !== undefined) {
      updateData.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
      changes.effectiveTo = effectiveTo;
    }

    const pricingConfig = await prisma.customerPricingConfig.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.PRICING_CONFIG_UPDATED,
        entityType: "CustomerPricingConfig",
        entityId: pricingConfig.id,
        userId,
        description: `Pricing config updated`,
        changes: JSON.stringify(changes),
      },
    });

    return NextResponse.json(pricingConfig);
  } catch (error) {
    console.error("Update pricing config error:", error);
    return NextResponse.json(
      { error: "Failed to update pricing config" },
      { status: 500 },
    );
  }
}

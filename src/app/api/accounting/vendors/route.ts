import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { vendorCountInclude } from "@/lib/accounting/vendorRules";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const searchParams = new URL(request.url).searchParams;
    const activeOnly = searchParams.get("active") === "true";
    const forType = searchParams.get("for");

    const vendors = await prisma.accountingVendor.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(forType === "hardware" ? { forHardwarePurchases: true } : {}),
        ...(forType === "farm" ? { forFarmTariffs: true } : {}),
      },
      include: vendorCountInclude,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: vendors });
  } catch (error) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendors" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: {
      name?: unknown;
      forHardwarePurchases?: unknown;
      forFarmTariffs?: unknown;
    } = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
        { status: 400 },
      );
    }
    const forHardwarePurchases = body.forHardwarePurchases === true;
    const forFarmTariffs = body.forFarmTariffs === true;
    if (!forHardwarePurchases && !forFarmTariffs) {
      return NextResponse.json(
        { error: "Choose Hardware Purchases, Farm Tariffs or both" },
        { status: 400 },
      );
    }

    const vendor = await prisma.accountingVendor.create({
      data: { name, forHardwarePurchases, forFarmTariffs, createdBy: userId },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_VENDOR_CREATED,
        entityType: "AccountingVendor",
        entityId: vendor.id,
        userId,
        description: `Vendor ${vendor.name} created`,
        changes: JSON.stringify({ name, forHardwarePurchases, forFarmTariffs }),
      },
    });

    return NextResponse.json({ success: true, data: vendor }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A vendor with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating vendor:", error);
    return NextResponse.json(
      { error: "Failed to create vendor" },
      { status: 500 },
    );
  }
}

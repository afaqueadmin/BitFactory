import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { vendorCountInclude } from "@/lib/accounting/vendorRules";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingVendor.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const body: {
      name?: unknown;
      isActive?: unknown;
      forHardwarePurchases?: unknown;
      forFarmTariffs?: unknown;
    } = await request.json();
    const data: {
      name?: string;
      isActive?: boolean;
      forHardwarePurchases?: boolean;
      forFarmTariffs?: boolean;
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json(
          { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
          { status: 400 },
        );
      }
      data.name = name;
    }
    for (const field of [
      "isActive",
      "forHardwarePurchases",
      "forFarmTariffs",
    ] as const) {
      if (body[field] === undefined) continue;
      if (typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: `${field} must be true or false` },
          { status: 400 },
        );
      }
      data[field] = body[field];
    }
    const forHardwarePurchases =
      data.forHardwarePurchases ?? existing.forHardwarePurchases;
    const forFarmTariffs = data.forFarmTariffs ?? existing.forFarmTariffs;
    if (!forHardwarePurchases && !forFarmTariffs) {
      return NextResponse.json(
        { error: "Choose Hardware Purchases, Farm Tariffs or both" },
        { status: 400 },
      );
    }

    const vendor = await prisma.accountingVendor.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_VENDOR_UPDATED,
        entityType: "AccountingVendor",
        entityId: id,
        userId,
        description: `Vendor ${vendor.name} updated`,
        changes: JSON.stringify({
          before: {
            name: existing.name,
            isActive: existing.isActive,
            forHardwarePurchases: existing.forHardwarePurchases,
            forFarmTariffs: existing.forFarmTariffs,
          },
          after: data,
        }),
      },
    });

    return NextResponse.json({ success: true, data: vendor });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A vendor with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: "Failed to update vendor" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingVendor.findUnique({
      where: { id },
      include: vendorCountInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const { hardwarePurchases, vendorInvoices, depositMovements } =
      existing._count;
    if (hardwarePurchases + vendorInvoices + depositMovements > 0) {
      return NextResponse.json(
        {
          error:
            "This vendor is used by invoices or deposit records. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.accountingVendor.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_VENDOR_DELETED,
        entityType: "AccountingVendor",
        entityId: id,
        userId,
        description: `Vendor ${existing.name} deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json(
      { error: "Failed to delete vendor" },
      { status: 500 },
    );
  }
}

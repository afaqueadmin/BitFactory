import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingEntity.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const body: { name?: unknown; isActive?: unknown } = await request.json();
    const data: { name?: string; isActive?: boolean } = {};

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
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { error: "isActive must be true or false" },
          { status: 400 },
        );
      }
      data.isActive = body.isActive;
    }

    const entity = await prisma.accountingEntity.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_ENTITY_UPDATED,
        entityType: "AccountingEntity",
        entityId: id,
        userId,
        description: `Accounting entity ${entity.name} updated`,
        changes: JSON.stringify({
          before: { name: existing.name, isActive: existing.isActive },
          after: data,
        }),
      },
    });

    return NextResponse.json({ success: true, data: entity });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "An entity with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error updating accounting entity:", error);
    return NextResponse.json(
      { error: "Failed to update entity" },
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

    const existing = await prisma.accountingEntity.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            banks: true,
            vendorInvoicePayments: true,
            hardwarePurchasePayments: true,
            costPayments: true,
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const {
      banks,
      vendorInvoicePayments,
      hardwarePurchasePayments,
      costPayments,
    } = existing._count;
    if (
      banks > 0 ||
      vendorInvoicePayments + hardwarePurchasePayments + costPayments > 0
    ) {
      return NextResponse.json(
        {
          error:
            banks > 0
              ? "This entity still has banks. Delete or move them first, or deactivate the entity instead."
              : "This entity is used by recorded payments. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.accountingEntity.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_ENTITY_DELETED,
        entityType: "AccountingEntity",
        entityId: id,
        userId,
        description: `Accounting entity ${existing.name} deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting accounting entity:", error);
    return NextResponse.json(
      { error: "Failed to delete entity" },
      { status: 500 },
    );
  }
}

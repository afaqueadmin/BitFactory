import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import {
  bankInclude,
  MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH,
  parseCurrencyIds,
} from "@/lib/accounting/masterData";

async function paymentReferenceCount(bankId: string): Promise<number> {
  const [vendor, hardware] = await Promise.all([
    prisma.vendorInvoice.count({ where: { paymentBankId: bankId } }),
    prisma.hardwarePurchaseInvoice.count({ where: { paymentBankId: bankId } }),
  ]);
  return vendor + hardware;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingBank.findUnique({
      where: { id },
      include: { currencies: { select: { currencyId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    const body: {
      entityId?: unknown;
      name?: unknown;
      currencyIds?: unknown;
      isActive?: unknown;
    } = await request.json();
    const data: { entityId?: string; name?: string; isActive?: boolean } = {};

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

    if (body.entityId !== undefined && body.entityId !== existing.entityId) {
      if (typeof body.entityId !== "string" || !body.entityId) {
        return NextResponse.json(
          { error: "Entity is required" },
          { status: 400 },
        );
      }
      const entity = await prisma.accountingEntity.findUnique({
        where: { id: body.entityId },
        select: { id: true },
      });
      if (!entity) {
        return NextResponse.json(
          { error: "Entity not found" },
          { status: 400 },
        );
      }
      // Recorded payments store entity and bank together; moving a bank
      // that payments already use would make that history inconsistent.
      if ((await paymentReferenceCount(id)) > 0) {
        return NextResponse.json(
          {
            error:
              "This bank is used by recorded payments, so its entity can't change. Create a new bank under the other entity instead.",
          },
          { status: 409 },
        );
      }
      data.entityId = body.entityId;
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

    let currencyIds: string[] | undefined;
    if (body.currencyIds !== undefined) {
      const parsed = await parseCurrencyIds(body.currencyIds);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      currencyIds = parsed.ids;
    }

    const bank = await prisma.$transaction(async (tx) => {
      if (currencyIds) {
        await tx.accountingBankCurrency.deleteMany({ where: { bankId: id } });
        await tx.accountingBankCurrency.createMany({
          data: currencyIds.map((currencyId) => ({ bankId: id, currencyId })),
        });
      }
      return tx.accountingBank.update({
        where: { id },
        data,
        include: bankInclude,
      });
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_BANK_UPDATED,
        entityType: "AccountingBank",
        entityId: id,
        userId,
        description: `Accounting bank ${bank.name} (${bank.entity.name}) updated`,
        changes: JSON.stringify({
          before: {
            entityId: existing.entityId,
            name: existing.name,
            isActive: existing.isActive,
            currencyIds: existing.currencies.map((c) => c.currencyId),
          },
          after: { ...data, ...(currencyIds ? { currencyIds } : {}) },
        }),
      },
    });

    return NextResponse.json({ success: true, data: bank });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "This entity already has a bank with this name" },
        { status: 400 },
      );
    }
    console.error("Error updating accounting bank:", error);
    return NextResponse.json(
      { error: "Failed to update bank" },
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

    const existing = await prisma.accountingBank.findUnique({
      where: { id },
      include: { entity: { select: { name: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    }

    if ((await paymentReferenceCount(id)) > 0) {
      return NextResponse.json(
        {
          error:
            "This bank is used by recorded payments. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    // Its currency links are removed by the cascade on the join table.
    await prisma.accountingBank.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_BANK_DELETED,
        entityType: "AccountingBank",
        entityId: id,
        userId,
        description: `Accounting bank ${existing.name} (${existing.entity.name}) deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting accounting bank:", error);
    return NextResponse.json(
      { error: "Failed to delete bank" },
      { status: 500 },
    );
  }
}

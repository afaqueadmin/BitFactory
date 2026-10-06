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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entityId");
    const activeOnly = searchParams.get("active") === "true";

    const banks = await prisma.accountingBank.findMany({
      where: {
        ...(entityId ? { entityId } : {}),
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: bankInclude,
      orderBy: [{ entity: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: banks });
  } catch (error) {
    console.error("Error fetching accounting banks:", error);
    return NextResponse.json(
      { error: "Failed to fetch banks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: { entityId?: unknown; name?: unknown; currencyIds?: unknown } =
      await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const entityId = typeof body.entityId === "string" ? body.entityId : "";

    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
        { status: 400 },
      );
    }
    if (!entityId) {
      return NextResponse.json(
        { error: "Entity is required" },
        { status: 400 },
      );
    }
    const entity = await prisma.accountingEntity.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 400 });
    }

    const currencies = await parseCurrencyIds(body.currencyIds);
    if ("error" in currencies) {
      return NextResponse.json({ error: currencies.error }, { status: 400 });
    }

    const bank = await prisma.accountingBank.create({
      data: {
        entityId,
        name,
        createdBy: userId,
        currencies: {
          create: currencies.ids.map((currencyId) => ({ currencyId })),
        },
      },
      include: bankInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_BANK_CREATED,
        entityType: "AccountingBank",
        entityId: bank.id,
        userId,
        description: `Accounting bank ${bank.name} (${bank.entity.name}) created`,
        changes: JSON.stringify({
          entityId,
          name,
          currencyIds: currencies.ids,
        }),
      },
    });

    return NextResponse.json({ success: true, data: bank }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "This entity already has a bank with this name" },
        { status: 400 },
      );
    }
    console.error("Error creating accounting bank:", error);
    return NextResponse.json(
      { error: "Failed to create bank" },
      { status: 500 },
    );
  }
}

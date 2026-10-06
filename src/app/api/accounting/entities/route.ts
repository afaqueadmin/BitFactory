import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const activeOnly =
      new URL(request.url).searchParams.get("active") === "true";

    const entities = await prisma.accountingEntity.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { _count: { select: { banks: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: entities });
  } catch (error) {
    console.error("Error fetching accounting entities:", error);
    return NextResponse.json(
      { error: "Failed to fetch entities" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: { name?: unknown } = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
        { status: 400 },
      );
    }

    const entity = await prisma.accountingEntity.create({
      data: { name, createdBy: userId },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_ENTITY_CREATED,
        entityType: "AccountingEntity",
        entityId: entity.id,
        userId,
        description: `Accounting entity ${entity.name} created`,
        changes: JSON.stringify({ name }),
      },
    });

    return NextResponse.json({ success: true, data: entity }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "An entity with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating accounting entity:", error);
    return NextResponse.json(
      { error: "Failed to create entity" },
      { status: 500 },
    );
  }
}

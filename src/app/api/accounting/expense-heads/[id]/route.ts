import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { headCountInclude } from "@/lib/accounting/expenseRequest";

/** Renames a head, or (de)activates it. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingExpenseHead.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Head not found" }, { status: 404 });
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

    const head = await prisma.accountingExpenseHead.update({
      where: { id },
      data,
      include: headCountInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_HEAD_UPDATED,
        entityType: "AccountingExpenseHead",
        entityId: id,
        userId,
        description: `Expense head ${head.name} updated`,
        changes: JSON.stringify({
          before: { name: existing.name, isActive: existing.isActive },
          after: data,
        }),
      },
    });

    return NextResponse.json({ success: true, data: head });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A head with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error updating expense head:", error);
    return NextResponse.json(
      { error: "Failed to update the head" },
      { status: 500 },
    );
  }
}

/** Deletes a head no expense uses; a used head can only be deactivated. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingExpenseHead.findUnique({
      where: { id },
      include: headCountInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Head not found" }, { status: 404 });
    }
    if (existing._count.expenses > 0) {
      return NextResponse.json(
        { error: "This head is used by expenses. Deactivate it instead." },
        { status: 409 },
      );
    }

    await prisma.accountingExpenseHead.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_HEAD_DELETED,
        entityType: "AccountingExpenseHead",
        entityId: id,
        userId,
        description: `Expense head ${existing.name} deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense head:", error);
    return NextResponse.json(
      { error: "Failed to delete the head" },
      { status: 500 },
    );
  }
}

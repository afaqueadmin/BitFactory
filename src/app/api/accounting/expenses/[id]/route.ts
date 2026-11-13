import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  ExpenseRequest,
  parseExpenseRequest,
} from "@/lib/accounting/expenseRequest";
import { checkDueCoversPaid } from "@/lib/accounting/expense";
import { deleteObject } from "@/lib/storage/r2";
import { auditExpense, expenseInclude, expenseJson } from "../shared";

/**
 * Edits an expense. Amount Due can't drop below what has been paid. A
 * replaced or removed PDF / sheet is deleted from R2 after the save.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingExpense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const body: ExpenseRequest = await request.json();
    const parsed = await parseExpenseRequest(body, existing);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, headName } = parsed;

    const paidUsd = existing.payments.reduce(
      (s, p) => s.plus(p.amountUsd),
      new Decimal(0),
    );
    const dueError = checkDueCoversPaid(data.amountDueUsd, paidUsd);
    if (dueError) {
      return NextResponse.json({ error: dueError }, { status: 400 });
    }

    const expense = await prisma.accountingExpense.update({
      where: { id },
      data,
      include: expenseInclude,
    });

    // Files no longer referenced. A failure only leaves an orphan.
    for (const [before, after] of [
      [existing.pdfKey, data.pdfKey],
      [existing.sheetKey, data.sheetKey],
    ] as const) {
      if (before && before !== after) {
        await deleteObject(before).catch((error) =>
          console.error("Error deleting replaced expense file:", error),
        );
      }
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_UPDATED,
        entityType: "AccountingExpense",
        entityId: id,
        userId,
        description: `Expense under ${headName} updated: $${data.amountDueUsd.toFixed(2)} due`,
        changes: JSON.stringify({
          before: auditExpense(existing, existing.head.name),
          after: auditExpense(data, headName),
        }),
      },
    });

    return NextResponse.json({ success: true, data: expenseJson(expense) });
  } catch (error) {
    console.error("Error updating expense:", error);
    return NextResponse.json(
      { error: "Failed to update the expense" },
      { status: 500 },
    );
  }
}

/** Deletes an expense with no payments, and its files. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingExpense.findUnique({
      where: { id },
      include: expenseInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    if (existing.payments.length > 0) {
      return NextResponse.json(
        {
          error:
            "This expense has payments. Delete its payments first, then the expense.",
        },
        { status: 409 },
      );
    }

    for (const key of [existing.pdfKey, existing.sheetKey]) {
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch (error) {
        console.error("Error deleting expense file:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the attached file. The expense was not deleted",
          },
          { status: 500 },
        );
      }
    }

    await prisma.accountingExpense.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_DELETED,
        entityType: "AccountingExpense",
        entityId: id,
        userId,
        description: `Expense of $${existing.amountDueUsd.toFixed(2)} under ${existing.head.name} deleted`,
        changes: JSON.stringify(auditExpense(existing, existing.head.name)),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense:", error);
    return NextResponse.json(
      { error: "Failed to delete the expense" },
      { status: 500 },
    );
  }
}

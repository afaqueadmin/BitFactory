import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { headCountInclude } from "@/lib/accounting/expenseRequest";

/** Expense heads (?active=true: only active ones, for the Add expense form). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const activeOnly =
      new URL(request.url).searchParams.get("active") === "true";
    const heads = await prisma.accountingExpenseHead.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: headCountInclude,
      orderBy: { name: "asc" },
    });
    if (activeOnly) return NextResponse.json({ success: true, data: heads });

    // Full list (Expense Heads page): Amount due = Σ the head's expenses'
    // Amount Due; Amount paid = Σ their payments' USD (fees not included).
    const [expenses, paid] = await Promise.all([
      prisma.accountingExpense.findMany({
        select: { id: true, headId: true, amountDueUsd: true },
      }),
      prisma.accountingExpensePayment.groupBy({
        by: ["expenseId"],
        _sum: { amountUsd: true },
      }),
    ]);
    const paidByExpense = new Map(
      paid.map((p) => [p.expenseId, p._sum.amountUsd ?? new Decimal(0)]),
    );
    const totals = new Map<string, { due: Decimal; paid: Decimal }>();
    for (const e of expenses) {
      const t = totals.get(e.headId) ?? {
        due: new Decimal(0),
        paid: new Decimal(0),
      };
      t.due = t.due.plus(e.amountDueUsd);
      t.paid = t.paid.plus(paidByExpense.get(e.id) ?? 0);
      totals.set(e.headId, t);
    }
    return NextResponse.json({
      success: true,
      data: heads.map((h) => ({
        ...h,
        amountDueUsd: (totals.get(h.id)?.due ?? new Decimal(0)).toFixed(2),
        amountPaidUsd: (totals.get(h.id)?.paid ?? new Decimal(0)).toFixed(2),
      })),
    });
  } catch (error) {
    console.error("Error fetching expense heads:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense heads" },
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

    const head = await prisma.accountingExpenseHead.create({
      data: { name, createdBy: userId },
      include: headCountInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_HEAD_CREATED,
        entityType: "AccountingExpenseHead",
        entityId: head.id,
        userId,
        description: `Expense head ${head.name} created`,
        changes: JSON.stringify({ name }),
      },
    });

    return NextResponse.json({ success: true, data: head }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A head with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating expense head:", error);
    return NextResponse.json(
      { error: "Failed to create the head" },
      { status: 500 },
    );
  }
}

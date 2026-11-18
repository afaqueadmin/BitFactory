import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  ExpenseRequest,
  parseExpenseRequest,
} from "@/lib/accounting/expenseRequest";
import { auditExpense, expenseInclude, expenseJson } from "./shared";

/** Every expense with its payments, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const expenses = await prisma.accountingExpense.findMany({
      include: expenseInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({
      success: true,
      data: expenses.map(expenseJson),
    });
  } catch (error) {
    console.error("Error listing expenses:", error);
    return NextResponse.json(
      { error: "Failed to load expenses" },
      { status: 500 },
    );
  }
}

/** Adds an expense (unpaid). Payments are recorded separately. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: ExpenseRequest = await request.json();
    const parsed = await parseExpenseRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, headName } = parsed;

    const expense = await prisma.accountingExpense.create({
      data: { ...data, createdBy: userId },
      include: expenseInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_RECORDED,
        entityType: "AccountingExpense",
        entityId: expense.id,
        userId,
        description: `Expense of $${data.amountDueUsd.toFixed(2)} added under ${headName}`,
        changes: JSON.stringify(auditExpense(data, headName)),
      },
    });

    return NextResponse.json(
      { success: true, data: expenseJson(expense) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error adding expense:", error);
    return NextResponse.json(
      { error: "Failed to add the expense" },
      { status: 500 },
    );
  }
}

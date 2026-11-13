import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  auditExpensePayment,
  ExpensePaymentRequest,
  parseExpensePaymentRequest,
} from "@/lib/accounting/expenseRequest";
import {
  lockAndCheckBalance,
  OverpaidError,
} from "@/lib/accounting/expensePaymentSave";
import { expensePaymentInclude, expensePaymentJson } from "../../shared";

/**
 * Records a payment of an expense: amount and fee in the bank's currency,
 * refused when it is more than the remaining balance (expense.ts).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id: expenseId } = await params;

    const expense = await prisma.accountingExpense.findUnique({
      where: { id: expenseId },
      select: { head: { select: { name: true } } },
    });
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const body: ExpensePaymentRequest = await request.json();
    const parsed = await parseExpensePaymentRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    let payment;
    try {
      payment = await prisma.$transaction(async (tx) => {
        if (!(await lockAndCheckBalance(tx, expenseId, data))) return null;
        return tx.accountingExpensePayment.create({
          data: { ...data, expenseId, createdBy: userId },
          include: expensePaymentInclude,
        });
      });
    } catch (error) {
      if (error instanceof OverpaidError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    if (!payment) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_PAYMENT_RECORDED,
        entityType: "AccountingExpensePayment",
        entityId: payment.id,
        userId,
        description: `Expense payment of $${data.amountUsd.toFixed(2)} recorded (${expense.head.name}) from ${summary.bank} (${summary.code})`,
        changes: JSON.stringify({
          expenseId,
          ...auditExpensePayment(data, summary),
        }),
      },
    });

    return NextResponse.json(
      { success: true, data: expensePaymentJson(payment) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error recording expense payment:", error);
    return NextResponse.json(
      { error: "Failed to record the payment" },
      { status: 500 },
    );
  }
}

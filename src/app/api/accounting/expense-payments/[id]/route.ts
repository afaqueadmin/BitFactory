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
import { deleteObject } from "@/lib/storage/r2";
import {
  expensePaymentInclude,
  expensePaymentJson,
} from "../../expenses/shared";

const paymentInclude = {
  ...expensePaymentInclude,
  expense: { select: { head: { select: { name: true } } } },
} as const;

/**
 * Edits an expense payment (same body as Record). The new amount must still
 * fit in the balance. A replaced or removed receipt PDF is deleted from R2.
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

    const existing = await prisma.accountingExpensePayment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const body: ExpensePaymentRequest = await request.json();
    const parsed = await parseExpensePaymentRequest(body, {
      keepReceiptKey: existing.receiptKey,
    });
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    let payment;
    try {
      payment = await prisma.$transaction(async (tx) => {
        await lockAndCheckBalance(tx, existing.expenseId, data, id);
        return tx.accountingExpensePayment.update({
          where: { id },
          data,
          include: expensePaymentInclude,
        });
      });
    } catch (error) {
      if (error instanceof OverpaidError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    if (existing.receiptKey && existing.receiptKey !== data.receiptKey) {
      await deleteObject(existing.receiptKey).catch((error) =>
        console.error("Error deleting replaced expense receipt:", error),
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_PAYMENT_UPDATED,
        entityType: "AccountingExpensePayment",
        entityId: id,
        userId,
        description: `Expense payment updated (${existing.expense.head.name}): $${data.amountUsd.toFixed(2)} from ${summary.bank} (${summary.code})`,
        changes: JSON.stringify({
          before: expensePaymentJson(existing),
          after: auditExpensePayment(data, summary),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: expensePaymentJson(payment),
    });
  } catch (error) {
    console.error("Error updating expense payment:", error);
    return NextResponse.json(
      { error: "Failed to update the payment" },
      { status: 500 },
    );
  }
}

/** Deletes one expense payment, its receipt PDF first. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingExpensePayment.findUnique({
      where: { id },
      include: paymentInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (existing.receiptKey) {
      try {
        await deleteObject(existing.receiptKey);
      } catch (error) {
        console.error("Error deleting expense receipt:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the receipt PDF. The payment was not deleted",
          },
          { status: 500 },
        );
      }
    }

    await prisma.accountingExpensePayment.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_PAYMENT_DELETED,
        entityType: "AccountingExpensePayment",
        entityId: id,
        userId,
        description: `Expense payment of $${existing.amountUsd.toFixed(2)} (${existing.expense.head.name}) from ${existing.bank.name} deleted`,
        changes: JSON.stringify(expensePaymentJson(existing)),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense payment:", error);
    return NextResponse.json(
      { error: "Failed to delete the payment" },
      { status: 500 },
    );
  }
}

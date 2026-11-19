import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import {
  auditReconciliation,
  invoiceStillQualifies,
  parseReconciliationRequest,
  ReconciliationRequest,
} from "@/lib/accounting/bankReconciliationRequest";
import { reconciliationEntryLabel } from "@/lib/accounting/bankReconciliation";
import {
  NOT_QUALIFIED,
  reconciliationInclude,
  reconciliationJson,
} from "./shared";

/** Every Bank Reconciliation entry, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const entries = await prisma.accountingBankReconciliation.findMany({
      include: reconciliationInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({
      success: true,
      data: entries.map(reconciliationJson),
    });
  } catch (error) {
    console.error("Error listing Bank Reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to load Bank Reconciliation" },
      { status: 500 },
    );
  }
}

/** Adds an entry: one invoice's money into one bank (a Debit). */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: ReconciliationRequest = await request.json();
    const parsed = await parseReconciliationRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const entry = await prisma.$transaction(async (tx) => {
      if (
        !(await invoiceStillQualifies(tx, data.invoiceId, summary.invoiceType))
      ) {
        return null;
      }
      return tx.accountingBankReconciliation.create({
        data: { ...data, createdBy: userId },
        include: reconciliationInclude,
      });
    });
    if (!entry) {
      return NextResponse.json({ error: NOT_QUALIFIED }, { status: 409 });
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_RECONCILIATION_RECORDED,
        entityType: "AccountingBankReconciliation",
        entityId: entry.id,
        userId,
        description: `Bank Reconciliation ${reconciliationEntryLabel(entry.entryNumber)}: invoice ${summary.invoiceNumber}, $${data.amountUsd.toFixed(2)} received into ${summary.bank} (${summary.code})`,
        changes: JSON.stringify(auditReconciliation(data, summary)),
      },
    });

    return NextResponse.json(
      { success: true, data: reconciliationJson(entry) },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: NOT_QUALIFIED }, { status: 409 });
    }
    console.error("Error adding Bank Reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to add the entry" },
      { status: 500 },
    );
  }
}

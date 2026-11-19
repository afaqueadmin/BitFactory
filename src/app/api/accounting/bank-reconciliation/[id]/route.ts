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
import { deleteObject } from "@/lib/storage/r2";
import {
  NOT_QUALIFIED,
  reconciliationInclude,
  reconciliationJson,
  reconciliationSummary,
} from "../shared";

/**
 * Edits an entry (every field can change, the invoice too). A replaced or
 * removed PDF / sheet is deleted from R2 after the save.
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

    const existing = await prisma.accountingBankReconciliation.findUnique({
      where: { id },
      include: reconciliationInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const body: ReconciliationRequest = await request.json();
    const parsed = await parseReconciliationRequest(body, existing);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const entry = await prisma.$transaction(async (tx) => {
      if (
        !(await invoiceStillQualifies(
          tx,
          data.invoiceId,
          summary.invoiceType,
          existing.invoiceId,
        ))
      ) {
        return null;
      }
      return tx.accountingBankReconciliation.update({
        where: { id },
        data,
        include: reconciliationInclude,
      });
    });
    if (!entry) {
      return NextResponse.json({ error: NOT_QUALIFIED }, { status: 409 });
    }

    // Files no longer referenced. A failure only leaves an orphan.
    for (const [before, after] of [
      [existing.pdfKey, data.pdfKey],
      [existing.sheetKey, data.sheetKey],
    ] as const) {
      if (before && before !== after) {
        await deleteObject(before).catch((error) =>
          console.error(
            "Error deleting replaced Bank Reconciliation file:",
            error,
          ),
        );
      }
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_RECONCILIATION_UPDATED,
        entityType: "AccountingBankReconciliation",
        entityId: id,
        userId,
        description: `Bank Reconciliation ${reconciliationEntryLabel(entry.entryNumber)} updated: invoice ${summary.invoiceNumber}, $${data.amountUsd.toFixed(2)} into ${summary.bank}`,
        changes: JSON.stringify({
          before: auditReconciliation(
            existing,
            reconciliationSummary(existing),
          ),
          after: auditReconciliation(data, summary),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      data: reconciliationJson(entry),
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: NOT_QUALIFIED }, { status: 409 });
    }
    console.error("Error updating Bank Reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to update the entry" },
      { status: 500 },
    );
  }
}

/** Deletes an entry and its files. The invoice is not touched. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingBankReconciliation.findUnique({
      where: { id },
      include: reconciliationInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    for (const key of [existing.pdfKey, existing.sheetKey]) {
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch (error) {
        console.error("Error deleting Bank Reconciliation file:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the attached file. The entry was not deleted",
          },
          { status: 500 },
        );
      }
    }

    await prisma.accountingBankReconciliation.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_RECONCILIATION_DELETED,
        entityType: "AccountingBankReconciliation",
        entityId: id,
        userId,
        description: `Bank Reconciliation ${reconciliationEntryLabel(existing.entryNumber)} (invoice ${existing.invoice.invoiceNumber}, $${existing.amountUsd.toFixed(2)}) from ${existing.bank.name} deleted`,
        changes: JSON.stringify(
          auditReconciliation(existing, reconciliationSummary(existing)),
        ),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Bank Reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to delete the entry" },
      { status: 500 },
    );
  }
}

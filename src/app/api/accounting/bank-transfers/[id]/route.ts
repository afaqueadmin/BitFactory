import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  auditTransfer,
  parseTransferRequest,
  TransferRequest,
} from "@/lib/accounting/bankTransferRequest";
import { deleteObject } from "@/lib/storage/r2";
import { transferInclude, transferJson } from "../shared";

/**
 * Edits a transfer: every field can change (the body is the same as on
 * Record). A replaced or removed receipt PDF is deleted from R2 after the
 * save.
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

    const existing = await prisma.accountingBankTransfer.findUnique({
      where: { id },
      include: transferInclude,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Transfer not found" },
        { status: 404 },
      );
    }

    const body: TransferRequest = await request.json();
    const parsed = await parseTransferRequest(body, {
      keepReceiptKey: existing.receiptKey,
    });
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const transfer = await prisma.accountingBankTransfer.update({
      where: { id },
      data,
      include: transferInclude,
    });

    // The old PDF is no longer referenced. A failure only leaves an orphan.
    if (existing.receiptKey && existing.receiptKey !== data.receiptKey) {
      await deleteObject(existing.receiptKey).catch((error) =>
        console.error("Error deleting replaced transfer receipt:", error),
      );
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_TRANSFER_UPDATED,
        entityType: "AccountingBankTransfer",
        entityId: id,
        userId,
        description: `Internal transfer updated: ${summary.fromBank} (${summary.fromCode}) → ${summary.toBank} (${summary.toCode}), $${summary.amountUsd.toFixed(2)}`,
        changes: JSON.stringify({
          before: transferJson(existing),
          after: auditTransfer(data, summary),
        }),
      },
    });

    return NextResponse.json({ success: true, data: transferJson(transfer) });
  } catch (error) {
    console.error("Error updating bank transfer:", error);
    return NextResponse.json(
      { error: "Failed to update the transfer" },
      { status: 500 },
    );
  }
}

/** Deletes a transfer, its receipt PDF first. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingBankTransfer.findUnique({
      where: { id },
      include: transferInclude,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Transfer not found" },
        { status: 404 },
      );
    }

    if (existing.receiptKey) {
      try {
        await deleteObject(existing.receiptKey);
      } catch (error) {
        console.error("Error deleting transfer receipt:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the receipt PDF. The transfer was not deleted",
          },
          { status: 500 },
        );
      }
    }

    await prisma.accountingBankTransfer.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_TRANSFER_DELETED,
        entityType: "AccountingBankTransfer",
        entityId: id,
        userId,
        description: `Internal transfer of $${existing.amountUsd.toFixed(2)} deleted: ${existing.fromBank.name} (${existing.fromCurrency.code}) → ${existing.toBank.name} (${existing.toCurrency.code})`,
        changes: JSON.stringify(transferJson(existing)),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bank transfer:", error);
    return NextResponse.json(
      { error: "Failed to delete the transfer" },
      { status: 500 },
    );
  }
}

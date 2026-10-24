import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { lockVendor } from "@/lib/accounting/vendorDeposit";
import { deleteObject } from "@/lib/storage/r2";

class Rollback extends Error {}

/**
 * Deletes a security deposit return or adjustment (there is no edit: delete
 * and record again). A return's receipt PDF is removed from R2 first. An
 * adjustment can only go while its invoice is still Pending - once Paid,
 * the payment was recorded against the lower cash due.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const movement = await prisma.vendorDepositMovement.findUnique({
      where: { id },
      include: {
        vendor: { select: { name: true } },
        vendorInvoice: { select: { invoiceNumber: true } },
        hardwarePurchase: { select: { invoiceNumber: true } },
      },
    });
    if (!movement) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    if (movement.type === "RETURN" && movement.receiptKey) {
      try {
        await deleteObject(movement.receiptKey);
      } catch (error) {
        console.error("Error deleting deposit return receipt:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the receipt PDF. The return was not deleted",
          },
          { status: 500 },
        );
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await lockVendor(tx, movement.vendorId);
        if (movement.type === "ADJUSTMENT") {
          // Re-read inside the lock: record-payment may have just paid it.
          const invoice = movement.vendorInvoiceId
            ? await tx.vendorInvoice.findUnique({
                where: { id: movement.vendorInvoiceId },
                select: { paymentStatus: true },
              })
            : await tx.hardwarePurchaseInvoice.findUnique({
                where: { id: movement.hardwarePurchaseId as string },
                select: { paymentStatus: true },
              });
          if (invoice?.paymentStatus !== "Pending") {
            throw new Rollback(
              "This deposit was applied to an invoice that is now paid, so it can't be deleted",
            );
          }
        }
        await tx.vendorDepositMovement.delete({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Rollback) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const invoiceNumber =
      movement.vendorInvoice?.invoiceNumber ??
      movement.hardwarePurchase?.invoiceNumber;
    await prisma.auditLog.create({
      data: {
        action: AuditAction.VENDOR_DEPOSIT_MOVEMENT_DELETED,
        entityType: "VendorDepositMovement",
        entityId: id,
        userId,
        description:
          movement.type === "RETURN"
            ? `Security deposit return of $${movement.amountUsd.toFixed(2)} from ${movement.vendor.name} deleted`
            : `Security deposit adjustment of $${movement.amountUsd.toFixed(2)} on invoice ${invoiceNumber} (${movement.vendor.name}) deleted`,
        changes: JSON.stringify({
          type: movement.type,
          vendorId: movement.vendorId,
          date: movement.date,
          amountUsd: movement.amountUsd.toString(),
          vendorInvoiceId: movement.vendorInvoiceId,
          hardwarePurchaseId: movement.hardwarePurchaseId,
          receiptKey: movement.receiptKey,
          note: movement.note,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting security deposit movement:", error);
    return NextResponse.json(
      { error: "Failed to delete the record" },
      { status: 500 },
    );
  }
}

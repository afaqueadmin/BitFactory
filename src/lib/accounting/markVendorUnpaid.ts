import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { vendorPaymentInclude } from "@/lib/accounting/vendorInvoiceRules";
import {
  DepositInvoiceKind,
  getVendorDepositBalance,
  lockVendor,
} from "@/lib/accounting/vendorDeposit";

const CONFIG = {
  farm: {
    notFound: "Vendor invoice not found",
    entityType: "VendorInvoice",
    label: "vendor invoice",
    updatedAction: AuditAction.VENDOR_INVOICE_UPDATED,
  },
  hardware: {
    notFound: "Hardware purchase invoice not found",
    entityType: "HardwarePurchaseInvoice",
    label: "hardware purchase invoice",
    updatedAction: AuditAction.HARDWARE_PURCHASE_INVOICE_UPDATED,
  },
} as const;

class Rollback extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Token cookie, then SUPER_ADMIN only. Returns the caller's userId, or a
 * ready 401/403 response.
 */
export async function requireSuperAdmin(
  request: NextRequest,
): Promise<{ userId: string } | { response: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let userId: string;
  try {
    ({ userId } = await verifyJwtToken(token));
  } catch {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role !== "SUPER_ADMIN") {
    return {
      response: NextResponse.json(
        { error: "Only super administrators can mark invoices as unpaid" },
        { status: 403 },
      ),
    };
  }

  return { userId };
}

/**
 * Reverts a Paid Farm Tariff / Hardware Purchase invoice to Pending: clears
 * the paid date and receipt key and deletes the payment parts. Security
 * deposit adjustments applied to the invoice are kept - they are valid on a
 * Pending invoice and still lower its cash due when it is paid again.
 *
 * A Hardware Purchase's own security deposit moves from "paid" back to
 * "pending" for its vendor, so this is refused when the vendor has already
 * returned or applied more of the deposit than it would still hold.
 */
export async function markVendorSideUnpaid(
  kind: DepositInvoiceKind,
  id: string,
  userId: string,
): Promise<NextResponse> {
  const config = CONFIG[kind];

  const invoice =
    kind === "hardware"
      ? await prisma.hardwarePurchaseInvoice.findUnique({
          where: { id },
          include: { paymentParts: true },
        })
      : await prisma.vendorInvoice.findUnique({
          where: { id },
          include: { paymentParts: true },
        });
  if (!invoice) {
    return NextResponse.json({ error: config.notFound }, { status: 404 });
  }
  if (invoice.paymentStatus !== "Paid") {
    return NextResponse.json(
      {
        error: `Cannot mark invoice as unpaid - status is ${invoice.paymentStatus}, must be Paid`,
      },
      { status: 400 },
    );
  }

  const securityDeposit =
    "securityDeposit" in invoice ? invoice.securityDeposit : null;

  try {
    await prisma.$transaction(async (tx) => {
      if (invoice.vendorId) {
        // Serializes with deposit returns/adjustments for this vendor.
        await lockVendor(tx, invoice.vendorId);
        if (securityDeposit?.greaterThan(0)) {
          const balance = await getVendorDepositBalance(tx, invoice.vendorId);
          if (balance.held.lessThan(securityDeposit)) {
            throw new Rollback(
              `The vendor has already returned or applied part of this invoice's $${securityDeposit.toFixed(2)} security deposit (only $${balance.held.toFixed(2)} is still held), so it can't be marked as unpaid`,
              400,
            );
          }
        }
      }

      const where = { id, paymentStatus: "Paid" as const };
      const data = {
        paymentStatus: "Pending" as const,
        paidDate: null,
        paymentReceiptKey: null,
        updatedBy: userId,
      };
      const { count } =
        kind === "hardware"
          ? await tx.hardwarePurchaseInvoice.updateMany({ where, data })
          : await tx.vendorInvoice.updateMany({ where, data });
      if (count === 0) {
        throw new Rollback(
          "This invoice was updated by someone else. Reload and try again.",
          409,
        );
      }

      await tx.vendorPaymentPart.deleteMany({
        where:
          kind === "hardware"
            ? { hardwarePurchaseId: id }
            : { vendorInvoiceId: id },
      });

      await tx.auditLog.create({
        data: {
          action: config.updatedAction,
          entityType: config.entityType,
          entityId: id,
          userId,
          description: `${config.label[0].toUpperCase()}${config.label.slice(1)} ${invoice.invoiceNumber} marked as unpaid`,
          changes: JSON.stringify({
            paymentStatus: { from: "Paid", to: "Pending" },
            paidDate: { from: invoice.paidDate, to: null },
            // The receipt PDF stays in R2; its key is kept here for reference.
            paymentReceiptKey: { from: invoice.paymentReceiptKey, to: null },
            removedPaymentParts: invoice.paymentParts.map((p) => ({
              id: p.id,
              entityId: p.entityId,
              bankId: p.bankId,
              currencyId: p.currencyId,
              amount: p.amount.toString(),
              exchangeRate: p.exchangeRate.toString(),
              amountUsd: p.amountUsd.toString(),
              transactionFee: p.transactionFee.toString(),
            })),
          }),
        },
      });
    });
  } catch (error) {
    if (error instanceof Rollback) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  const include = {
    ...vendorPaymentInclude,
    createdByUser: { select: { id: true, email: true, name: true } },
    updatedByUser: { select: { id: true, email: true, name: true } },
  };
  const updated =
    kind === "hardware"
      ? await prisma.hardwarePurchaseInvoice.findUnique({
          where: { id },
          include,
        })
      : await prisma.vendorInvoice.findUnique({ where: { id }, include });

  return NextResponse.json({ success: true, data: updated });
}

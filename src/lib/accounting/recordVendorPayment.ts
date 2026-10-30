import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { parseDecimal } from "@/lib/accounting/paymentAccount";
import { vendorPaymentInclude } from "@/lib/accounting/vendorInvoiceRules";
import {
  parseVendorPayment,
  RecordVendorPaymentRequest,
  VendorPaymentPartData,
} from "@/lib/accounting/vendorPayment";
import {
  adjustedOnInvoice,
  DepositInvoiceKind,
  lockVendor,
  recordAdjustment,
} from "@/lib/accounting/vendorDeposit";

/**
 * Body of POST /api/{vendor-invoices|hardware-purchases}/[id]/record-payment:
 * the cash payment, plus an optional amount of the vendor's held security
 * deposit to apply to this invoice in the same step.
 */
export interface RecordVendorPaymentWithDepositRequest extends RecordVendorPaymentRequest {
  /** USD of held deposit to apply; blank or 0 for none. */
  depositAdjustment?: unknown;
}

const CONFIG = {
  farm: {
    receiptPurpose: "vendor-receipt",
    notFound: "Vendor invoice not found",
    entityType: "VendorInvoice",
    label: "vendor invoice",
    paidAction: AuditAction.VENDOR_INVOICE_PAID,
  },
  hardware: {
    receiptPurpose: "hardware-purchase-receipt",
    notFound: "Hardware purchase invoice not found",
    entityType: "HardwarePurchaseInvoice",
    label: "hardware purchase invoice",
    paidAction: AuditAction.HARDWARE_PURCHASE_INVOICE_PAID,
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
 * Records the payment of a Pending Farm Tariff / Hardware Purchase invoice
 * and marks it Paid.
 *
 * Cash due = total - deposit already applied - depositAdjustment. The
 * currency parts must match the cash due plus their transaction fees (D8).
 * When the deposit covers the
 * whole total there is no cash payment, so no parts or receipt are needed.
 */
export async function recordVendorSidePayment(
  kind: DepositInvoiceKind,
  id: string,
  userId: string,
  body: RecordVendorPaymentWithDepositRequest,
): Promise<NextResponse> {
  const config = CONFIG[kind];

  const invoice =
    kind === "hardware"
      ? await prisma.hardwarePurchaseInvoice.findUnique({ where: { id } })
      : await prisma.vendorInvoice.findUnique({ where: { id } });
  if (!invoice) {
    return NextResponse.json({ error: config.notFound }, { status: 404 });
  }
  if (invoice.paymentStatus !== "Pending") {
    return NextResponse.json(
      {
        error: `Cannot record payment for a ${invoice.paymentStatus.toLowerCase()} invoice`,
      },
      { status: 400 },
    );
  }

  const blank =
    body.depositAdjustment === undefined ||
    body.depositAdjustment === null ||
    body.depositAdjustment === "";
  const applied = blank
    ? new Decimal(0)
    : parseDecimal(body.depositAdjustment, { allowZero: true });
  if (!applied || applied.decimalPlaces() > 2) {
    return NextResponse.json(
      {
        error: "Deposit to apply must be 0 or more (up to 2 decimal places)",
      },
      { status: 400 },
    );
  }
  if (applied.greaterThan(0) && !invoice.vendorId) {
    return NextResponse.json(
      { error: "Set the invoice's vendor before applying a deposit" },
      { status: 400 },
    );
  }

  const alreadyAdjusted = await adjustedOnInvoice(prisma, kind, id);
  const cashDue = invoice.totalAmount.minus(alreadyAdjusted).minus(applied);
  if (cashDue.isNegative()) {
    return NextResponse.json(
      {
        error: `Only $${invoice.totalAmount.minus(alreadyAdjusted).toFixed(2)} of this invoice is still due`,
      },
      { status: 400 },
    );
  }

  // Cash payment, unless the deposit covers everything.
  let paidDate: Date;
  let receiptKey: string | null = null;
  let parts: VendorPaymentPartData[] = [];
  let paymentAudit: Record<string, unknown> | null = null;
  if (cashDue.isZero()) {
    paidDate =
      typeof body.paidDate === "string" && body.paidDate
        ? new Date(body.paidDate)
        : new Date(NaN);
    if (Number.isNaN(paidDate.getTime())) {
      return NextResponse.json(
        { error: "Paid date is required" },
        { status: 400 },
      );
    }
  } else {
    const parsed = await parseVendorPayment(
      body,
      cashDue,
      config.receiptPurpose,
    );
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    paidDate = parsed.data.paidDate;
    receiptKey = parsed.data.paymentReceiptKey;
    parts = parsed.parts;
    paymentAudit = parsed.audit;
  }

  // The deposit adjustment, the status change and the currency parts are
  // written together, or not at all. The vendor row lock serializes this
  // with other deposit changes, and a still-Pending check makes two
  // concurrent submits record only one payment.
  let adjustmentId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      if (invoice.vendorId) {
        await lockVendor(tx, invoice.vendorId);
        const nowAdjusted = await adjustedOnInvoice(tx, kind, id);
        if (!nowAdjusted.equals(alreadyAdjusted)) {
          throw new Rollback(
            "The deposit applied to this invoice changed. Reload and try again.",
            409,
          );
        }
      }
      if (applied.greaterThan(0)) {
        const result = await recordAdjustment(tx, {
          kind,
          invoiceId: id,
          vendorId: invoice.vendorId as string,
          amountUsd: applied,
          date: paidDate,
          note: "Applied when recording the payment",
          userId,
          markPaidWhenCovered: false,
        });
        if ("error" in result) throw new Rollback(result.error, 400);
        adjustmentId = result.movementId;
      }

      const where = { id, paymentStatus: "Pending" as const };
      const data = {
        paymentStatus: "Paid" as const,
        paidDate,
        paymentReceiptKey: receiptKey,
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
      if (parts.length > 0) {
        await tx.vendorPaymentPart.createMany({
          data: parts.map((part) =>
            kind === "hardware"
              ? { ...part, hardwarePurchaseId: id }
              : { ...part, vendorInvoiceId: id },
          ),
        });
      }
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

  const totalUsd = parts.reduce(
    (sum, p) => sum.plus(p.amountUsd),
    new Decimal(0),
  );
  const fromDeposit = alreadyAdjusted.plus(applied);
  const pieces = [
    parts.length > 0
      ? `$${totalUsd.toFixed(2)} (${parts.length} currency part${parts.length === 1 ? "" : "s"})`
      : null,
    fromDeposit.greaterThan(0)
      ? `$${fromDeposit.toFixed(2)} from security deposit`
      : null,
  ].filter(Boolean);
  if (adjustmentId) {
    await prisma.auditLog.create({
      data: {
        action: AuditAction.VENDOR_DEPOSIT_ADJUSTMENT_RECORDED,
        entityType: "VendorDepositMovement",
        entityId: adjustmentId,
        userId,
        description: `Security deposit of $${applied.toFixed(2)} applied to ${config.label} ${invoice.invoiceNumber}`,
        changes: JSON.stringify({
          vendorId: invoice.vendorId,
          invoiceId: id,
          amountUsd: applied.toString(),
          date: paidDate,
        }),
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      action: config.paidAction,
      entityType: config.entityType,
      entityId: id,
      userId,
      description: `Payment of ${pieces.join(" + ")} recorded for ${config.label} ${invoice.invoiceNumber}`,
      changes: JSON.stringify({
        ...(paymentAudit ?? { paidDate }),
        depositApplied: fromDeposit.toString(),
      }),
    },
  });

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

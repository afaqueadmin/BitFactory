import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  auditPart,
  parseDecimal,
  parsePaymentParts,
} from "@/lib/accounting/paymentAccount";
import {
  checkReturn,
  DepositInvoiceKind,
  getVendorDepositBalance,
  lockVendor,
  recordAdjustment,
} from "@/lib/accounting/vendorDeposit";
import { verifyUploadedPdf } from "@/lib/storage/r2";

const MAX_NOTE_LENGTH = 500;

interface CreateMovementRequest {
  vendorId?: unknown;
  type?: unknown;
  date?: unknown;
  note?: unknown;
  // RETURN
  entityId?: unknown;
  bankId?: unknown;
  currencyId?: unknown;
  exchangeRate?: unknown;
  amount?: unknown;
  transactionFee?: unknown;
  receiptKey?: unknown;
  // ADJUSTMENT
  invoiceKind?: unknown;
  invoiceId?: unknown;
  amountUsd?: unknown;
}

class Rollback extends Error {}

/**
 * Records security deposit leaving a vendor:
 * - RETURN: cash paid back into one of our accounts (like one payment part,
 *   with a receipt PDF).
 * - ADJUSTMENT: applied to one Pending invoice of the same vendor; when that
 *   covers the rest of the invoice it is marked Paid on the same date.
 * Both are limited to the deposit the vendor holds (Paid deposits minus
 * earlier returns and adjustments).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: CreateMovementRequest = await request.json();

    if (typeof body.vendorId !== "string" || !body.vendorId) {
      return NextResponse.json(
        { error: "Vendor is required" },
        { status: 400 },
      );
    }
    const vendor = await prisma.accountingVendor.findUnique({
      where: { id: body.vendorId },
      select: { id: true, name: true },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const date =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? new Date(`${body.date}T00:00:00.000Z`)
        : null;
    if (!date || Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : null;
    if (note && note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `Note can be at most ${MAX_NOTE_LENGTH} characters` },
        { status: 400 },
      );
    }

    if (body.type === "RETURN") {
      const parsed = await parsePaymentParts([
        {
          entityId: body.entityId,
          bankId: body.bankId,
          currencyId: body.currencyId,
          exchangeRate: body.exchangeRate,
          amount: body.amount,
        },
      ]);
      if ("error" in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      const part = parsed.parts[0];
      const fee = parseDecimal(body.transactionFee ?? 0, { allowZero: true });
      if (!fee || fee.decimalPlaces() > 2) {
        return NextResponse.json(
          {
            error: "Transaction fee must be 0 or more (up to 2 decimal places)",
          },
          { status: 400 },
        );
      }
      const receipt = await verifyUploadedPdf(
        body.receiptKey,
        "vendor-deposit-return-receipt",
      );
      if (!receipt.ok) {
        return NextResponse.json(
          {
            error: body.receiptKey
              ? receipt.error
              : "The return receipt PDF is required",
          },
          { status: 400 },
        );
      }

      let movementId: string;
      try {
        movementId = await prisma.$transaction(async (tx) => {
          await lockVendor(tx, vendor.id);
          const { held } = await getVendorDepositBalance(tx, vendor.id);
          const error = checkReturn(part.usd, held);
          if (error) throw new Rollback(error);
          const movement = await tx.vendorDepositMovement.create({
            data: {
              vendorId: vendor.id,
              type: "RETURN",
              date,
              amountUsd: part.usd,
              note,
              entityId: part.entityId,
              bankId: part.bankId,
              currencyId: part.currencyId,
              amount: part.amount,
              exchangeRate: part.rate,
              transactionFee: fee,
              receiptKey: receipt.key,
              createdBy: userId,
            },
          });
          return movement.id;
        });
      } catch (error) {
        if (error instanceof Rollback) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }

      await prisma.auditLog.create({
        data: {
          action: AuditAction.VENDOR_DEPOSIT_RETURN_RECORDED,
          entityType: "VendorDepositMovement",
          entityId: movementId,
          userId,
          description: `Security deposit return of $${part.usd.toFixed(2)} recorded for ${vendor.name}`,
          changes: JSON.stringify({
            vendorId: vendor.id,
            date,
            ...auditPart(part),
            transactionFee: fee.toString(),
            receiptKey: receipt.key,
            note,
          }),
        },
      });

      return NextResponse.json(
        { success: true, data: { id: movementId } },
        { status: 201 },
      );
    }

    if (body.type === "ADJUSTMENT") {
      const kind = body.invoiceKind;
      if (
        (kind !== "farm" && kind !== "hardware") ||
        typeof body.invoiceId !== "string" ||
        !body.invoiceId
      ) {
        return NextResponse.json(
          { error: "Choose the invoice the deposit was applied to" },
          { status: 400 },
        );
      }
      const amountUsd = parseDecimal(body.amountUsd);
      if (!amountUsd) {
        return NextResponse.json(
          { error: "Amount must be greater than 0" },
          { status: 400 },
        );
      }

      let result: { movementId: string; markedPaid: boolean };
      try {
        result = await prisma.$transaction(async (tx) => {
          const r = await recordAdjustment(tx, {
            kind: kind as DepositInvoiceKind,
            invoiceId: body.invoiceId as string,
            vendorId: vendor.id,
            amountUsd,
            date,
            note,
            userId,
            markPaidWhenCovered: true,
          });
          if ("error" in r) throw new Rollback(r.error);
          return r;
        });
      } catch (error) {
        if (error instanceof Rollback) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }

      const invoice =
        kind === "hardware"
          ? await prisma.hardwarePurchaseInvoice.findUnique({
              where: { id: body.invoiceId },
              select: { invoiceNumber: true },
            })
          : await prisma.vendorInvoice.findUnique({
              where: { id: body.invoiceId },
              select: { invoiceNumber: true },
            });
      const label =
        kind === "hardware" ? "hardware purchase invoice" : "vendor invoice";

      await prisma.auditLog.create({
        data: {
          action: AuditAction.VENDOR_DEPOSIT_ADJUSTMENT_RECORDED,
          entityType: "VendorDepositMovement",
          entityId: result.movementId,
          userId,
          description: `Security deposit of $${amountUsd.toFixed(2)} from ${vendor.name} applied to ${label} ${invoice?.invoiceNumber ?? body.invoiceId}${result.markedPaid ? " (invoice now fully paid)" : ""}`,
          changes: JSON.stringify({
            vendorId: vendor.id,
            invoiceKind: kind,
            invoiceId: body.invoiceId,
            amountUsd: amountUsd.toString(),
            date,
            note,
            markedPaid: result.markedPaid,
          }),
        },
      });
      if (result.markedPaid) {
        await prisma.auditLog.create({
          data: {
            action:
              kind === "hardware"
                ? AuditAction.HARDWARE_PURCHASE_INVOICE_PAID
                : AuditAction.VENDOR_INVOICE_PAID,
            entityType:
              kind === "hardware" ? "HardwarePurchaseInvoice" : "VendorInvoice",
            entityId: body.invoiceId,
            userId,
            description: `${label[0].toUpperCase()}${label.slice(1)} ${invoice?.invoiceNumber} fully paid from security deposit`,
            changes: JSON.stringify({ paidDate: date }),
          },
        });
      }

      return NextResponse.json(
        {
          success: true,
          data: { id: result.movementId, markedPaid: result.markedPaid },
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      { error: "type must be RETURN or ADJUSTMENT" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error recording security deposit movement:", error);
    return NextResponse.json(
      { error: "Failed to record the security deposit change" },
      { status: 500 },
    );
  }
}

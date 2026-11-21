import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  isReconciliationInvoiceType,
  joinPaymentNotes,
} from "@/lib/accounting/bankReconciliation";
import { candidateInvoiceWhere } from "@/lib/accounting/bankReconciliationRequest";
import { userName } from "../shared";

/** An audit entry's changes, saved as a JSON string or as JSON. */
const changesOf = (v: unknown): Record<string, unknown> | null => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
};

/**
 * When and by whom each invoice was last set to PAID by a status change
 * (the list pages' bulk "Mark as Paid"), for invoices with no paid date: the
 * form shows it as a hint. Not found when the status changed without an
 * audit entry (e.g. the BTCPay webhook).
 */
async function markedPaidWithoutDate(
  invoiceIds: string[],
): Promise<Map<string, { at: string; by: string }>> {
  const found = new Map<string, { at: string; by: string }>();
  if (invoiceIds.length === 0) return found;
  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: "Invoice",
      entityId: { in: invoiceIds },
      action: "INVOICE_UPDATED",
    },
    orderBy: { createdAt: "desc" },
    select: {
      entityId: true,
      changes: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  for (const log of logs) {
    if (found.has(log.entityId)) continue;
    const status = changesOf(log.changes)?.status as
      { to?: unknown } | undefined;
    if (status?.to === "PAID") {
      found.set(log.entityId, {
        at: log.createdAt.toISOString(),
        by: userName(log.user),
      });
    }
  }
  return found;
}

/**
 * GET /api/accounting/bank-reconciliation/invoices?type=<InvoiceType>&keep=<invoiceId>
 * The invoices an entry can be made for (candidateInvoiceWhere): PAID, of
 * that type, on no bank statement and not reconciled yet. `keep` adds back
 * the invoice of the entry being edited. Newest invoice number first.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["bank_reconciliation.view"]);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    if (!isReconciliationInvoiceType(type)) {
      return NextResponse.json(
        {
          error:
            "type must be ELECTRICITY_CHARGES, HARDWARE_SALES or HARDWARE_REPAIR",
        },
        { status: 400 },
      );
    }
    const keep = searchParams.get("keep") || undefined;

    const invoices = await prisma.invoice.findMany({
      where: candidateInvoiceWhere(type, keep),
      orderBy: [{ invoiceGeneratedDate: "desc" }, { invoiceNumber: "desc" }],
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidDate: true,
        issuedDate: true,
        dueDate: true,
        user: { select: { name: true, email: true } },
        // Payment notes pre-fill the narration, oldest first.
        costPayments: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          select: { narration: true },
        },
      },
    });

    const markedPaid = await markedPaidWithoutDate(
      invoices.filter((i) => !i.paidDate).map((i) => i.id),
    );

    return NextResponse.json({
      success: true,
      data: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        clientName: userName(i.user),
        totalUsd: i.totalAmount.toFixed(2),
        // Instants: the form shows them as the viewer's calendar days.
        paidDate: i.paidDate?.toISOString() ?? null,
        issuedDate: i.issuedDate?.toISOString() ?? null,
        dueDate: i.dueDate.toISOString(),
        markedPaid: markedPaid.get(i.id) ?? null,
        narration: joinPaymentNotes(i.costPayments.map((p) => p.narration)),
      })),
    });
  } catch (error) {
    console.error("Error listing invoices for Bank Reconciliation:", error);
    return NextResponse.json(
      { error: "Failed to load invoices" },
      { status: 500 },
    );
  }
}

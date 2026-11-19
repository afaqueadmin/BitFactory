import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  isReconciliationInvoiceType,
  joinPaymentNotes,
} from "@/lib/accounting/bankReconciliation";
import { candidateInvoiceWhere } from "@/lib/accounting/bankReconciliationRequest";
import { userName } from "../shared";

/**
 * GET /api/accounting/bank-reconciliation/invoices?type=<InvoiceType>&keep=<invoiceId>
 * The invoices an entry can be made for (candidateInvoiceWhere): PAID, of
 * that type, on no bank statement and not reconciled yet. `keep` adds back
 * the invoice of the entry being edited. Newest invoice number first.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
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
        user: { select: { name: true, email: true } },
        // Payment notes pre-fill the narration, oldest first.
        costPayments: {
          where: { isDeleted: false },
          orderBy: { createdAt: "asc" },
          select: { narration: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        clientName: userName(i.user),
        totalUsd: i.totalAmount.toFixed(2),
        // An instant: the form shows it as the viewer's calendar day.
        paidDate: i.paidDate?.toISOString() ?? null,
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

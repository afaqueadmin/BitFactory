import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuditAction, Prisma } from "@prisma/client";
import { generateMemoPDF, sendMemoVoidEmail } from "@/lib/email";
import { InvoiceEmailService } from "@/services/invoiceEmailService";
import { recordMemoEmailRun } from "@/lib/accounting/emailRunLog";
import { requireAdmin } from "../route";

// Thrown inside the void transaction when the void email fails, so the memo
// stays ISSUED and its balance adjustment stays live.
class MemoVoidEmailError extends Error {}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function voidOneMemo(
  tx: Prisma.TransactionClient,
  memo: { id: string; memoNumber: string; amount: unknown },
  voidedBy: string,
  voidReason: string,
  pairNote?: string,
) {
  const voided = await tx.memo.update({
    where: { id: memo.id },
    data: {
      status: "VOIDED",
      voidedBy,
      voidedAt: new Date(),
      voidReason,
    },
  });

  // Reverse the linked balance adjustment (customer-facing memos only -
  // internal ones never created one).
  const reversedPayments = await tx.costPayment.updateMany({
    where: { memoId: memo.id, isDeleted: false },
    data: { isDeleted: true },
  });

  await tx.auditLog.create({
    data: {
      action: AuditAction.MEMO_VOIDED,
      entityType: "Memo",
      entityId: memo.id,
      userId: voidedBy,
      description: `Memo ${memo.memoNumber} voided${pairNote ? ` (${pairNote})` : ""}`,
      changes: JSON.stringify({
        voidReason,
        amount: memo.amount,
        balanceAdjustmentReversed: reversedPayments.count > 0,
      }),
    },
  });

  return voided;
}

// POST: Void an ISSUED memo. No un-voiding - a mistaken void must be
// corrected by issuing a new offsetting memo. If this memo is one leg of an
// internal-transfer pair, its sibling is voided in the same transaction so
// the transfer can never be left half-reversed. A customer-facing memo is
// only voided if the void notice (with the VOIDED PDF) reaches the customer:
// the send is the last step of the transaction and a failure rolls it back.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const { voidReason } = await request.json();

    if (
      !voidReason ||
      typeof voidReason !== "string" ||
      voidReason.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "voidReason is required" },
        { status: 400 },
      );
    }

    if (voidReason.length > 500) {
      return NextResponse.json(
        { error: "voidReason must not exceed 500 characters" },
        { status: 400 },
      );
    }

    const existing = await prisma.memo.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Memo not found" }, { status: 404 });
    }

    if (existing.status !== "ISSUED") {
      return NextResponse.json(
        { error: "Only ISSUED memos can be voided" },
        { status: 400 },
      );
    }

    const trimmedReason = voidReason.trim();
    const isCustomerFacing = existing.memoType === "CUSTOMER_FACING";
    const amount = Number(existing.amount);
    const invoiceNumber = existing.invoice?.invoiceNumber || null;
    const recordRun = (success: boolean, ccEmails: string[], error?: string) =>
      recordMemoEmailRun({
        memoId: existing.id,
        memoNumber: existing.memoNumber,
        invoiceId: existing.invoiceId,
        kind: "MEMO_VOID",
        customer: existing.user,
        success,
        error,
        ccEmails,
        userId: auth.userId,
      });

    // Customer-facing: build the CC list and render the VOIDED PDF before
    // touching the DB, so a PDF failure changes nothing.
    let ccEmails: string[] = [];
    let pdfBuffer: Buffer | null = null;
    if (isCustomerFacing) {
      ccEmails = await InvoiceEmailService.buildCCList(existing.userId);
      try {
        pdfBuffer = await generateMemoPDF({
          memoNumber: existing.memoNumber,
          customerName: existing.user.name || "Valued Customer",
          customerEmail: existing.user.email,
          category: existing.category,
          amount,
          reason: existing.reason,
          issuedDate: existing.issuedDate,
          invoiceNumber,
          voided: true,
          voidReason: trimmedReason,
        });
      } catch (pdfError) {
        console.error(
          `[Memos] Void PDF generation failed for ${existing.memoNumber}:`,
          pdfError,
        );
        await recordRun(
          false,
          ccEmails,
          `PDF generation failed: ${errorMessage(pdfError)}`,
        );
        return NextResponse.json(
          {
            error: `Memo not voided - the PDF could not be generated: ${errorMessage(pdfError)}`,
          },
          { status: 502 },
        );
      }
    }

    let voided;
    try {
      voided = await prisma.$transaction(
        async (tx) => {
          const primary = await voidOneMemo(
            tx,
            existing,
            auth.userId,
            trimmedReason,
          );

          if (existing.pairedMemoId) {
            const sibling = await tx.memo.findUnique({
              where: { id: existing.pairedMemoId },
            });
            if (sibling && sibling.status === "ISSUED") {
              await voidOneMemo(
                tx,
                sibling,
                auth.userId,
                trimmedReason,
                `paired transfer with ${existing.memoNumber}`,
              );
            }
          }

          if (isCustomerFacing && pdfBuffer) {
            const sendResult = await sendMemoVoidEmail(
              existing.user.email,
              existing.user.name || "Valued Customer",
              existing.memoNumber,
              amount,
              trimmedReason,
              pdfBuffer,
              invoiceNumber,
              ccEmails,
            );

            if (!sendResult.success) {
              throw new MemoVoidEmailError(errorMessage(sendResult.error));
            }
            ccEmails = sendResult.ccEmails;

            await tx.auditLog.create({
              data: {
                action: AuditAction.MEMO_SENT,
                entityType: "Memo",
                entityId: existing.id,
                userId: auth.userId,
                description: `Void notice for memo ${existing.memoNumber} emailed to ${existing.user.email}`,
                changes: JSON.stringify({
                  sentTo: existing.user.email,
                  ccEmails: ccEmails.join(","),
                  pdfAttached: true,
                  voided: true,
                }),
              },
            });
          }

          return primary;
        },
        // PDF is pre-rendered; this only has to cover the SMTP send.
        { maxWait: 10_000, timeout: 30_000 },
      );
    } catch (txError) {
      if (txError instanceof MemoVoidEmailError) {
        console.error(
          `[Memos] Void email failed for ${existing.memoNumber}, void rolled back:`,
          txError.message,
        );
        await recordRun(false, ccEmails, txError.message);
        return NextResponse.json(
          {
            error: `Memo not voided - the email could not be sent: ${txError.message}`,
          },
          { status: 502 },
        );
      }
      throw txError;
    }

    if (isCustomerFacing) {
      await recordRun(true, ccEmails);
    }

    return NextResponse.json({ success: true, memo: voided });
  } catch (error) {
    console.error("[Memos] Void error:", error);
    return NextResponse.json({ error: "Failed to void memo" }, { status: 500 });
  }
}

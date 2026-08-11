import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuditAction, Prisma } from "@prisma/client";
import { requireAdmin } from "../route";

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
// the transfer can never be left half-reversed.
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

    const existing = await prisma.memo.findUnique({ where: { id } });

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

    const voided = await prisma.$transaction(async (tx) => {
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

      return primary;
    });

    return NextResponse.json({ success: true, memo: voided });
  } catch (error) {
    console.error("[Memos] Void error:", error);
    return NextResponse.json({ error: "Failed to void memo" }, { status: 500 });
  }
}

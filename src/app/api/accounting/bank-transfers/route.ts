import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  auditTransfer,
  parseTransferRequest,
  TransferRequest,
} from "@/lib/accounting/bankTransferRequest";
import { transferInclude, transferJson } from "./shared";

/** Every internal bank transfer, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const transfers = await prisma.accountingBankTransfer.findMany({
      include: transferInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({
      success: true,
      data: transfers.map(transferJson),
    });
  } catch (error) {
    console.error("Error listing bank transfers:", error);
    return NextResponse.json(
      { error: "Failed to load bank transfers" },
      { status: 500 },
    );
  }
}

/**
 * Records money moved between two of our banks (see bankTransfer.ts): the
 * sending bank loses amount + its fee, the receiving bank gains the amount
 * received and pays its own fee, both at one USD value.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: TransferRequest = await request.json();
    const parsed = await parseTransferRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const transfer = await prisma.accountingBankTransfer.create({
      data: { ...data, createdBy: userId },
      include: transferInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.BANK_TRANSFER_RECORDED,
        entityType: "AccountingBankTransfer",
        entityId: transfer.id,
        userId,
        description: `Internal transfer of $${summary.amountUsd.toFixed(2)} recorded: ${summary.fromBank} (${summary.fromCode}) → ${summary.toBank} (${summary.toCode})`,
        changes: JSON.stringify(auditTransfer(data, summary)),
      },
    });

    return NextResponse.json(
      { success: true, data: transferJson(transfer) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error recording bank transfer:", error);
    return NextResponse.json(
      { error: "Failed to record the transfer" },
      { status: 500 },
    );
  }
}

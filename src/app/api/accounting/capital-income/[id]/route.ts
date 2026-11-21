import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  auditIncome,
  IncomeRequest,
  parseIncomeRequest,
} from "@/lib/accounting/capitalIncomeRequest";
import { incomeEntryLabel } from "@/lib/accounting/capitalIncome";
import { deleteObject } from "@/lib/storage/r2";
import { incomeInclude, incomeJson, incomeSummary } from "../shared";

/**
 * Edits an entry (every field can change). A replaced or removed PDF /
 * sheet is deleted from R2 after the save.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.edit"]);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingIncome.findUnique({
      where: { id },
      include: incomeInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const body: IncomeRequest = await request.json();
    const parsed = await parseIncomeRequest(body, existing);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const entry = await prisma.accountingIncome.update({
      where: { id },
      data,
      include: incomeInclude,
    });

    // Files no longer referenced. A failure only leaves an orphan.
    for (const [before, after] of [
      [existing.pdfKey, data.pdfKey],
      [existing.sheetKey, data.sheetKey],
    ] as const) {
      if (before && before !== after) {
        await deleteObject(before).catch((error) =>
          console.error(
            "Error deleting replaced Capital & Income file:",
            error,
          ),
        );
      }
    }

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCOME_UPDATED,
        entityType: "AccountingIncome",
        entityId: id,
        userId,
        description: `Capital & Income ${incomeEntryLabel(entry.entryNumber)} updated: $${data.amountUsd.toFixed(2)} (${summary.head}) into ${summary.bank}`,
        changes: JSON.stringify({
          before: auditIncome(existing, incomeSummary(existing)),
          after: auditIncome(data, summary),
        }),
      },
    });

    return NextResponse.json({ success: true, data: incomeJson(entry) });
  } catch (error) {
    console.error("Error updating Capital & Income:", error);
    return NextResponse.json(
      { error: "Failed to update the entry" },
      { status: 500 },
    );
  }
}

/** Deletes an entry and its files. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.delete"]);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingIncome.findUnique({
      where: { id },
      include: incomeInclude,
    });
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    for (const key of [existing.pdfKey, existing.sheetKey]) {
      if (!key) continue;
      try {
        await deleteObject(key);
      } catch (error) {
        console.error("Error deleting Capital & Income file:", error);
        return NextResponse.json(
          {
            error:
              "Couldn't delete the attached file. The entry was not deleted",
          },
          { status: 500 },
        );
      }
    }

    await prisma.accountingIncome.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCOME_DELETED,
        entityType: "AccountingIncome",
        entityId: id,
        userId,
        description: `Capital & Income ${incomeEntryLabel(existing.entryNumber)} of $${existing.amountUsd.toFixed(2)} (${existing.head.name}) from ${existing.bank.name} deleted`,
        changes: JSON.stringify(auditIncome(existing, incomeSummary(existing))),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting Capital & Income:", error);
    return NextResponse.json(
      { error: "Failed to delete the entry" },
      { status: 500 },
    );
  }
}

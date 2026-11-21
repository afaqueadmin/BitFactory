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
import { incomeInclude, incomeJson } from "./shared";

/** Every Capital & Income entry, newest first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.view"]);
    if ("response" in auth) return auth.response;

    const entries = await prisma.accountingIncome.findMany({
      include: incomeInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ success: true, data: entries.map(incomeJson) });
  } catch (error) {
    console.error("Error listing Capital & Income:", error);
    return NextResponse.json(
      { error: "Failed to load Capital & Income" },
      { status: 500 },
    );
  }
}

/** Adds an entry: money received into one bank (a Debit on its statement). */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.create"]);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: IncomeRequest = await request.json();
    const parsed = await parseIncomeRequest(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { data, summary } = parsed;

    const entry = await prisma.accountingIncome.create({
      data: { ...data, createdBy: userId },
      include: incomeInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCOME_RECORDED,
        entityType: "AccountingIncome",
        entityId: entry.id,
        userId,
        description: `Capital & Income ${incomeEntryLabel(entry.entryNumber)} of $${data.amountUsd.toFixed(2)} (${summary.head}) received into ${summary.bank} (${summary.code})`,
        changes: JSON.stringify(auditIncome(data, summary)),
      },
    });

    return NextResponse.json(
      { success: true, data: incomeJson(entry) },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error adding Capital & Income:", error);
    return NextResponse.json(
      { error: "Failed to add the entry" },
      { status: 500 },
    );
  }
}

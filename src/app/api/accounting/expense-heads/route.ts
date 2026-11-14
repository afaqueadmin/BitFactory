import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { headCountInclude } from "@/lib/accounting/expenseRequest";
import { headsWithTotals } from "./shared";

/** Expense heads (?active=true: only active ones, for the Add expense form). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const activeOnly =
      new URL(request.url).searchParams.get("active") === "true";
    if (activeOnly) {
      const heads = await prisma.accountingExpenseHead.findMany({
        where: { isActive: true },
        include: headCountInclude,
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, data: heads });
    }
    // Full list (Expense Heads page), with Amount due / Amount paid.
    return NextResponse.json({ success: true, data: await headsWithTotals() });
  } catch (error) {
    console.error("Error fetching expense heads:", error);
    return NextResponse.json(
      { error: "Failed to fetch expense heads" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: { name?: unknown } = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
        { status: 400 },
      );
    }

    const head = await prisma.accountingExpenseHead.create({
      data: { name, createdBy: userId },
      include: headCountInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.EXPENSE_HEAD_CREATED,
        entityType: "AccountingExpenseHead",
        entityId: head.id,
        userId,
        description: `Expense head ${head.name} created`,
        changes: JSON.stringify({ name }),
      },
    });

    return NextResponse.json({ success: true, data: head }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A head with this name already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating expense head:", error);
    return NextResponse.json(
      { error: "Failed to create the head" },
      { status: 500 },
    );
  }
}

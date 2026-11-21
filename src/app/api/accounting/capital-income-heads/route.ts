import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/accounting/adminAuth";
import { MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH } from "@/lib/accounting/masterData";
import { incomeHeadCountInclude } from "@/lib/accounting/capitalIncomeRequest";
import { incomeHeadsWithTotals } from "./shared";

/** Capital & Income heads (?active=true: only active ones, for the form). */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.view"]);
    if ("response" in auth) return auth.response;

    const activeOnly =
      new URL(request.url).searchParams.get("active") === "true";
    if (activeOnly) {
      const heads = await prisma.accountingIncomeHead.findMany({
        where: { isActive: true },
        include: incomeHeadCountInclude,
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ success: true, data: heads });
    }
    // Full list (heads page), with Received / Fees totals.
    return NextResponse.json({
      success: true,
      data: await incomeHeadsWithTotals(),
    });
  } catch (error) {
    console.error("Error fetching Capital & Income heads:", error);
    return NextResponse.json(
      { error: "Failed to fetch Capital & Income heads" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["capital_income.manage_heads"]);
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

    const head = await prisma.accountingIncomeHead.create({
      data: { name, createdBy: userId },
      include: incomeHeadCountInclude,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.INCOME_HEAD_CREATED,
        entityType: "AccountingIncomeHead",
        entityId: head.id,
        userId,
        description: `Capital & Income head ${head.name} created`,
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
    console.error("Error creating Capital & Income head:", error);
    return NextResponse.json(
      { error: "Failed to create the head" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUniqueViolation,
  requireAccountingAdmin,
} from "@/lib/accounting/adminAuth";
import {
  MAX_MASTER_NAME_LENGTH as MAX_NAME_LENGTH,
  parseCurrencyCode,
} from "@/lib/accounting/masterData";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const activeOnly =
      new URL(request.url).searchParams.get("active") === "true";

    const currencies = await prisma.accountingCurrency.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ success: true, data: currencies });
  } catch (error) {
    console.error("Error fetching accounting currencies:", error);
    return NextResponse.json(
      { error: "Failed to fetch currencies" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    const body: { code?: unknown; name?: unknown } = await request.json();
    const code = parseCurrencyCode(body.code);
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!code) {
      return NextResponse.json(
        { error: "Code must be 2–10 letters or digits, e.g. USD or USDT" },
        { status: 400 },
      );
    }
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
        { status: 400 },
      );
    }

    const currency = await prisma.accountingCurrency.create({
      data: { code, name },
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_CURRENCY_CREATED,
        entityType: "AccountingCurrency",
        entityId: currency.id,
        userId,
        description: `Accounting currency ${currency.code} created`,
        changes: JSON.stringify({ code, name }),
      },
    });

    return NextResponse.json(
      { success: true, data: currency },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A currency with this code already exists" },
        { status: 400 },
      );
    }
    console.error("Error creating accounting currency:", error);
    return NextResponse.json(
      { error: "Failed to create currency" },
      { status: 500 },
    );
  }
}

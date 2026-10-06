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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingCurrency.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            vendorInvoicePayments: true,
            hardwarePurchasePayments: true,
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Currency not found" },
        { status: 404 },
      );
    }

    const body: { code?: unknown; name?: unknown; isActive?: unknown } =
      await request.json();
    const data: { code?: string; name?: string; isActive?: boolean } = {};

    if (body.code !== undefined) {
      const code = parseCurrencyCode(body.code);
      if (!code) {
        return NextResponse.json(
          { error: "Code must be 2–10 letters or digits, e.g. USD or USDT" },
          { status: 400 },
        );
      }
      if (code !== existing.code) {
        // Recorded amounts are stored in this currency; changing its code
        // would change what those amounts mean.
        const { vendorInvoicePayments, hardwarePurchasePayments } =
          existing._count;
        if (vendorInvoicePayments + hardwarePurchasePayments > 0) {
          return NextResponse.json(
            {
              error:
                "This currency is used by recorded payments, so its code can't change.",
            },
            { status: 409 },
          );
        }
        data.code = code;
      }
    }
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json(
          { error: `Name is required (max ${MAX_NAME_LENGTH} characters)` },
          { status: 400 },
        );
      }
      data.name = name;
    }
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return NextResponse.json(
          { error: "isActive must be true or false" },
          { status: 400 },
        );
      }
      data.isActive = body.isActive;
    }

    const currency = await prisma.accountingCurrency.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_CURRENCY_UPDATED,
        entityType: "AccountingCurrency",
        entityId: id,
        userId,
        description: `Accounting currency ${currency.code} updated`,
        changes: JSON.stringify({
          before: {
            code: existing.code,
            name: existing.name,
            isActive: existing.isActive,
          },
          after: data,
        }),
      },
    });

    return NextResponse.json({ success: true, data: currency });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "A currency with this code already exists" },
        { status: 400 },
      );
    }
    console.error("Error updating accounting currency:", error);
    return NextResponse.json(
      { error: "Failed to update currency" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { userId } = auth;
    const { id } = await params;

    const existing = await prisma.accountingCurrency.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            banks: true,
            vendorInvoicePayments: true,
            hardwarePurchasePayments: true,
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Currency not found" },
        { status: 404 },
      );
    }

    const { banks, vendorInvoicePayments, hardwarePurchasePayments } =
      existing._count;
    if (banks > 0 || vendorInvoicePayments + hardwarePurchasePayments > 0) {
      return NextResponse.json(
        {
          error:
            banks > 0
              ? "This currency is linked to one or more banks. Remove it from those banks first, or deactivate it instead."
              : "This currency is used by recorded payments. Deactivate it instead.",
        },
        { status: 409 },
      );
    }

    await prisma.accountingCurrency.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        action: AuditAction.ACCOUNTING_CURRENCY_DELETED,
        entityType: "AccountingCurrency",
        entityId: id,
        userId,
        description: `Accounting currency ${existing.code} deleted`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting accounting currency:", error);
    return NextResponse.json(
      { error: "Failed to delete currency" },
      { status: 500 },
    );
  }
}

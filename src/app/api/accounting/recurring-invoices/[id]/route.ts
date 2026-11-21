import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { AuditAction } from "@prisma/client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["recurring_invoices.view"]);
    if ("response" in auth) return auth.response;

    const recurringInvoice = await prisma.recurringInvoice.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    if (!recurringInvoice) {
      return NextResponse.json(
        { error: "Recurring invoice not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(recurringInvoice);
  } catch (error) {
    console.error("Get recurring invoice error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recurring invoice" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["recurring_invoices.manage"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;

    const body = await request.json();
    const { dayOfMonth, unitPrice, isActive, endDate } = body;

    const currentRecurring = await prisma.recurringInvoice.findUnique({
      where: { id },
    });

    if (!currentRecurring) {
      return NextResponse.json(
        { error: "Recurring invoice not found" },
        { status: 404 },
      );
    }

    const updateData: Record<string, unknown> = { updatedBy: userId };
    const changes: Record<string, unknown> = {};

    if (dayOfMonth !== undefined) {
      if (dayOfMonth < 1 || dayOfMonth > 31) {
        return NextResponse.json(
          { error: "dayOfMonth must be between 1 and 31" },
          { status: 400 },
        );
      }
      updateData.dayOfMonth = dayOfMonth;
      changes.dayOfMonth = {
        from: currentRecurring.dayOfMonth,
        to: dayOfMonth,
      };
    }

    if (unitPrice !== undefined) {
      updateData.unitPrice = unitPrice ? parseFloat(unitPrice) : null;
      changes.unitPrice = unitPrice;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
      changes.isActive = { from: currentRecurring.isActive, to: isActive };
    }

    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;
      changes.endDate = endDate;
    }

    const recurringInvoice = await prisma.recurringInvoice.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        updatedByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.RECURRING_INVOICE_UPDATED,
        entityType: "RecurringInvoice",
        entityId: recurringInvoice.id,
        userId,
        description: `Recurring invoice updated`,
        changes: JSON.stringify(changes),
      },
    });

    return NextResponse.json(recurringInvoice);
  } catch (error) {
    console.error("Update recurring invoice error:", error);
    return NextResponse.json(
      { error: "Failed to update recurring invoice" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeStaff(request, ["recurring_invoices.manage"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;

    const recurringInvoice = await prisma.recurringInvoice.findUnique({
      where: { id },
    });

    if (!recurringInvoice) {
      return NextResponse.json(
        { error: "Recurring invoice not found" },
        { status: 404 },
      );
    }

    await prisma.recurringInvoice.delete({
      where: { id },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.RECURRING_INVOICE_DELETED,
        entityType: "RecurringInvoice",
        entityId: id,
        userId,
        description: `Recurring invoice deleted`,
        changes: JSON.stringify({}),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Recurring invoice deleted",
    });
  } catch (error) {
    console.error("Delete recurring invoice error:", error);
    return NextResponse.json(
      { error: "Failed to delete recurring invoice" },
      { status: 500 },
    );
  }
}

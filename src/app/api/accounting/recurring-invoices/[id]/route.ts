import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await verifyJwtToken(token);

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
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can update recurring invoices" },
        { status: 403 },
      );
    }

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
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await verifyJwtToken(token);
    const userId = decoded.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can delete recurring invoices" },
        { status: 403 },
      );
    }

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

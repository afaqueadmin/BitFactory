import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  try {
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
        { error: "Only administrators can access recurring invoices" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const isActive = searchParams.get("isActive");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (customerId) where.userId = customerId;
    if (isActive !== null) where.isActive = isActive === "true";

    const skip = (page - 1) * limit;

    const [recurringInvoices, total] = await Promise.all([
      prisma.recurringInvoice.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, name: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.recurringInvoice.count({ where }),
    ]);

    return NextResponse.json({
      recurringInvoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get recurring invoices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recurring invoices" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
        { error: "Only administrators can create recurring invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { customerId, dayOfMonth, unitPrice, startDate, endDate } = body;

    if (!customerId || !dayOfMonth || !startDate) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, dayOfMonth, startDate" },
        { status: 400 },
      );
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json(
        { error: "dayOfMonth must be between 1 and 31" },
        { status: 400 },
      );
    }

    const recurringInvoice = await prisma.recurringInvoice.create({
      data: {
        userId: customerId,
        dayOfMonth,
        unitPrice: unitPrice ? parseFloat(unitPrice) : null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        isActive: true,
        createdBy: userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.RECURRING_INVOICE_CREATED,
        entityType: "RecurringInvoice",
        entityId: recurringInvoice.id,
        userId,
        description: `Recurring invoice created for customer ${customerId} on day ${dayOfMonth}`,
        changes: JSON.stringify({
          dayOfMonth,
          customerId,
          startDate: startDate,
        }),
      },
    });

    return NextResponse.json(recurringInvoice, { status: 201 });
  } catch (error) {
    console.error("Create recurring invoice error:", error);
    return NextResponse.json(
      { error: "Failed to create recurring invoice" },
      { status: 500 },
    );
  }
}

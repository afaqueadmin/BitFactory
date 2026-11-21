import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  HOSTING_INELIGIBLE_ERROR,
  isHostingEligibleSegment,
} from "@/lib/hostingEligibility";
import { AuditAction } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStaff(request, ["recurring_invoices.view"]);
    if ("response" in auth) return auth.response;

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
    const auth = await authorizeStaff(request, ["recurring_invoices.manage"]);
    if ("response" in auth) return auth.response;
    const userId = auth.userId;

    const body = await request.json();
    const { customerId, dayOfMonth, unitPrice, startDate, endDate } = body;

    if (!customerId || !dayOfMonth || !unitPrice || !startDate) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: customerId, dayOfMonth, unitPrice, startDate",
        },
        { status: 400 },
      );
    }

    if (dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json(
        { error: "dayOfMonth must be between 1 and 31" },
        { status: 400 },
      );
    }

    // Recurring templates generate hosting invoices, so the customer must be
    // hosting-eligible (not a potential customer, and has a segment).
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { segment: true },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    if (!isHostingEligibleSegment(customer.segment)) {
      return NextResponse.json(
        { error: HOSTING_INELIGIBLE_ERROR },
        { status: 400 },
      );
    }

    const recurringInvoice = await prisma.recurringInvoice.create({
      data: {
        userId: customerId,
        dayOfMonth,
        unitPrice: parseFloat(unitPrice),
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

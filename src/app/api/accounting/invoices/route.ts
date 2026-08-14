import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { InvoiceStatus, AuditAction, Prisma } from "@prisma/client";

function normalizeBillingMonth(billingMonth: string | Date): Date {
  const parsedBillingMonth = new Date(billingMonth);

  return new Date(
    Date.UTC(
      parsedBillingMonth.getUTCFullYear(),
      parsedBillingMonth.getUTCMonth(),
      1,
    ),
  );
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const decoded = await verifyJwtToken(token);
    const userRole = decoded.role;

    if (customerId && userRole === "CLIENT" && customerId != decoded.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!customerId && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access invoices" },
        { status: 403 },
      );
    }

    const status = searchParams.get("status");
    const invoiceType = searchParams.get("invoiceType");
    const sortBy = searchParams.get("sortBy");
    const sortDirection: Prisma.SortOrder =
      searchParams.get("sortDirection") === "desc" ? "desc" : "asc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where: Record<string, unknown> = {};
    if (customerId) {
      where.userId = customerId;
      where.status = {
        not: InvoiceStatus.DRAFT,
      };
    }
    if (status) {
      where.status = status as InvoiceStatus;
    }
    if (invoiceType) {
      where.invoiceType = invoiceType;
    }
    // Note: CANCELLED invoices are now included in the dashboard table
    // They won't affect calculations (amount, outstanding, etc) as they're already excluded from those queries

    const skip = (page - 1) * limit;
    const defaultSort: Prisma.SortOrder = "desc";

    const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = (() => {
      switch (sortBy) {
        case "invoiceNumber":
          return [{ invoiceNumber: sortDirection }, { createdAt: defaultSort }];
        case "customer":
          return [
            { user: { name: sortDirection } },
            { createdAt: defaultSort },
          ];
        case "amount":
          return [{ totalAmount: sortDirection }, { createdAt: defaultSort }];
        case "status":
          return [{ status: sortDirection }, { createdAt: defaultSort }];
        case "issuedDate":
          return [{ issuedDate: sortDirection }, { createdAt: defaultSort }];
        case "paidDate":
          return [{ paidDate: sortDirection }, { createdAt: defaultSort }];
        case "dueDate":
          return [{ dueDate: sortDirection }, { createdAt: defaultSort }];
        default:
          return [{ createdAt: defaultSort }];
      }
    })();

    const include: Record<string, unknown> = {
      user: { select: { id: true, email: true, name: true } },
      costPayments: true,
    };

    // Only include createdByUser when customerId is not passed
    if (!customerId) {
      include.createdByUser = { select: { id: true, email: true, name: true } };
    }

    const getPaidPastDueDays = (invoice: {
      status: InvoiceStatus;
      paidDate: Date | null;
      dueDate: Date;
    }) => {
      if (invoice.status !== InvoiceStatus.PAID || !invoice.paidDate) {
        return null;
      }

      const diffDays = Math.ceil(
        (new Date(invoice.paidDate).getTime() -
          new Date(invoice.dueDate).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return Math.max(0, diffDays);
    };

    const getDaysUntilDue = (invoice: {
      status: InvoiceStatus;
      dueDate: Date;
    }) => {
      if (invoice.status === InvoiceStatus.PAID) {
        return null;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const due = new Date(invoice.dueDate);
      due.setHours(0, 0, 0, 0);

      return Math.ceil(
        (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
    };

    let invoices;
    let total;

    if (sortBy === "paidPastDue" || sortBy === "daysUntilDue") {
      const allMatchingInvoices = await prisma.invoice.findMany({
        where,
        include,
        orderBy: [{ createdAt: "desc" }],
      });

      const sorted = [...allMatchingInvoices].sort((a, b) => {
        if (sortBy === "daysUntilDue") {
          const aIssuedPriority = a.status === InvoiceStatus.ISSUED ? 0 : 1;
          const bIssuedPriority = b.status === InvoiceStatus.ISSUED ? 0 : 1;

          if (aIssuedPriority !== bIssuedPriority) {
            return aIssuedPriority - bIssuedPriority;
          }
        }

        const aValue =
          sortBy === "paidPastDue" ? getPaidPastDueDays(a) : getDaysUntilDue(a);
        const bValue =
          sortBy === "paidPastDue" ? getPaidPastDueDays(b) : getDaysUntilDue(b);

        // Keep rows with no sortable value at the end for both directions.
        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        const cmp = aValue - bValue;
        return sortDirection === "asc" ? cmp : -cmp;
      });

      total = sorted.length;
      invoices = sorted.slice(skip, skip + limit);
    } else {
      [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include,
          orderBy,
          skip,
          take: limit,
        }),
        prisma.invoice.count({ where }),
      ]);
    }

    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get invoices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invoices" },
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
        { error: "Only administrators can create invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      customerId,
      totalMiners,
      unitPrice,
      dueDate,
      invoiceType,
      hardwareId,
      billingMonth,
      invoiceGeneratedDate,
      lineItems,
      machineHostingLocation,
    } = body;

    if (
      machineHostingLocation !== undefined &&
      machineHostingLocation !== null &&
      typeof machineHostingLocation !== "string"
    ) {
      return NextResponse.json(
        { error: "machineHostingLocation must be a string" },
        { status: 400 },
      );
    }

    // Status is always DRAFT when creating new invoices
    // Admins can change to ISSUED after creation via the status change endpoint
    const status = InvoiceStatus.DRAFT;

    const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;

    if (!customerId || !dueDate) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, dueDate" },
        { status: 400 },
      );
    }

    if (!hasLineItems) {
      if (totalMiners === undefined || unitPrice === undefined) {
        return NextResponse.json(
          {
            error:
              "Missing required fields: customerId, totalMiners, unitPrice, dueDate",
          },
          { status: 400 },
        );
      }

      if (typeof totalMiners !== "number" || totalMiners < 0) {
        return NextResponse.json(
          { error: "totalMiners must be a non-negative number" },
          { status: 400 },
        );
      }

      if (typeof unitPrice !== "number" || unitPrice <= 0) {
        return NextResponse.json(
          { error: "unitPrice must be a number greater than 0" },
          { status: 400 },
        );
      }
    }

    // Validate line items and compute aggregates server-side (never trust
    // client-computed sums)
    let computedTotalMiners = totalMiners;
    let computedUnitPrice = unitPrice;
    let computedTotalAmount: number | undefined;
    let validatedLineItems: Array<{
      hardwareId: string;
      model: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      lineItemType: "HARDWARE" | "HOSTING_COLOCATION";
    }> = [];

    if (hasLineItems) {
      for (const item of lineItems) {
        if (
          !item ||
          typeof item.hardwareId !== "string" ||
          !item.hardwareId ||
          typeof item.model !== "string" ||
          !item.model ||
          typeof item.quantity !== "number" ||
          item.quantity <= 0 ||
          typeof item.unitPrice !== "number" ||
          item.unitPrice <= 0 ||
          (item.lineItemType !== undefined &&
            item.lineItemType !== "HARDWARE" &&
            item.lineItemType !== "HOSTING_COLOCATION")
        ) {
          return NextResponse.json(
            {
              error:
                "Each line item requires hardwareId, model, quantity > 0, unitPrice > 0, and a valid lineItemType",
            },
            { status: 400 },
          );
        }
      }

      validatedLineItems = lineItems.map(
        (item: {
          hardwareId: string;
          model: string;
          quantity: number;
          unitPrice: number;
          lineItemType?: "HARDWARE" | "HOSTING_COLOCATION";
        }) => ({
          hardwareId: item.hardwareId,
          model: item.model,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: parseFloat(
            (item.quantity * Number(item.unitPrice)).toFixed(2),
          ),
          lineItemType: item.lineItemType || "HARDWARE",
        }),
      );

      computedTotalMiners = validatedLineItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      computedTotalAmount = parseFloat(
        validatedLineItems
          .reduce((sum, item) => sum + item.totalPrice, 0)
          .toFixed(2),
      );
      computedUnitPrice =
        computedTotalMiners > 0
          ? parseFloat((computedTotalAmount / computedTotalMiners).toFixed(2))
          : 0;
    }

    // Fetch customer to get their Luxor identifier for the invoice number
    // prefix. PoolAuth is the source of truth; luxorSubaccountName is a
    // fallback for any row the dual-write hasn't caught up on.
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        name: true,
        luxorSubaccountName: true,
        poolAuths: {
          where: { pool: { name: "Luxor" } },
          select: { authKey: true },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Prefer the Luxor subaccount identifier; fall back to the customer's
    // first name when no subaccount is assigned so invoice numbers stay
    // human-readable instead of blocking invoice creation.
    const luxorIdentifier =
      customer.poolAuths[0]?.authKey ||
      customer.luxorSubaccountName ||
      customer.name?.trim().split(/\s+/)[0] ||
      "Customer";

    // Generate invoice number: luxorIdentifier-YYYYMMDD-sequence
    const timestamp = new Date();
    const dateStr = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}`;

    // Get last invoice for this customer (cumulative counter, not daily)
    const customerLastInvoice = await prisma.invoice.findFirst({
      where: {
        userId: customerId,
      },
      select: { invoiceNumber: true },
      orderBy: { createdAt: "desc" },
    });

    // Extract sequence number from last invoice and increment
    // Format: subaccount-YYYYMMDD-XXX where XXX is the sequence
    const lastSeq = customerLastInvoice
      ? parseInt(
          customerLastInvoice.invoiceNumber.split("-").pop() || "0",
          10,
        ) || 0
      : 0;
    const sequenceNumber = String(lastSeq + 1).padStart(3, "0");
    const invoiceNumber = `${luxorIdentifier}-${dateStr}-${sequenceNumber}`;

    const numericUnitPrice = hasLineItems
      ? (computedUnitPrice as number)
      : Number(unitPrice);

    const totalAmount = hasLineItems
      ? (computedTotalAmount as number)
      : parseFloat((totalMiners * numericUnitPrice).toFixed(2));

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        userId: customerId,
        hardwareId: hasLineItems ? undefined : hardwareId || undefined,
        totalMiners: hasLineItems ? computedTotalMiners : totalMiners,
        unitPrice: numericUnitPrice,
        totalAmount,
        status: status || InvoiceStatus.DRAFT,
        invoiceType: invoiceType || "ELECTRICITY_CHARGES",
        invoiceGeneratedDate: invoiceGeneratedDate
          ? new Date(invoiceGeneratedDate)
          : timestamp,
        dueDate: new Date(dueDate),
        billingMonth: billingMonth
          ? normalizeBillingMonth(billingMonth)
          : undefined,
        machineHostingLocation:
          typeof machineHostingLocation === "string" &&
          machineHostingLocation.trim()
            ? machineHostingLocation.trim()
            : undefined,
        createdBy: userId,
        lineItems: hasLineItems ? { create: validatedLineItems } : undefined,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
        lineItems: true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CREATED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice ${invoice.invoiceNumber} created for customer ${customerId}`,
        changes: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount.toString(),
          status: invoice.status,
        }),
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Create invoice error:", error);
    return NextResponse.json(
      { error: "Failed to create invoice" },
      { status: 500 },
    );
  }
}

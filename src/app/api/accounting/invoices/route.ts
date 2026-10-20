import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import {
  HOSTING_INELIGIBLE_ERROR,
  isHostingEligibleSegment,
} from "@/lib/hostingEligibility";
import { InvoiceStatus, AuditAction } from "@prisma/client";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";
import { costPaymentAccountOmit } from "@/lib/accounting/costPaymentAccounts";
import {
  validateStandardLineItems,
  type ValidatedLineItems,
} from "@/lib/accounting/invoiceLineItems";
import {
  INVOICE_NUMBER_CUSTOMER_SELECT,
  nextInvoiceNumber,
} from "./invoiceNumber";
import { createRepairInvoice } from "./repair";
import { simRoute } from "@/lib/simulation/context";
import { loadSimInvoice } from "@/lib/simulation/invoice";
import {
  buildInvoiceListWhere,
  buildInvoiceOrderBy,
  DEFAULT_INVOICE_ORDER,
  isInMemoryInvoiceSort,
  parseInvoiceListSort,
  sortInvoicesInMemory,
} from "./query";

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

    // Anyone who isn't staff or a franchisee (clients, simulated accounts, any
    // future role) may only ask for their own invoices.
    if (
      customerId &&
      userRole !== "ADMIN" &&
      userRole !== "SUPER_ADMIN" &&
      userRole !== "FRANCHISEE" &&
      customerId !== decoded.userId
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      customerId &&
      userRole === "FRANCHISEE" &&
      customerId !== decoded.userId &&
      !(await assertFranchiseeOwnsCustomer(decoded.userId, customerId))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!customerId && userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can access invoices" },
        { status: 403 },
      );
    }

    // Simulated accounts: their one view-only hardware + hosting invoice,
    // built in code (never in the invoices table).
    const sim = await simRoute(decoded, async (ctx) =>
      NextResponse.json({
        invoices: [await loadSimInvoice(ctx)],
        pagination: {
          page: 1,
          limit: parseInt(searchParams.get("limit") || "10", 10),
          total: 1,
          pages: 1,
        },
      }),
    );
    if (sim) return sim;

    const { sortBy, sortDirection } = parseInvoiceListSort(searchParams);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const where = buildInvoiceListWhere(
      searchParams,
      userRole === "ADMIN" || userRole === "SUPER_ADMIN",
    );

    const skip = (page - 1) * limit;

    const include: Record<string, unknown> = {
      user: { select: { id: true, email: true, name: true } },
      // Customers and franchisees don't get voided payments or the
      // payment-account columns (§2c P2-5, P2-7).
      costPayments:
        userRole === "ADMIN" || userRole === "SUPER_ADMIN"
          ? true
          : { where: { isDeleted: false }, omit: costPaymentAccountOmit },
      // Hardware Repair invoices: the repaired miner (null for other types).
      miner: { select: { id: true, name: true, serialNumber: true } },
    };

    // Only include createdByUser when customerId is not passed
    if (!customerId) {
      include.createdByUser = { select: { id: true, email: true, name: true } };
    }

    let invoices;
    let total;

    if (isInMemoryInvoiceSort(sortBy)) {
      const allMatchingInvoices = await prisma.invoice.findMany({
        where,
        include,
        orderBy: DEFAULT_INVOICE_ORDER,
      });

      const sorted = sortInvoicesInMemory(
        allMatchingInvoices,
        sortBy,
        sortDirection,
      );

      total = sorted.length;
      invoices = sorted.slice(skip, skip + limit);
    } else {
      [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include,
          orderBy: buildInvoiceOrderBy(sortBy, sortDirection),
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
      (!Array.isArray(machineHostingLocation) ||
        machineHostingLocation.some((loc) => typeof loc !== "string"))
    ) {
      return NextResponse.json(
        { error: "machineHostingLocation must be an array of strings" },
        { status: 400 },
      );
    }

    const normalizedMachineHostingLocation: string[] = Array.isArray(
      machineHostingLocation,
    )
      ? Array.from(
          new Set(
            machineHostingLocation
              .map((loc: string) => loc.trim())
              .filter((loc: string) => loc.length > 0),
          ),
        )
      : [];

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

    // Hardware Repair invoices have their own line items, discount, miner
    // and repair note.
    if (invoiceType === "HARDWARE_REPAIR") {
      return await createRepairInvoice({
        body,
        userId,
        customerId,
        dueDate,
        invoiceGeneratedDate,
        machineHostingLocation: normalizedMachineHostingLocation,
      });
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
    let validated: ValidatedLineItems | null = null;

    if (hasLineItems) {
      const result = validateStandardLineItems(lineItems);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      validated = result;
      computedTotalMiners = result.totalMiners;
      computedUnitPrice = result.unitPrice;
      computedTotalAmount = result.totalAmount;
    }

    // Fetch customer to get their Luxor identifier for the invoice number
    // prefix - their oldest Luxor subaccount (PoolAuth), so it stays the same
    // no matter how many more they're given later.
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: INVOICE_NUMBER_CUSTOMER_SELECT,
    });

    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 },
      );
    }

    // Hosting invoices (the default type) are blocked for potential customers
    // and customers with no segment; hardware sales invoices are allowed.
    if (
      (invoiceType || "ELECTRICITY_CHARGES") === "ELECTRICITY_CHARGES" &&
      !isHostingEligibleSegment(customer.segment)
    ) {
      return NextResponse.json(
        { error: HOSTING_INELIGIBLE_ERROR },
        { status: 400 },
      );
    }

    // Generate invoice number: luxorIdentifier-YYYYMMDD-sequence
    const timestamp = new Date();
    const invoiceNumber = await nextInvoiceNumber(
      customerId,
      customer,
      timestamp,
    );

    const numericUnitPrice = hasLineItems
      ? (computedUnitPrice as number)
      : Number(unitPrice);

    const totalAmount = hasLineItems
      ? (computedTotalAmount as number)
      : parseFloat((totalMiners * numericUnitPrice).toFixed(2));

    // Discount rows reference their row's id, so they go in after the
    // invoice and its other rows exist.
    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
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
          machineHostingLocation: normalizedMachineHostingLocation,
          createdBy: userId,
          lineItems: validated ? { create: validated.parentRows } : undefined,
        },
      });
      if (validated && validated.discountRows.length > 0) {
        await tx.invoiceLineItem.createMany({
          data: validated.discountRows.map((row) => ({
            ...row,
            invoiceId: created.id,
          })),
        });
      }
      return tx.invoice.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          user: { select: { id: true, email: true, name: true } },
          createdByUser: { select: { id: true, email: true, name: true } },
          lineItems: true,
        },
      });
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

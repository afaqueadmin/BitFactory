import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { AuditAction, InvoiceStatus } from "@/generated/prisma";

// Generate invoices from recurring invoice templates
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
        { error: "Only administrators can generate invoices" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { customerId, month, year } = body;

    if (!customerId || !month || !year) {
      return NextResponse.json(
        { error: "Missing required fields: customerId, month, year" },
        { status: 400 },
      );
    }

    // Get recurring invoice for the customer
    const recurringInvoice = await prisma.recurringInvoice.findFirst({
      where: {
        userId: customerId,
        isActive: true,
      },
    });

    if (!recurringInvoice) {
      return NextResponse.json(
        { error: "No active recurring invoice found for this customer" },
        { status: 404 },
      );
    }

    // Get pricing config for the customer
    const targetDate = new Date(year, month - 1, 1);
    const pricingConfig = await prisma.customerPricingConfig.findFirst({
      where: {
        userId: customerId,
        effectiveFrom: { lte: targetDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: targetDate } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });

    const unitPrice =
      pricingConfig?.defaultUnitPrice || recurringInvoice.unitPrice;

    if (!unitPrice) {
      return NextResponse.json(
        { error: "No pricing information available for this customer" },
        { status: 400 },
      );
    }

    // Get number of miners for the customer to calculate total
    const minerCount = await prisma.miner.findMany({
      where: { userId: customerId },
      select: { id: true },
    });

    const totalMiners = minerCount.length;

    if (totalMiners === 0) {
      return NextResponse.json(
        { error: "Customer has no miners" },
        { status: 400 },
      );
    }

    const totalAmount = parseFloat(
      (totalMiners * Number(unitPrice)).toFixed(2),
    );

    // Create invoice
    const timestamp = new Date(year, month - 1, 1);
    const invoiceNumber = `INV-${year}${String(month).padStart(2, "0")}-${customerId.slice(0, 6).toUpperCase()}`;

    // Note: dayOfMonth is 1-based (1-31), new Date uses 0-based month index
    const dueDate = new Date(year, month - 1, recurringInvoice.dayOfMonth);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        userId: customerId,
        totalMiners,
        unitPrice: Number(unitPrice),
        totalAmount,
        status: InvoiceStatus.ISSUED,
        invoiceGeneratedDate: timestamp,
        issuedDate: new Date(),
        dueDate,
        createdBy: userId,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        createdByUser: { select: { id: true, email: true, name: true } },
      },
    });

    // Update last generated date
    await prisma.recurringInvoice.update({
      where: { id: recurringInvoice.id },
      data: { lastGeneratedDate: new Date() },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        action: AuditAction.INVOICE_CREATED,
        entityType: "Invoice",
        entityId: invoice.id,
        userId,
        description: `Invoice auto-generated from recurring template for ${year}-${month}`,
        changes: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount.toString(),
          totalMiners: totalMiners.toString(),
          unitPrice: unitPrice.toString(),
        }),
      },
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("Generate invoice error:", error);
    return NextResponse.json(
      { error: "Failed to generate invoice" },
      { status: 500 },
    );
  }
}

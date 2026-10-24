import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import { getVendorDepositBalance } from "@/lib/accounting/vendorDeposit";

const adjustedSum = (rows: { amountUsd: unknown }[]) =>
  rows.reduce((sum, r) => sum + Number(r.amountUsd), 0);

/**
 * One vendor's security deposit detail: balance, the hardware purchases
 * that carry a deposit, every return/adjustment, and the vendor's Pending
 * invoices a deposit can still be applied to.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { vendorId } = await params;

    const vendor = await prisma.accountingVendor.findUnique({
      where: { id: vendorId },
      select: { id: true, name: true, isActive: true },
    });
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    const adjustmentSelect = {
      where: { type: "ADJUSTMENT" as const },
      select: { amountUsd: true },
    };
    const [balance, depositInvoices, movements, pendingHardware, pendingFarm] =
      await Promise.all([
        getVendorDepositBalance(prisma, vendorId),
        prisma.hardwarePurchaseInvoice.findMany({
          where: { vendorId, securityDeposit: { gt: 0 } },
          select: {
            id: true,
            invoiceNumber: true,
            hardwareDescription: true,
            billingDate: true,
            paymentStatus: true,
            securityDeposit: true,
          },
          orderBy: [{ billingDate: "desc" }, { id: "asc" }],
        }),
        prisma.vendorDepositMovement.findMany({
          where: { vendorId },
          include: {
            entity: { select: { name: true } },
            bank: { select: { name: true } },
            currency: { select: { code: true } },
            vendorInvoice: {
              select: { id: true, invoiceNumber: true, paymentStatus: true },
            },
            hardwarePurchase: {
              select: { id: true, invoiceNumber: true, paymentStatus: true },
            },
            createdByUser: { select: { name: true, email: true } },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        }),
        prisma.hardwarePurchaseInvoice.findMany({
          where: { vendorId, paymentStatus: "Pending" },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            depositAdjustments: adjustmentSelect,
          },
          orderBy: { billingDate: "asc" },
        }),
        prisma.vendorInvoice.findMany({
          where: { vendorId, paymentStatus: "Pending" },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            depositAdjustments: adjustmentSelect,
          },
          orderBy: { billingDate: "asc" },
        }),
      ]);

    const adjustable = [
      ...pendingFarm.map((i) => ({ ...i, kind: "farm" as const })),
      ...pendingHardware.map((i) => ({ ...i, kind: "hardware" as const })),
    ].map(({ depositAdjustments, ...i }) => {
      const adjusted = adjustedSum(depositAdjustments);
      return {
        kind: i.kind,
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        totalAmount: Number(i.totalAmount),
        adjusted,
        remaining: Number(i.totalAmount) - adjusted,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        vendor,
        balance: {
          pending: Number(balance.pending),
          paid: Number(balance.paid),
          returned: Number(balance.returned),
          adjusted: Number(balance.adjusted),
          held: Number(balance.held),
          outstanding: Number(balance.outstanding),
        },
        depositInvoices,
        movements,
        adjustableInvoices: adjustable.filter((i) => i.remaining > 0),
      },
    });
  } catch (error) {
    console.error("Error fetching vendor security deposit:", error);
    return NextResponse.json(
      { error: "Failed to fetch the vendor's security deposit" },
      { status: 500 },
    );
  }
}

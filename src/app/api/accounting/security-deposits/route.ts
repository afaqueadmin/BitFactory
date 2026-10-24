import { NextRequest, NextResponse } from "next/server";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  computeDepositBalance,
  DepositBalance,
  getDepositBalances,
} from "@/lib/accounting/vendorDeposit";

const toNumbers = (b: DepositBalance) => ({
  pending: Number(b.pending),
  paid: Number(b.paid),
  returned: Number(b.returned),
  adjusted: Number(b.adjusted),
  held: Number(b.held),
  outstanding: Number(b.outstanding),
});

/**
 * Security deposits per vendor (only vendors with any deposit activity),
 * plus the overall totals. totals.outstanding feeds the admin panel card.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;

    const balances = await getDepositBalances();
    const vendors = await prisma.accountingVendor.findMany({
      where: { id: { in: [...balances.keys()] } },
      select: { id: true, name: true, isActive: true },
      orderBy: { name: "asc" },
    });

    const zero = new Decimal(0);
    const totals = computeDepositBalance({
      pending: zero,
      paid: zero,
      returned: zero,
      adjusted: zero,
    });
    for (const b of balances.values()) {
      totals.pending = totals.pending.plus(b.pending);
      totals.paid = totals.paid.plus(b.paid);
      totals.returned = totals.returned.plus(b.returned);
      totals.adjusted = totals.adjusted.plus(b.adjusted);
      totals.held = totals.held.plus(b.held);
      totals.outstanding = totals.outstanding.plus(b.outstanding);
    }

    return NextResponse.json({
      success: true,
      data: {
        vendors: vendors.map((v) => ({
          ...v,
          ...toNumbers(balances.get(v.id)!),
        })),
        totals: toNumbers(totals),
      },
    });
  } catch (error) {
    console.error("Error fetching security deposits:", error);
    return NextResponse.json(
      { error: "Failed to fetch security deposits" },
      { status: 500 },
    );
  }
}

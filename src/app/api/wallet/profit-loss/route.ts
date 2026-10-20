import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { simRoute } from "@/lib/simulation/context";
import { loadSimInvoice } from "@/lib/simulation/invoice";
import { ledgerElectricityTotal } from "@/lib/simulation/ledger";
import { loadSimLedger } from "@/lib/simulation/ledgerStore";
import { resolveWalletTarget } from "@/lib/walletTarget";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallet/profit-loss
 *
 * Cost side of the customer's P&L: total of all paid electricity/hosting
 * invoices plus all paid hardware sales invoices. Revenue (all-time BTC
 * mined) is already available client-side via /api/wallet/earnings-summary,
 * so it isn't duplicated here.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const target = await resolveWalletTarget(
      decoded,
      request.nextUrl.searchParams.get("customerId"),
    );
    if (target instanceof NextResponse) return target;

    // Simulated accounts: electricity is the simulated daily charges so far;
    // hardware is the simulated Hardware Sales invoice, shown as paid.
    const sim = await simRoute(target, async (ctx) => {
      const [ledger, invoice] = await Promise.all([
        loadSimLedger(ctx.userId),
        loadSimInvoice(ctx),
      ]);
      const electricity = ledgerElectricityTotal(ledger);
      const hardware = invoice.totalAmount;
      return NextResponse.json(
        {
          totals: {
            electricityCostTotal: parseFloat(electricity.toFixed(2)),
            hardwareCostTotal: parseFloat(hardware.toFixed(2)),
            totalCosts: parseFloat((electricity + hardware).toFixed(2)),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
    if (sim) return sim;

    const userId = target.userId;

    const [electricityInvoices, hardwareInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          userId,
          invoiceType: "ELECTRICITY_CHARGES",
          status: "PAID",
        },
        select: { totalAmount: true },
      }),
      prisma.invoice.findMany({
        where: { userId, invoiceType: "HARDWARE_SALES", status: "PAID" },
        select: { totalAmount: true },
      }),
    ]);

    const electricityCostTotal = electricityInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0,
    );
    const hardwareCostTotal = hardwareInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0,
    );

    return NextResponse.json(
      {
        totals: {
          electricityCostTotal: parseFloat(electricityCostTotal.toFixed(2)),
          hardwareCostTotal: parseFloat(hardwareCostTotal.toFixed(2)),
          totalCosts: parseFloat(
            (electricityCostTotal + hardwareCostTotal).toFixed(2),
          ),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[Profit Loss API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profit & loss data" },
      { status: 500 },
    );
  }
}

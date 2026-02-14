import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/payback-config
 *
 * Fetches the payback configuration and user's invoiced amount
 * for payback analysis calculations.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
    let userId: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
    } catch (error) {
      console.error("[Payback Config API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch the payback config
    const config = await prisma.paybackConfig.findFirst();

    if (!config) {
      return NextResponse.json(
        {
          error:
            "Payback configuration not found. Please contact administrator.",
        },
        { status: 404 },
      );
    }

    // Fetch user's invoiced amount
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { invoicedAmount: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Convert Decimal values to numbers for JSON serialization
    const responseData = {
      hostingCharges: Number(config.hostingCharges),
      monthlyInvoicingAmount: Number(config.monthlyInvoicingAmount),
      powerConsumption: Number(config.powerConsumption),
      machineCapitalCost: Number(config.machineCapitalCost),
      poolCommission: Number(config.poolCommission),
      s21proHashrateStockOs: Number(config.s21proHashrateStockOs),
      s21proHashrateLuxos: Number(config.s21proHashrateLuxos),
      breakevenBtcPrice: Number(config.breakevenBtcPrice),
      invoicedAmount: Number(user.invoicedAmount),
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("[Payback Config API] Error fetching config:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch configuration",
      },
      { status: 500 },
    );
  }
}

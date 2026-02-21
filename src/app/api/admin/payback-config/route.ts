import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * GET /api/admin/payback-config
 *
 * Fetches the current payback configuration values.
 * Returns the first config record or creates a default one if none exists.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and check admin role
    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Payback Config API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only admins and super admins can access this endpoint
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch the first config record (or create default if none exists)
    let config = await prisma.paybackConfig.findFirst();

    if (!config) {
      // Create default config
      config = await prisma.paybackConfig.create({
        data: {
          hostingCharges: new Decimal("0.06300"),
          monthlyInvoicingAmount: new Decimal("199.05"),
          powerConsumption: new Decimal("3.5000"),
          machineCapitalCost: new Decimal("4050.95"),
          poolCommission: new Decimal("2.50"),
          s21proHashrateStockOs: new Decimal("236.00"),
          s21proHashrateLuxos: new Decimal("252.00"),
          breakevenBtcPrice: new Decimal("63500.00"),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("[Payback Config API] Error fetching config:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch config",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/payback-config
 *
 * Updates the payback configuration values.
 * Only admin users can update these values.
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and check admin role
    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error("[Payback Config API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only admins and super admins can access this endpoint
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();

    // Validate and convert values to Decimal
    const updateData: Record<string, Decimal | undefined> = {};

    // Helper function to validate and convert to Decimal
    const toDecimalIfValid = (value: unknown): Decimal | undefined => {
      if (value === undefined || value === null || value === "") {
        return undefined;
      }
      const numValue =
        typeof value === "string" ? parseFloat(value) : Number(value);
      if (isNaN(numValue)) {
        return undefined;
      }
      return new Decimal(numValue);
    };

    const hostingCharges = toDecimalIfValid(body.hostingCharges);
    if (hostingCharges !== undefined) {
      updateData.hostingCharges = hostingCharges;
    }

    const monthlyInvoicingAmount = toDecimalIfValid(
      body.monthlyInvoicingAmount,
    );
    if (monthlyInvoicingAmount !== undefined) {
      updateData.monthlyInvoicingAmount = monthlyInvoicingAmount;
    }

    const powerConsumption = toDecimalIfValid(body.powerConsumption);
    if (powerConsumption !== undefined) {
      updateData.powerConsumption = powerConsumption;
    }

    const machineCapitalCost = toDecimalIfValid(body.machineCapitalCost);
    if (machineCapitalCost !== undefined) {
      updateData.machineCapitalCost = machineCapitalCost;
    }

    const poolCommission = toDecimalIfValid(body.poolCommission);
    if (poolCommission !== undefined) {
      updateData.poolCommission = poolCommission;
    }

    const s21proHashrateStockOs = toDecimalIfValid(body.s21proHashrateStockOs);
    if (s21proHashrateStockOs !== undefined) {
      updateData.s21proHashrateStockOs = s21proHashrateStockOs;
    }

    const s21proHashrateLuxos = toDecimalIfValid(body.s21proHashrateLuxos);
    if (s21proHashrateLuxos !== undefined) {
      updateData.s21proHashrateLuxos = s21proHashrateLuxos;
    }

    const breakevenBtcPrice = toDecimalIfValid(body.breakevenBtcPrice);
    if (breakevenBtcPrice !== undefined) {
      updateData.breakevenBtcPrice = breakevenBtcPrice;
    }

    // Get the first config record (or create if none exists)
    let config = await prisma.paybackConfig.findFirst();

    if (!config) {
      // Create new config with provided values
      config = await prisma.paybackConfig.create({
        data: {
          hostingCharges: updateData.hostingCharges || new Decimal("0.06300"),
          monthlyInvoicingAmount:
            updateData.monthlyInvoicingAmount || new Decimal("199.05"),
          powerConsumption:
            updateData.powerConsumption || new Decimal("3.5000"),
          machineCapitalCost:
            updateData.machineCapitalCost || new Decimal("4050.95"),
          poolCommission: updateData.poolCommission || new Decimal("2.50"),
          s21proHashrateStockOs:
            updateData.s21proHashrateStockOs || new Decimal("236.00"),
          s21proHashrateLuxos:
            updateData.s21proHashrateLuxos || new Decimal("252.00"),
          breakevenBtcPrice:
            updateData.breakevenBtcPrice || new Decimal("63500.00"),
        },
      });
    } else {
      // Update existing config
      config = await prisma.paybackConfig.update({
        where: { id: config.id },
        data: updateData,
      });
    }

    console.log(`[Payback Config API] Config updated by admin ${userId}`);

    return NextResponse.json({
      success: true,
      data: config,
      message: "Configuration updated successfully",
    });
  } catch (error) {
    console.error("[Payback Config API] Error updating config:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update config",
      },
      { status: 500 },
    );
  }
}

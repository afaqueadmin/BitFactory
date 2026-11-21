import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

// GET /api/settings/payment - Fetch payment settings
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authorizeStaff(request, [
      "payment_settings.view",
      "invoicing.create",
      "invoicing.edit",
    ]);
    if ("response" in auth) return auth.response;

    // Fetch payment settings
    const settings = await prisma.paymentDetails.findFirst();

    return NextResponse.json({
      success: true,
      data: settings || {
        confirmoEnabled: false,
        confirmoSettlementCurrency: "USDC",
        confirmoReturnUrl: null,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error fetching payment settings:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

// PUT /api/settings/payment - Update payment settings
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authorizeStaff(request, ["payment_settings.edit"]);
    if ("response" in auth) return auth.response;
    const decoded = auth.decoded;

    // Parse request body
    const body = await request.json();
    const { confirmoEnabled, confirmoSettlementCurrency, confirmoReturnUrl } =
      body;

    // Get existing settings or create new one
    let settings = await prisma.paymentDetails.findFirst();

    if (settings) {
      // Update existing settings
      settings = await prisma.paymentDetails.update({
        where: { id: settings.id },
        data: {
          confirmoEnabled: confirmoEnabled ?? settings.confirmoEnabled,
          confirmoSettlementCurrency:
            confirmoSettlementCurrency ?? settings.confirmoSettlementCurrency,
          confirmoReturnUrl: confirmoReturnUrl ?? settings.confirmoReturnUrl,
        },
      });
    } else {
      // Create new settings
      settings = await prisma.paymentDetails.create({
        data: {
          confirmoEnabled: confirmoEnabled ?? false,
          confirmoSettlementCurrency: confirmoSettlementCurrency ?? "USDC",
          confirmoReturnUrl: confirmoReturnUrl ?? null,
          paymentOption3Details: "",
        },
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: "INVOICE_UPDATED", // Using existing enum value
        entityType: "PaymentDetails",
        entityId: settings.id,
        userId: decoded.userId,
        description: "Payment settings updated",
        changes: {
          confirmoEnabled,
          confirmoSettlementCurrency,
          confirmoReturnUrl,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Settings updated successfully",
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error updating payment settings:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update settings" },
      { status: 500 },
    );
  }
}

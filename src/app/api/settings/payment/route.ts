import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

// GET /api/settings/payment - Fetch payment settings
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    ) as { userId: string };
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

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
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key",
    ) as { userId: string };
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { role: true },
    });

    if (user?.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

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

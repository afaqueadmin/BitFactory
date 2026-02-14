import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * PATCH /api/user/invoiced-amount
 *
 * Updates the invoiced amount for the authenticated CLIENT user.
 * Only CLIENT users can update their invoiced amount in the database.
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    let userId: string;
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userId = decoded.userId;
      userRole = decoded.role;
    } catch (error) {
      console.error(
        "[Update Invoiced Amount] Token verification failed:",
        error,
      );
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only CLIENT users can update their invoiced amount
    if (userRole !== "CLIENT") {
      return NextResponse.json(
        { error: "Only clients can update invoiced amount" },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { invoicedAmount } = body;

    if (invoicedAmount === undefined || invoicedAmount === null) {
      return NextResponse.json(
        { error: "Invoiced amount is required" },
        { status: 400 },
      );
    }

    // Validate and convert to number
    const numValue =
      typeof invoicedAmount === "string"
        ? parseFloat(invoicedAmount)
        : Number(invoicedAmount);

    if (isNaN(numValue) || numValue < 0) {
      return NextResponse.json(
        { error: "Invalid invoiced amount value" },
        { status: 400 },
      );
    }

    // Update user's invoiced amount
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        invoicedAmount: new Decimal(numValue),
      },
      select: {
        id: true,
        invoicedAmount: true,
      },
    });

    console.log(
      `[Update Invoiced Amount] User ${userId} updated to ${numValue}`,
    );

    return NextResponse.json({
      success: true,
      data: {
        invoicedAmount: updatedUser.invoicedAmount,
      },
      message: "Invoiced amount updated successfully",
    });
  } catch (error) {
    console.error("[Update Invoiced Amount] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update invoiced amount",
      },
      { status: 500 },
    );
  }
}

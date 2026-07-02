import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { serializePaybackConfig } from "@/lib/paybackConfigHelpers";

/**
 * GET /api/payback-config-company
 *
 * Fetches the COMPANY (self-mining) payback configuration for payback
 * analysis calculations. Admin-only, since this is internal company data
 * rather than a client-facing profile.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error("[Payback Config API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await prisma.paybackConfig.findFirst({
      where: { profileType: "COMPANY" },
    });

    if (!config) {
      return NextResponse.json(
        {
          error:
            "Company payback configuration not found. Please contact administrator.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: serializePaybackConfig(config),
      userRole: userRole,
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

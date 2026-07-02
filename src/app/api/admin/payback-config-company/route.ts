import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import {
  getOrCreatePaybackConfig,
  updatePaybackConfig,
} from "@/lib/paybackConfigHelpers";

/**
 * GET /api/admin/payback-config-company
 *
 * Fetches the current payback configuration values for the COMPANY
 * (self-mining) profile. Returns the first config record or creates a
 * default one if none exists.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and check admin role
    let userRole: string;
    try {
      const decoded = await verifyJwtToken(token);
      userRole = decoded.role;
    } catch (error) {
      console.error("[Payback Config API] Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Only admins and super admins can access this endpoint
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = await getOrCreatePaybackConfig("COMPANY");

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
 * PATCH /api/admin/payback-config-company
 *
 * Updates the payback configuration values for the COMPANY (self-mining)
 * profile. Only admin users can update these values.
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

    const body = await request.json();
    const config = await updatePaybackConfig("COMPANY", body);

    console.log(
      `[Payback Config API] Company config updated by admin ${userId}`,
    );

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

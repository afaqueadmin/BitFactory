import { NextRequest, NextResponse } from "next/server";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
import {
  getOrCreatePaybackConfig,
  updatePaybackConfig,
} from "@/lib/paybackConfigHelpers";

/**
 * GET /api/admin/payback-config
 *
 * Fetches the current payback configuration values for the CLIENT profile.
 * Returns the first config record or creates a default one if none exists.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "customer_payback.view");
    if (denied) return denied;

    const config = await getOrCreatePaybackConfig("CLIENT");

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
 * Updates the payback configuration values for the CLIENT profile.
 * Only admin users can update these values.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "customer_payback.edit_settings");
    if (denied) return denied;
    const userId = ctx.userId;

    const body = await request.json();
    const config = await updatePaybackConfig("CLIENT", body);

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

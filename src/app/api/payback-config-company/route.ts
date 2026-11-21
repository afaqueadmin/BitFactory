import { NextRequest, NextResponse } from "next/server";
import {
  getAuthorizationContext,
  requirePermission,
} from "@/lib/auth/authorization";
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
    const ctx = await getAuthorizationContext(request);
    if ("response" in ctx) return ctx.response;
    const denied = requirePermission(ctx, "company_payback.view");
    if (denied) return denied;
    const userRole = ctx.role;

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

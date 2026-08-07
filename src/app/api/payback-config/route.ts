import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  getOrCreatePaybackConfig,
  serializePaybackConfig,
} from "@/lib/paybackConfigHelpers";
import { resolvePaybackAccountType } from "@/lib/helpers/paybackAccountType";

/**
 * GET /api/payback-config
 *
 * Fetches the payback configuration for payback analysis calculations.
 * Self-mining accounts (User.segment === "SELF_MINING", e.g. "Higgs Self
 * Mining") get the COMPANY profile instead of CLIENT — there's no client
 * invoice for a self-mining account, so `invoicedAmount` is omitted for
 * those accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token and extract user ID
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

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { invoicedAmount: true, segment: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const accountType = resolvePaybackAccountType(user.segment);

    if (accountType === "SELF_MINING") {
      const companyConfig = await getOrCreatePaybackConfig("COMPANY");

      return NextResponse.json({
        success: true,
        data: {
          ...serializePaybackConfig(companyConfig),
          invoicedAmount: 0,
        },
        userRole,
        accountType,
      });
    }

    // Fetch the CLIENT payback config
    const config = await prisma.paybackConfig.findFirst({
      where: { profileType: "CLIENT" },
    });

    if (!config) {
      return NextResponse.json(
        {
          error:
            "Payback configuration not found. Please contact administrator.",
        },
        { status: 404 },
      );
    }

    const responseData = {
      ...serializePaybackConfig(config),
      invoicedAmount: Number(user.invoicedAmount),
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      userRole,
      accountType,
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

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

/**
 * GET /api/user/subaccounts/existing
 *
 * Fetch all luxor subaccount names that are already assigned to users in the database.
 * Used when creating new users to filter out already-assigned subaccounts from the dropdown.
 *
 * Returns list of subaccount names that should be excluded from selection.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify token (just to ensure user is authenticated)
    try {
      await verifyJwtToken(token);
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch all non-null luxorSubaccountName values from database, plus all
    // Luxor PoolAuth.authKey values. Unioned because some users (notably
    // Franchisees) are only ever written to luxorSubaccountName, not PoolAuth.
    const [usersWithSubaccounts, luxorPoolAuths] = await Promise.all([
      prisma.user.findMany({
        where: { luxorSubaccountName: { not: null } },
        select: { luxorSubaccountName: true },
      }),
      prisma.poolAuth.findMany({
        where: { pool: { name: "Luxor" } },
        select: { authKey: true },
      }),
    ]);

    const existingSubaccounts = Array.from(
      new Set([
        ...(usersWithSubaccounts
          .map((user) => user.luxorSubaccountName)
          .filter(Boolean) as string[]),
        ...luxorPoolAuths.map((pa) => pa.authKey),
      ]),
    );

    console.log(
      `[API] Found ${existingSubaccounts.length} assigned subaccounts in database:`,
      existingSubaccounts,
    );

    return NextResponse.json({
      success: true,
      data: existingSubaccounts.map((name) => ({
        luxorSubaccountName: name,
      })),
      count: existingSubaccounts.length,
    });
  } catch (error) {
    console.error("[API] Error fetching existing subaccounts:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch existing subaccounts",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

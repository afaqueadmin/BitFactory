import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "@/lib/jwt";
import { listAssignedLuxorSubaccountNames } from "@/lib/luxorSubaccounts";

/**
 * GET /api/user/subaccounts/existing
 *
 * Fetch all luxor subaccount names that are already assigned to users in the database.
 * Used when creating new users to filter out already-assigned subaccounts from the dropdown.
 *
 * Returns `data: string[]` - subaccount names that should be excluded from selection.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch (error) {
      console.error("Token verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Subaccount assignment is an admin-only capability — franchisees must
    // not be able to view which Luxor subaccounts exist/are taken.
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only administrators can view subaccount assignments" },
        { status: 403 },
      );
    }

    // Every Luxor subaccount assigned to any user (one PoolAuth row each).
    const existingSubaccounts = await listAssignedLuxorSubaccountNames();

    console.log(
      `[API] Found ${existingSubaccounts.length} assigned subaccounts in database:`,
      existingSubaccounts,
    );

    return NextResponse.json({
      success: true,
      data: existingSubaccounts,
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

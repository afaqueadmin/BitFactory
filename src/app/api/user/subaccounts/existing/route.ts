import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
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
    const auth = await authorizeStaff(request, [
      "customers.view",
      "customers.create",
      "customers.edit",
      "franchisees.create",
      "franchisees.edit",
      "franchisees.approve_customer_requests",
    ]);
    if ("response" in auth) return auth.response;

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

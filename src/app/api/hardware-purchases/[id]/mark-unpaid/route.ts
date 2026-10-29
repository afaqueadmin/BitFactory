import { NextRequest, NextResponse } from "next/server";
import {
  markVendorSideUnpaid,
  requireSuperAdmin,
} from "@/lib/accounting/markVendorUnpaid";

/**
 * Reverts a Paid hardware purchase invoice to Pending and removes its
 * payment. SUPER_ADMIN only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSuperAdmin(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    return await markVendorSideUnpaid("hardware", id, auth.userId);
  } catch (error) {
    console.error("Error marking hardware purchase as unpaid:", error);
    return NextResponse.json(
      { error: "Failed to mark invoice as unpaid" },
      { status: 500 },
    );
  }
}

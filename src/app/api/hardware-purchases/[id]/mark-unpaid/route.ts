import { NextRequest, NextResponse } from "next/server";
import { authorizeStaff } from "@/lib/auth/authorization";
import {
  markVendorSideUnpaid,
  vendorUnpaidPreview,
} from "@/lib/accounting/markVendorUnpaid";
import { readConfirm } from "@/lib/accounting/invoiceBankEffect";

/** What Mark Unpaid would remove from the bank statements (no change made). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, [
      "hardware_purchases.mark_unpaid",
    ]);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return await vendorUnpaidPreview("hardware", id);
  } catch (error) {
    console.error("Error previewing hardware purchase unpaid:", error);
    return NextResponse.json(
      { error: "Failed to load the bank statement effect" },
      { status: 500 },
    );
  }
}

/**
 * Reverts a Paid hardware purchase invoice to Pending and removes its
 * payment. SUPER_ADMIN only. When that removes bank statement rows the body
 * must carry { confirmBankEffect: true }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeStaff(request, [
      "hardware_purchases.mark_unpaid",
    ]);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    return await markVendorSideUnpaid(
      "hardware",
      id,
      auth.userId,
      await readConfirm(request),
    );
  } catch (error) {
    console.error("Error marking hardware purchase as unpaid:", error);
    return NextResponse.json(
      { error: "Failed to mark invoice as unpaid" },
      { status: 500 },
    );
  }
}

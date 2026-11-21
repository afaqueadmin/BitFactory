import { NextRequest, NextResponse } from "next/server";
import {
  markVendorSideUnpaid,
  requireSuperAdmin,
  vendorUnpaidPreview,
} from "@/lib/accounting/markVendorUnpaid";
import { readConfirm } from "@/lib/accounting/invoiceBankEffect";

/** What Mark Unpaid would remove from the bank statements (no change made). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSuperAdmin(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return await vendorUnpaidPreview("farm", id);
  } catch (error) {
    console.error("Error previewing vendor invoice unpaid:", error);
    return NextResponse.json(
      { error: "Failed to load the bank statement effect" },
      { status: 500 },
    );
  }
}

/**
 * Reverts a Paid Farm Tariff invoice to Pending and removes its payment.
 * SUPER_ADMIN only. When that removes bank statement rows the body must
 * carry { confirmBankEffect: true }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSuperAdmin(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    return await markVendorSideUnpaid(
      "farm",
      id,
      auth.userId,
      await readConfirm(request),
    );
  } catch (error) {
    console.error("Error marking vendor invoice as unpaid:", error);
    return NextResponse.json(
      { error: "Failed to mark invoice as unpaid" },
      { status: 500 },
    );
  }
}

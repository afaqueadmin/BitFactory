import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  recordVendorSidePayment,
  RecordVendorPaymentWithDepositRequest,
} from "@/lib/accounting/recordVendorPayment";

/**
 * Records the payment of a Pending Farm Tariff invoice and marks it Paid,
 * optionally applying part of the vendor's held security deposit.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const { id } = await params;

    const body: RecordVendorPaymentWithDepositRequest = await request.json();
    return await recordVendorSidePayment("farm", id, auth.userId, body);
  } catch (error) {
    console.error("Error recording vendor invoice payment:", error);
    return NextResponse.json(
      { error: "Failed to record payment" },
      { status: 500 },
    );
  }
}

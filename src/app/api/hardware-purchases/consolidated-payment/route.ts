import { NextRequest, NextResponse } from "next/server";
import { requireAccountingAdmin } from "@/lib/accounting/adminAuth";
import {
  consolidationCandidates,
  recordConsolidatedPayment,
  RecordConsolidatedPaymentRequest,
} from "@/lib/accounting/consolidatedVendorPayment";

/**
 * Consolidated payments of Hardware Purchase invoices: one bank transfer that paid
 * several of a vendor's invoices (credits included).
 *
 * GET ?vendorId=: the vendor's Pending Hardware Purchase invoices with what each
 * still has due in cash.
 * POST: { vendorId, invoiceIds, paidDate, part, receiptKey } - records the
 * transfer and marks every invoice in it Paid.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const vendorId = request.nextUrl.searchParams.get("vendorId");
    if (!vendorId) {
      return NextResponse.json({ error: "Choose the vendor" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      data: await consolidationCandidates("hardware", vendorId),
    });
  } catch (error) {
    console.error("Error loading invoices for a consolidated payment:", error);
    return NextResponse.json(
      { error: "Failed to load the vendor's pending invoices" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountingAdmin(request);
    if ("response" in auth) return auth.response;
    const body: RecordConsolidatedPaymentRequest = await request.json();
    return await recordConsolidatedPayment("hardware", auth.userId, body);
  } catch (error) {
    console.error("Error recording a consolidated payment:", error);
    return NextResponse.json(
      { error: "Failed to record the consolidated payment" },
      { status: 500 },
    );
  }
}

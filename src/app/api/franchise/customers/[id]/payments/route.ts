/**
 * POST /api/franchise/customers/[id]/payments
 *
 * Lets a franchisee record a manual payment (e.g. a startup deposit) for one
 * of their own customers. FRANCHISEE role only, ownership-checked. Mirrors
 * the "PAYMENT" cost-payment type the admin AddPaymentModal creates via
 * /api/cost-payments, but as an independent franchise-facing route.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";
import { assertFranchiseeOwnsCustomer } from "@/lib/franchiseeScope";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = request.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let decoded;
    try {
      decoded = await verifyJwtToken(token);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid token" },
        { status: 401 },
      );
    }

    if (decoded.role !== "FRANCHISEE") {
      return NextResponse.json(
        { success: false, error: "Franchisee access required" },
        { status: 403 },
      );
    }

    const owns = await assertFranchiseeOwnsCustomer(decoded.userId, id);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
      );
    }

    const { amount } = await request.json();
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Amount must be a positive number" },
        { status: 400 },
      );
    }

    await prisma.costPayment.create({
      data: {
        userId: id,
        amount,
        consumption: 0,
        type: "PAYMENT",
      },
    });

    return NextResponse.json(
      { success: true, message: "Payment added successfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Franchise Customers API] payments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add payment" },
      { status: 500 },
    );
  }
}

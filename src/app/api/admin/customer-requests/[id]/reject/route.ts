/**
 * POST /api/admin/customer-requests/[id]/reject
 *
 * Rejects a pending franchisee customer request. ADMIN/SUPER_ADMIN only.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

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

    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 },
      );
    }

    const customerRequest = await prisma.franchiseCustomerRequest.findUnique({
      where: { id },
    });

    if (!customerRequest) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    if (customerRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          success: false,
          error: `Request has already been ${customerRequest.status.toLowerCase()}`,
        },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

    await prisma.franchiseCustomerRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: decoded.userId,
        reviewedAt: new Date(),
        rejectionReason: reason || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Request rejected",
    });
  } catch (error) {
    console.error("[Admin Customer Requests API] reject error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to reject request" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/customer-requests
 *
 * Lists franchisee-submitted customer requests for admin review/approval.
 * ADMIN/SUPER_ADMIN only. Optional ?status=PENDING|APPROVED|REJECTED filter
 * (defaults to all).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function GET(request: NextRequest) {
  try {
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

    const status = request.nextUrl.searchParams.get("status");
    const validStatuses = ["PENDING", "APPROVED", "REJECTED"];

    const requests = await prisma.franchiseCustomerRequest.findMany({
      where:
        status && validStatuses.includes(status)
          ? { status: status as "PENDING" | "APPROVED" | "REJECTED" }
          : {},
      orderBy: { createdAt: "desc" },
      include: {
        franchise: {
          select: { id: true, businessName: true, franchiseCode: true },
        },
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error) {
    console.error("[Admin Customer Requests API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer requests" },
      { status: 500 },
    );
  }
}

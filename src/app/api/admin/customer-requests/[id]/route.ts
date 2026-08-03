/**
 * DELETE /api/admin/customer-requests/[id]
 *
 * Deletes a franchisee customer request record. ADMIN/SUPER_ADMIN only.
 * Safe for requests in any status — deleting an APPROVED request only
 * removes the request log entry, not the customer User it created.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwtToken } from "@/lib/jwt";

export async function DELETE(
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

    await prisma.franchiseCustomerRequest.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "Request deleted",
    });
  } catch (error) {
    console.error("[Admin Customer Requests API] delete error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete request" },
      { status: 500 },
    );
  }
}
